export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/admin/job-orders/[id]/duplicate
 * Duplicate a job order to a new date while maintaining project connection.
 *
 * Body: { scheduled_date: string, end_date?: string, notes?: string, copyCrew?: boolean }
 * - Copies all fields from original except transient/status fields
 * - Generates a new job number
 * - Links back to original via parent_job_id
 *
 * WHY duplicates exist (founder, Aug 2026): to dispatch a SECOND CREW to the
 * same job. The normal multi-person case is ONE ticket with the whole crew on
 * it (job_crew) — that needs no duplicate. So the copy deliberately lands with
 * NO lead and NO crew: it is staffed with DIFFERENT people (crew B).
 *
 * `copyCrew` (default FALSE) is the opt-in escape hatch for the secondary case
 * "same crew, another day/area". When true the source job's job_crew rows and
 * the helper seat are carried over. The LEAD is never copied — the admin picks
 * who runs the copy (and lead changes must go through /schedule-board/assign,
 * which owns the per-day ledger + sequencing).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSalesStaff } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getTenantId } from '@/lib/get-tenant-id';
import { buildCrewCopyRows } from '@/lib/duplicate-crew';
import {
  buildDuplicatePayload,
  insertJobOrderCopy,
  describeInsertError,
} from '@/lib/duplicate-job-order';

// The copy-rules live in lib/duplicate-job-order.ts, unit-tested there. TWO
// separate bugs met in this route:
//   1. it copied EVERY column off the source row, including the generated
//      `total_cost` / `gross_profit` — Postgres rejected the INSERT, so
//      duplicating was 100% broken from Jul 2 to Aug 2026 (0 of 11 prod rows
//      had parent_job_id);
//   2. once that was fixed, copying every column would have carried the
//      customer's signature, the previous crew's work log, billing state and
//      the live-progress timestamps onto the new ticket. Hence the ALLOWLIST.

function generateJobNumber(): string {
  const year = new Date().getFullYear();
  const seq = Math.floor(100000 + Math.random() * 900000);
  return `JOB-${year}-${seq}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const body = await request.json();
    const { scheduled_date, end_date, notes } = body;
    // Opt-in only — existing callers that omit it get the byte-identical
    // "empty copy for a second crew" behaviour.
    const copyCrew = body.copyCrew === true;

    if (!scheduled_date) {
      return NextResponse.json(
        { error: 'scheduled_date is required' },
        { status: 400 }
      );
    }

    // Fetch the original job order. `deleted_at IS NULL`: duplicating a
    // soft-deleted job produced a copy nobody could see anywhere, while the
    // office got a "Duplicated" success toast.
    let origQuery = supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null);
    origQuery = origQuery.eq('tenant_id', tenantId);
    const { data: original, error: fetchError } = await origQuery.maybeSingle();

    if (fetchError || !original) {
      return NextResponse.json(
        { error: 'Job order not found' },
        { status: 404 }
      );
    }

    // Build the new job order: business exclusions + generated columns dropped.
    // "Same crew, another day" (copyCrew) carries the helper seat over; the
    // lead stays empty either way.
    const newJobOrder = buildDuplicatePayload(original, {
      jobNumber: generateJobNumber(),
      scheduledDate: scheduled_date,
      endDate: end_date,
      parentJobId: id,
      copyCrew,
      notes,
      createdBy: auth.userId,
    });

    const { data: created, error: insertError } = await insertJobOrderCopy(
      supabaseAdmin as any,
      newJobOrder
    );

    if (insertError || !created) {
      console.error('Error duplicating job order:', insertError);
      // Surface the real Postgres message — a bare "Failed to duplicate" told
      // the founder nothing when the generated-column bug hit. Management-only
      // route, so there is no meaningful information disclosure here.
      return NextResponse.json(
        { error: describeInsertError(insertError, 'Failed to duplicate job order') },
        { status: 500 }
      );
    }

    // ── Optional: carry the crew over ("same crew, another day/area") ───────
    // Tenant-scoped read; rows are re-keyed to the NEW job and re-stamped with
    // the caller as added_by. No job_daily_assignments rows are written here —
    // JDA is per (job, date) and is created only by /schedule-board/assign when
    // the copy gets its lead, so crew on two jobs the same day can't conflict.
    let crewCopied = 0;
    if (copyCrew) {
      const { data: sourceCrew } = await supabaseAdmin
        .from('job_crew')
        .select('user_id, role')
        .eq('job_order_id', id)
        .eq('tenant_id', tenantId);

      const rows = buildCrewCopyRows(sourceCrew, {
        tenantId,
        newJobId: created.id,
        addedBy: auth.userId,
      });

      if (rows.length > 0) {
        const { error: crewError } = await supabaseAdmin
          .from('job_crew')
          .upsert(rows, { onConflict: 'job_order_id,user_id', ignoreDuplicates: true });
        if (crewError) {
          // Non-fatal: the copy exists; the office can add crew from the card's "+".
          console.error('Error copying crew to duplicated job:', crewError);
        } else {
          crewCopied = rows.length;
        }
      }
    }

    // Audit log (fire-and-forget)
    Promise.resolve(
      supabaseAdmin.from('job_orders_history').insert({
        job_order_id: created.id,
        job_number: created.job_number,
        changed_by: auth.userId,
        changed_by_name: auth.userEmail,
        changed_by_role: auth.role,
        change_type: 'duplicated',
        changes: {
          duplicated_from: {
            id: original.id,
            job_number: original.job_number,
          },
          copy_crew: copyCrew,
          crew_copied: crewCopied,
        },
        snapshot: created,
      })
    ).catch(() => {});

    return NextResponse.json(
      { success: true, data: { ...created, crew_copied: crewCopied } },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error in duplicate route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
