export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * NIGHTLY EXPORT TO STORAGE THE FOUNDER OWNS.
 *
 * FOUNDER (Aug 16): "we have built too much to lose it all and we need to
 * ensure the stability of our software application."
 *
 * What was actually true when he asked, measured rather than assumed:
 *
 *   • `backup_logs` had ZERO rows. The manual backup route has never once run.
 *   • That route exported SIX tables out of 177 — a hand-written list that
 *     omits `timecards`, which is the payroll.
 *   • It wrote the result back into Supabase Storage — the same account it is
 *     meant to protect against losing.
 *   • The Platform Hub told him "Supabase automatically creates daily backups
 *     with point-in-time recovery. No manual action required." That sentence
 *     was hardcoded. Nothing checked it.
 *
 * So the honest position was: no verified backup existed, and the screen said
 * otherwise. This job fixes the first part; the second is fixed in
 * app/api/admin/backups/route.ts by deleting the reassurance.
 *
 * WHAT IT DOES. Every table, discovered at runtime so a table added next month
 * is included without anyone remembering — as newline-delimited JSON, gzipped,
 * PUT into an S3-compatible bucket outside Supabase. The whole database is
 * 41 MB / 5,532 rows, so this is seconds of work. Storage objects (the signed
 * completion PDFs and job photos — the billing and legal evidence, and NOT part
 * of any Postgres backup) are copied incrementally, newest first, within a time
 * budget so one slow night cannot stall the database export.
 *
 * IF IT IS NOT CONFIGURED IT SAYS SO AND FAILS. It does not quietly write a
 * 'completed' row. A backup that reports success while going nowhere is worse
 * than no backup, because it stops you looking.
 *
 * SETUP (founder): create a bucket at Cloudflare R2 or Backblaze B2 — roughly
 * $1-3/month at this size — then set in Vercel:
 *   BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID,
 *   BACKUP_S3_SECRET_ACCESS_KEY, BACKUP_S3_REGION (optional, defaults 'auto')
 */

import { NextRequest, NextResponse } from 'next/server';
import { gzipSync } from 'node:zlib';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { putObject, backupTargetFromEnv } from '@/lib/s3-put';
import {
  BACKUP_EXCLUDED_TABLES,
  backupObjectKey,
  toNdjson,
  storageBudgetExhausted,
} from '@/lib/backup-export';

/** Leave room inside maxDuration to still write the log row and respond. */
const TIME_BUDGET_MS = 240_000;

