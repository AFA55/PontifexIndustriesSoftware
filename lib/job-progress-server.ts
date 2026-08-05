/**
 * Server-side loader for job progress.
 *
 * Every route that shows "how far along is this job" goes through here, so the
 * office, the operator ticket, the customer portal and the live board can never
 * disagree about the same job again. The maths lives in `lib/job-progress.ts`
 * (pure, unit-tested); this file is only the I/O around it.
 *
 * Progress is derived from `work_items` — what the operator actually recorded.
 * See the header of lib/job-progress.ts for why the old `job_progress_entries`
 * read path always returned 0%.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getTenantTimezone } from '@/lib/tenant-timezone';
import { dateInTz } from '@/lib/reminder-timing';
import {
  computeJobProgress,
  matchWorkItemToScope,
  quantityInUnit,
  type JobProgressResult,
  type ScopeItemLike,
  type WorkItemLike,
} from '@/lib/job-progress';

/** A work item with its calendar date resolved through the day's log. */
export interface DatedWorkItem extends WorkItemLike {
  id: string;
  date: string | null;
  operator_id: string | null;
  day_number: number | null;
  notes: string | null;
  created_at: string | null;
}

export interface LoadedJobProgress extends JobProgressResult {
  scope_items: ScopeItemLike[];
  work_items: DatedWorkItem[];
}

const EMPTY: LoadedJobProgress = {
  scope_items: [],
  work_items: [],
  scope_progress: [],
  unmatched_work: [],
  overall_pct: null,
};

/**
 * Load a job's scope targets and the operator work logged against them.
 *
 * `tenantId` is required for the scope query because supabaseAdmin bypasses
 * RLS. Work items are additionally filtered by job id, which is already
 * tenant-unique, and by tenant_id where the row carries one (older rows predate
 * that column).
 */
export async function loadJobProgress(
  jobId: string,
  tenantId: string | null | undefined
): Promise<LoadedJobProgress> {
  if (!jobId) return EMPTY;

  let scopeQuery = supabaseAdmin
    .from('job_scope_items')
    .select('id, work_type, description, unit, target_quantity, sort_order')
    .eq('job_order_id', jobId)
    .order('sort_order', { ascending: true });
  if (tenantId) scopeQuery = scopeQuery.eq('tenant_id', tenantId);

  // supabaseAdmin bypasses RLS, so the tenant filter has to be explicit. Rows
  // written before work_items gained a tenant_id are matched by `is.null` so
  // legacy work still counts for the tenant that owns the job.
  let workQuery = supabaseAdmin
    .from('work_items')
    .select(
      'id, work_type, quantity, linear_feet_cut, core_quantity, cut_depth_inches, core_size, notes, operator_id, day_number, daily_log_id, created_at'
    )
    .eq('job_order_id', jobId);
  if (tenantId) workQuery = workQuery.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);

  const [{ data: scopeRows }, { data: workRows }] = await Promise.all([
    scopeQuery,
    workQuery.order('created_at', { ascending: true }),
  ]);

  const scope_items = (scopeRows ?? []) as ScopeItemLike[];
  const rawWork = workRows ?? [];

  // Resolve each work item's calendar date. work_items has no date column — the
  // day's log is the authority when the row is linked to one (in production so
  // far, none are). Otherwise fall back to when the row was created, read in
  // the TENANT'S timezone: the server runs UTC, so slicing the timestamp would
  // file anything submitted after 8pm ET under tomorrow's date.
  const logIds = Array.from(
    new Set(rawWork.map((w) => w.daily_log_id).filter((v): v is string => !!v))
  );
  const [logRows, tz] = await Promise.all([
    logIds.length > 0
      ? supabaseAdmin.from('daily_job_logs').select('id, log_date').in('id', logIds)
      : Promise.resolve({ data: [] as Array<{ id: string; log_date: string }> }),
    getTenantTimezone(tenantId),
  ]);
  const logDates: Record<string, string> = {};
  for (const l of logRows.data ?? []) logDates[l.id] = l.log_date as string;

  const work_items: DatedWorkItem[] = rawWork.map((w) => ({
    ...w,
    date: (w.daily_log_id ? logDates[w.daily_log_id] : null) ?? dateInTz(w.created_at, tz),
    operator_id: w.operator_id ?? null,
    day_number: w.day_number ?? null,
    notes: w.notes ?? null,
    created_at: w.created_at ? String(w.created_at) : null,
  }));

  return {
    scope_items,
    work_items,
    ...computeJobProgress(scope_items, work_items),
  };
}

/**
 * Per-day breakdown of what each work item contributed to which target.
 * Used by the "Job Scope & Progress" day-by-day view.
 */
export interface ProgressEntryByDay {
  id: string;
  date: string | null;
  scope_item_id: string | null;
  description: string | null;
  work_type: string;
  unit: string | null;
  quantity_completed: number | null;
  target_quantity: number | null;
  operator_id: string | null;
  notes: string | null;
  day_number: number | null;
}

export function explodeProgressEntries(loaded: LoadedJobProgress): ProgressEntryByDay[] {
  return loaded.work_items.map((item) => {
    const { scopeItem } = matchWorkItemToScope(item, loaded.scope_items);
    const qty = scopeItem ? quantityInUnit(item, scopeItem.unit) : null;
    return {
      id: item.id,
      date: item.date,
      scope_item_id: scopeItem?.id ?? null,
      description: scopeItem?.description ?? null,
      work_type: item.work_type,
      unit: scopeItem?.unit ?? null,
      quantity_completed: qty,
      target_quantity: scopeItem ? Number(scopeItem.target_quantity ?? 0) : null,
      operator_id: item.operator_id,
      notes: item.notes,
      day_number: item.day_number,
    };
  });
}
