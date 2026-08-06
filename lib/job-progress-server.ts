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

/**
 * The whole ticket family for a job: the root plus every duplicate of it.
 *
 * A duplicate points at its root via parent_job_id (the duplicate route already
 * re-parents copies-of-copies to the root, so the tree is only ever one deep).
 * Given ANY member, this returns the root and every sibling — so asking a child
 * for progress gives the same answer as asking the parent.
 */
async function resolveJobFamily(
  jobId: string,
  tenantId: string | null | undefined
): Promise<{ rootId: string; allIds: string[] }> {
  try {
    let selfQuery = supabaseAdmin
      .from('job_orders')
      .select('id, parent_job_id')
      .eq('id', jobId);
    if (tenantId) selfQuery = selfQuery.eq('tenant_id', tenantId);
    const { data: self } = await selfQuery.maybeSingle();

    const rootId = (self?.parent_job_id as string | null) || jobId;

    let childQuery = supabaseAdmin
      .from('job_orders')
      .select('id')
      .eq('parent_job_id', rootId);
    if (tenantId) childQuery = childQuery.eq('tenant_id', tenantId);
    const { data: children } = await childQuery;

    const allIds = Array.from(
      new Set([rootId, jobId, ...(children ?? []).map((c) => c.id as string)])
    );
    return { rootId, allIds };
  } catch {
    // A family lookup must never break a progress read — fall back to this job.
    return { rootId: jobId, allIds: [jobId] };
  }
}

export async function loadJobProgress(
  jobId: string,
  tenantId: string | null | undefined
): Promise<LoadedJobProgress> {
  if (!jobId) return EMPTY;

  // ── One job location = one scope, however many operators are on it ────────
  //
  // Duplicating a ticket is how a second crew gets sent to the SAME job at the
  // SAME address. Each of them gets their own ticket to record what THEY did —
  // but the scope of work is the customer's, not the operator's, and there is
  // only ever one of it.
  //
  // Duplicates are already linked by parent_job_id, but they are created with
  // ZERO scope items of their own. So Aiden's 2 work items on the Logistics
  // Drive copy had nothing to count against, and Zack's parent ticket only ever
  // showed Zack's footage. That is the "not in sync with total scope" the
  // founder hit (Aug 2026).
  //
  // Progress is therefore computed for the whole FAMILY: scope comes from the
  // root ticket, and the work counted against it is everyone's.
  const family = await resolveJobFamily(jobId, tenantId);

  let scopeQuery = supabaseAdmin
    .from('job_scope_items')
    .select('id, work_type, description, unit, target_quantity, sort_order')
    .eq('job_order_id', family.rootId)
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
    .in('job_order_id', family.allIds);
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