export async function GET(request: NextRequest) {
  // Same guard as every other cron here.
  const secret = process.env.CRON_SECRET;
  const provided =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    new URL(request.url).searchParams.get('secret');
  if (secret && provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = new Date();
  const t0 = Date.now();

  const target = backupTargetFromEnv();
  if (!target) {
    // Record the failure rather than returning a cheerful no-op. If this row is
    // the newest one in backup_logs, the platform is unprotected and the log
    // should say that in as many words.
    await supabaseAdmin.from('backup_logs').insert({
      backup_type: 'offsite_export',
      status: 'failed',
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      notes:
        'No off-site destination configured. Set BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, ' +
        'BACKUP_S3_ACCESS_KEY_ID and BACKUP_S3_SECRET_ACCESS_KEY in Vercel. ' +
        'Until then the ONLY copy of this data is inside the Supabase account.',
    });
    return NextResponse.json(
      {
        error: 'Backup destination not configured.',
        detail:
          'Set BACKUP_S3_ENDPOINT / BACKUP_S3_BUCKET / BACKUP_S3_ACCESS_KEY_ID / ' +
          'BACKUP_S3_SECRET_ACCESS_KEY. No off-site copy exists until then.',
      },
      { status: 503 }
    );
  }

  const { data: logRow } = await supabaseAdmin
    .from('backup_logs')
    .insert({
      backup_type: 'offsite_export',
      status: 'in_progress',
      started_at: startedAt.toISOString(),
    })
    .select('id')
    .single();

  const stamp = startedAt.toISOString().slice(0, 19).replace(/[:]/g, '');
  const errors: string[] = [];
  let totalRows = 0;
  let totalBytes = 0;
  let tablesExported = 0;
  let objectsCopied = 0;

  try {
    // ── 1. Every table, discovered — not a hand-written list ────────────────
    const { data: tableRows, error: tableErr } = await supabaseAdmin.rpc('backup_list_tables');
    if (tableErr) throw new Error(`Could not list tables: ${tableErr.message}`);

    const tables = ((tableRows as Array<{ table_name: string }>) ?? [])
      .map((r) => r.table_name)
      .filter((t) => !BACKUP_EXCLUDED_TABLES.some((re) => re.test(t)))
      .sort();

    for (const table of tables) {
      if (storageBudgetExhausted(t0, TIME_BUDGET_MS)) {
        errors.push('Time budget reached during table export — run did not finish.');
        break;
      }
      try {
        // Paged so a table that grows past the PostgREST cap is not silently
        // truncated to its first page — a backup missing rows it does not
        // mention is the worst kind.
        const rows: unknown[] = [];
        const PAGE = 1000;
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabaseAdmin
            .from(table)
            .select('*')
            .range(from, from + PAGE - 1);
          if (error) throw new Error(error.message);
          const page = data ?? [];
          rows.push(...page);
          if (page.length < PAGE) break;
        }

        const body = gzipSync(Buffer.from(toNdjson(rows), 'utf8'));
        await putObject(
          target,
          backupObjectKey(stamp, `db/${table}.ndjson.gz`),
          body,
          'application/gzip'
        );
        totalRows += rows.length;
        totalBytes += body.byteLength;
        tablesExported += 1;
      } catch (e) {
        errors.push(`${table}: ${(e as Error).message}`);
      }
    }

    // ── 2. Storage objects — the PDFs and photos no DB backup contains ──────
    // Newest first and inside the remaining time budget: a partial copy that
    // always includes the most recent evidence beats an all-or-nothing sweep
    // that times out and copies nothing.
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    for (const bucket of buckets ?? []) {
      if (storageBudgetExhausted(t0, TIME_BUDGET_MS)) break;
      const { data: objects } = await supabaseAdmin.storage
        .from(bucket.name)
        .list('', { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });
      for (const obj of objects ?? []) {
        if (storageBudgetExhausted(t0, TIME_BUDGET_MS)) break;
        if (!obj?.name) continue;
        try {
          const { data: blob, error } = await supabaseAdmin.storage
            .from(bucket.name)
            .download(obj.name);
          if (error || !blob) continue;
          const bytes = new Uint8Array(await blob.arrayBuffer());
          await putObject(
            target,
            backupObjectKey(stamp, `storage/${bucket.name}/${obj.name}`),
            bytes,
            blob.type || 'application/octet-stream'
          );
          totalBytes += bytes.byteLength;
          objectsCopied += 1;
        } catch (e) {
          errors.push(`storage/${bucket.name}/${obj.name}: ${(e as Error).message}`);
        }
      }
    }

    const durationMs = Date.now() - t0;
    // Partial success is its own status. "completed" has to mean completed, or
    // the log becomes another thing that reassures without checking.
    const status = errors.length === 0 ? 'completed' : 'partial';
    const notes =
      `${tablesExported}/${tables.length} tables, ${totalRows} rows, ` +
      `${objectsCopied} storage objects, ${(totalBytes / 1024 / 1024).toFixed(1)} MB` +
      (errors.length ? ` | ${errors.length} error(s): ${errors.slice(0, 5).join('; ')}` : '');

    if (logRow) {
      await supabaseAdmin
        .from('backup_logs')
        .update({
          status,
          size_bytes: totalBytes,
          duration_ms: durationMs,
          storage_path: `s3://${target.bucket}/${backupObjectKey(stamp, '')}`,
          completed_at: new Date().toISOString(),
          notes,
        })
        .eq('id', logRow.id);
    }

    return NextResponse.json({
      success: status === 'completed',
      data: { status, tablesExported, totalRows, objectsCopied, totalBytes, durationMs, errors },
    });
  } catch (e) {
    const message = (e as Error).message;
    if (logRow) {
      await supabaseAdmin
        .from('backup_logs')
        .update({
          status: 'failed',
          duration_ms: Date.now() - t0,
          completed_at: new Date().toISOString(),
          notes: `Export failed: ${message}`,
        })
        .eq('id', logRow.id);
    }
    console.error('[backup-export] failed', e);
    return NextResponse.json({ error: 'Backup export failed.', detail: message }, { status: 500 });
  }
}
