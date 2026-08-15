export const dynamic = 'force-dynamic';

/**
 * GET /api/sales/my-jobs
 *
 * The three piles behind the Project Manager dashboard's "My Jobs" area:
 * upcoming, active, completed. Split by `bucketPmJobs` (lib/pm-job-buckets.ts),
 * which is where the rule lives and where it is tested.
 *
 * WHY A NEW ROUTE INSTEAD OF /api/admin/active-jobs:
 *   • active-jobs excludes `pending_approval` and `on_hold`. A PM's just-filed
 *     job sits in exactly those statuses, so their newest work would appear in
 *     none of the three piles — the one thing worse than a wrong count.
 *   • It has no completed jobs at all, so a second call was needed regardless.
 *   • It does per-day assignment overrides, change-request counts and note
 *     counts that a five-row dashboard list never reads.
 *
 * SCOPE: always `created_by = auth.userId`, tenant-scoped, soft-deletes
 * excluded. `created_by` is the correct ownership signal for a PM — they create
 * jobs and are never assigned to them as an operator. There is no `?userId=`
 * escape hatch and no role that widens it: this endpoint answers "my jobs" and
 * nothing else.
 *
 * Auth: requireAuth. Any authenticated user may ask for their own jobs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { todayInTz } from '@/lib/reminder-timing';
import { bucketPmJobs, PM_EXCLUDED_STATUSES, type PmJob } from '@/lib/pm-job-buckets';

/** How many completed jobs we pull for the dashboard list. "View all" has the rest. */
const COMPLETED_WINDOW = 25;
/** Sanity bound on the open pipeline so one runaway account can't page the world. */
const OPEN_WINDOW = 300;

const JOB_COLUMNS = `
  id,
  job_number,
  title,
  status,
  scheduled_date,
  end_date,
  customer_name,
  assigned_to,
  scheduling_flexibility,
  work_completed_at,
  completion_signed_at,
  office_completed_at
`;

/** The raw job_orders columns this route selects. */
interface Row {
  id: string;
  job_number: string | null;
  title: string | null;
  status: string;
  scheduled_date: string | null;
  end_date: string | null;
  customer_name: string | null;
  assigned_to: string | null;
  scheduling_flexibility: { can_work_weekends?: boolean | null; can_work_fridays?: boolean | null } | null;
  work_completed_at: string | null;
  completion_signed_at: string | null;
  office_completed_at: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const excluded = `(${PM_EXCLUDED_STATUSES.map((s) => `"${s}"`).join(',')})`;

    /** Every query on this route carries the same scope. Built in one place. */
    const scoped = (columns: string, opts?: { count: 'exact'; head: boolean }) => {
      const q = supabaseAdmin
        .from('job_orders')
        .select(columns, opts)
        .eq('created_by', auth.userId)
        .is('deleted_at', null);
      // A super_admin may carry a null tenant; everyone else is pinned to theirs.
      return auth.tenantId ? q.eq('tenant_id', auth.tenantId) : q;
    };

    const [openRes, doneRes, doneCountRes] = await Promise.all([
      // Open pipeline — everything that is not finished and not thrown away.
      // `pending_approval` and `on_hold` are deliberately INCLUDED: a PM's
      // just-filed job lives there and has to appear somewhere.
      scoped(JOB_COLUMNS)
        .neq('status', 'completed')
        .not('status', 'in', excluded)
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .limit(OPEN_WINDOW),
      // Most recent completed work.
      scoped(JOB_COLUMNS)
        .eq('status', 'completed')
        .order('scheduled_date', { ascending: false, nullsFirst: false })
        .limit(COMPLETED_WINDOW),
      // Honest total for the "View all" affordance, independent of the window.
      scoped('id', { count: 'exact', head: true }).eq('status', 'completed'),
    ]);

    if (openRes.error || doneRes.error) {
      console.error(
        '[sales/my-jobs] query error:',
        openRes.error?.message ?? doneRes.error?.message
      );
      return NextResponse.json({ error: 'Failed to load your jobs' }, { status: 500 });
    }

    // The untyped supabase client cannot infer a multi-line select string, so
    // the shape is asserted here against the `Row` interface above.
    const rows = [
      ...(openRes.data ?? []),
      ...(doneRes.data ?? []),
    ] as unknown as Row[];

    // Operator names — one lookup for the whole set.
    const operatorIds = [...new Set(rows.map((r) => r.assigned_to).filter(Boolean))] as string[];
    const nameById: Record<string, string> = {};
    if (operatorIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', operatorIds);
      for (const p of (profiles ?? []) as Array<{ id: string; full_name: string }>) {
        nameById[p.id] = p.full_name;
      }
    }

    // The tenant's today, not the server's. The server runs UTC; bucketing on
    // its calendar date flips "upcoming" to "active" hours early in the US.
    let tenantTz = 'America/New_York';
    if (auth.tenantId) {
      try {
        const { data: tzRow } = await supabaseAdmin
          .from('tenants')
          .select('timezone')
          .eq('id', auth.tenantId)
          .maybeSingle();
        if (tzRow?.timezone) tenantTz = tzRow.timezone;
      } catch {
        /* default tz */
      }
    }
    const today = todayInTz(tenantTz);

    const jobs: PmJob[] = rows.map((r) => ({
      id: r.id,
      job_number: r.job_number ?? null,
      title: r.title ?? null,
      customer_name: r.customer_name ?? null,
      status: r.status,
      scheduled_date: r.scheduled_date ?? null,
      end_date: r.end_date ?? null,
      scheduling_flexibility: r.scheduling_flexibility ?? null,
      operator_name: r.assigned_to ? (nameById[r.assigned_to] ?? null) : null,
      // Prefer the moment the office closed it, then the signature, then the
      // crew's finish — the latest authoritative "this is done" we have.
      completed_at:
        r.office_completed_at ?? r.completion_signed_at ?? r.work_completed_at ?? null,
    }));

    const buckets = bucketPmJobs(jobs, today);

    return NextResponse.json({
      success: true,
      data: {
        today,
        upcoming: buckets.upcoming,
        active: buckets.active,
        completed: buckets.completed,
        counts: {
          upcoming: buckets.upcoming.length,
          active: buckets.active.length,
          // The bucket is windowed; the count is not.
          completed: doneCountRes.count ?? buckets.completed.length,
        },
      },
    });
  } catch (err) {
    console.error('[sales/my-jobs] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
