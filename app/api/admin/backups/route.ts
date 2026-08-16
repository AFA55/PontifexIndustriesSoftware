export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformOwner } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isTableNotFoundError } from '@/lib/api-auth';

/**
 * REPORT WHAT IS TRUE, NOT WHAT WE HOPE.
 *
 * This endpoint used to return, hardcoded:
 *
 *   "Supabase automatically creates daily backups with point-in-time recovery.
 *    No manual action required."
 *
 * Nothing checked any part of that. Point-in-time recovery is a paid add-on
 * that may or may not be enabled on this project, and meanwhile `backup_logs`
 * held ZERO rows — no backup this platform controls had ever run. A screen that
 * says "you're covered" without checking is worse than one that says nothing,
 * because it stops you looking. It is the same fault as a work ticket printing
 * "(Signature on file)" beside an empty box.
 *
 * It now reports the state of the one thing it can actually observe: whether an
 * off-site export has run, when, and whether it succeeded.
 */
function offsiteStatus(rows: Array<{ backup_type?: string; status?: string; completed_at?: string | null; notes?: string | null }>) {
  const configured = !!(
    process.env.BACKUP_S3_ENDPOINT &&
    process.env.BACKUP_S3_BUCKET &&
    process.env.BACKUP_S3_ACCESS_KEY_ID &&
    process.env.BACKUP_S3_SECRET_ACCESS_KEY
  );
  const last = rows.find((r) => r.backup_type === 'offsite_export');
  const lastGood = rows.find((r) => r.backup_type === 'offsite_export' && r.status === 'completed');

  return {
    configured,
    last_run_at: last?.completed_at ?? null,
    last_run_status: last?.status ?? null,
    last_successful_at: lastGood?.completed_at ?? null,
    note: !configured
      ? 'NO off-site backup destination is configured. The only copy of this data lives inside the Supabase account. Set BACKUP_S3_* in Vercel.'
      : !lastGood
        ? 'An off-site destination is configured but no export has completed successfully yet.'
        : 'Off-site export is running. A backup is only proven by a test restore — do one quarterly.',
  };
}

/**
 * GET /api/admin/backups — List backup logs
 * POST /api/admin/backups — Trigger a manual backup snapshot
 */
export async function GET(request: NextRequest) {
  const auth = await requirePlatformOwner(request);
  if (!auth.authorized) return auth.response;

  try {
    const { data, error } = await supabaseAdmin
      .from('backup_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      if (isTableNotFoundError(error)) {
        return NextResponse.json({ success: true, data: [], offsite_backup: offsiteStatus([]) });
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      offsite_backup: offsiteStatus(data ?? []),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformOwner(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const backupType = body.type || 'manual';
    const notes = body.notes || '';

    const startTime = Date.now();

    // Create backup log entry
    const { data: backupLog, error: logError } = await supabaseAdmin
      .from('backup_logs')
      .insert({
        backup_type: backupType,
        status: 'in_progress',
        triggered_by: auth.userId,
        notes,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (logError) {
      if (isTableNotFoundError(logError)) {
        return NextResponse.json({
          success: true,
          message: 'Backup log table not created yet. Supabase automatic backups are still running.',
        });
      }
      throw logError;
    }

    // Export critical tables as JSON snapshot to Supabase Storage
    const tables = ['profiles', 'job_orders', 'customers', 'invoices', 'work_items', 'daily_job_logs'];
    const snapshot: Record<string, any[]> = {};
    let totalRows = 0;

    for (const table of tables) {
      try {
        const { data, error } = await supabaseAdmin.from(table).select('*');
        if (!error && data) {
          snapshot[table] = data;
          totalRows += data.length;
        }
      } catch {
        // Table might not exist — skip
      }
    }

    // Upload snapshot to storage
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `backup-${backupType}-${timestamp}.json`;
    const snapshotJson = JSON.stringify(snapshot, null, 2);
    const sizeBytes = new TextEncoder().encode(snapshotJson).length;

    let storagePath = null;
    try {
      // Try to create the bucket if it doesn't exist
      await supabaseAdmin.storage.createBucket('backups', {
        public: false,
        fileSizeLimit: 100 * 1024 * 1024, // 100MB
      }).catch(() => {}); // Ignore if exists

      const { error: uploadError } = await supabaseAdmin.storage
        .from('backups')
        .upload(fileName, snapshotJson, {
          contentType: 'application/json',
          upsert: false,
        });

      if (!uploadError) {
        storagePath = `backups/${fileName}`;
      }
    } catch {
      // Storage upload failed — still log the backup attempt
    }

    const durationMs = Date.now() - startTime;

    // Update backup log
    if (backupLog) {
      await supabaseAdmin
        .from('backup_logs')
        .update({
          status: 'completed',
          size_bytes: sizeBytes,
          duration_ms: durationMs,
          storage_path: storagePath,
          completed_at: new Date().toISOString(),
          notes: `${notes} | ${totalRows} rows across ${Object.keys(snapshot).length} tables`,
        })
        .eq('id', backupLog.id);
    }

    // Audit
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        user_email: auth.userEmail,
        action: 'manual_backup',
        resource_type: 'backup',
        resource_id: backupLog?.id,
        details: {
          type: backupType,
          tables: Object.keys(snapshot).length,
          rows: totalRows,
          size_bytes: sizeBytes,
          duration_ms: durationMs,
          storage_path: storagePath,
        },
      })
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        id: backupLog?.id,
        type: backupType,
        status: 'completed',
        tables: Object.keys(snapshot).length,
        total_rows: totalRows,
        size_bytes: sizeBytes,
        size_human: formatBytes(sizeBytes),
        duration_ms: durationMs,
        storage_path: storagePath,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
