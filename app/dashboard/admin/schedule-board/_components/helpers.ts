import { supabase } from '@/lib/supabase';
import { authedFetchQuiet } from '@/lib/authed-fetch';
import { offPlatformLeadChanged } from '@/lib/off-platform-lead';
import type { JobCardData } from './JobCard';

// ─── Date helpers ─────────────────────────────────────────────────────────
export function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDisplayDate(dateString: string) {
  const date = parseLocalDate(dateString);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const dateOnly = new Date(date); dateOnly.setHours(0, 0, 0, 0);
  if (dateOnly.getTime() === today.getTime()) return 'Today';
  if (dateOnly.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function daysAgo(dateString: string) {
  const added = parseLocalDate(dateString);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - added.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── API helpers ──────────────────────────────────────────────────────────
export async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

/**
 * The board's call to its own API.
 *
 * WHY authedFetchQuiet (Aug 17): this used to read the session and post
 * whatever `access_token` it found. When that value was malformed — the exact
 * failure in the Supabase auth log, "token contains an invalid number of
 * segments" — every call the board made on mount 401ed together, which is what
 * a clump of ten simultaneous 401s in the Vercel log is. The board is where
 * that happens precisely because the board fires the most calls at once.
 *
 * Quiet, not throwing: ~60 call sites here read `res.ok`, and every one of them
 * still gets a Response. What changes is that a non-JWT is never sent, and a
 * 401 buys one refresh and one retry before the board decides anything is
 * wrong. Its `Content-Type` default is unchanged.
 */
export async function apiFetch(url: string, opts?: RequestInit) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts?.headers as Record<string, string> | undefined),
  };

  // If the caller brought its own Authorization we stay out of the way — plain
  // fetch, no session read, no refresh. Replacing a credential somebody chose
  // deliberately is not ours to do; `lib/api-client.ts` already declines to,
  // and the two should not disagree. No board site does this today, which is
  // exactly why it should be settled before one does.
  const hasAuthHeader = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
  if (hasAuthHeader) return fetch(url, { ...opts, headers });

  return authedFetchQuiet(url, { ...opts, headers });
}

// ─── Convert API job to JobCardData ──────────────────────────────────────
export function computeDayLabel(job: any, viewDate?: string): string | undefined {
  if (!job.scheduled_date || !job.end_date) return undefined;
  if (job.scheduled_date === job.end_date) return undefined; // single-day job
  const start = parseLocalDate(job.scheduled_date);
  const end = parseLocalDate(job.end_date);
  // Use the date currently being viewed on the board, not today's real date
  const current = viewDate ? parseLocalDate(viewDate) : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const totalDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const currentDay = Math.round((current.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (currentDay >= 1 && currentDay <= totalDays) return `Day ${currentDay} of ${totalDays}`;
  return undefined;
}

export function toJobCard(job: any, viewDate?: string): JobCardData {
  return {
    id: job.id,
    job_number: job.job_number,
    customer_name: job.customer_name,
    job_type: job.job_type,
    location: job.location || '',
    address: job.address || '',
    equipment_needed: job.equipment_needed || [],
    description: job.description || null,
    scheduled_date: job.scheduled_date || '',
    end_date: job.end_date || null,
    arrival_time: job.arrival_time || null,
    is_will_call: job.is_will_call || false,
    difficulty_rating: job.difficulty_rating || null,
    notes_count: job.notes_count || 0,
    change_requests_count: job.pending_change_requests_count || 0,
    helper_names: job.helper_name ? [job.helper_name] : [],
    // People the board can show without another fetch. operator_name/helper_name
    // come straight from schedule_board_view (+ the per-day overlay); `crew` is
    // the extra job_crew members the board GET now attaches.
    operator_name: job.operator_name || null,
    helper_name: job.helper_name || null,
    // The crew's lead when they are not a Pontifex user. Only ever set on jobs
    // with no operator; absent until the migration lands, hence `|| null`.
    off_platform_lead_name: job.off_platform_lead_name || null,
    crew: Array.isArray(job.crew) ? job.crew : [],
    po_number: job.po_number || null,
    day_label: computeDayLabel(job, viewDate),
    // Same-day sequencing (from the board GET's per-day-ledger overlay)
    day_sequence: job.day_sequence ?? null,
    operator_day_job_count: job.operator_day_job_count ?? null,
    // Current lead (post-overlay) — keep-operator source for helper-only edits
    assigned_to: job.assigned_to ?? null,
    status: job.status || null,
    // Live operator-progress timestamps (already in job_orders select('*'))
    in_route_at: job.in_route_at ?? null,
    arrived_at_jobsite_at: job.arrived_at_jobsite_at ?? null,
    work_started_at: job.work_started_at ?? null,
    work_completed_at: job.work_completed_at ?? null,
    project_name: job.project_name ?? null,
    // Parked facts. `?? null` throughout: absent until the park/restart
    // migration appends them to schedule_board_view, and an absent column must
    // read as "not parked", not as undefined leaking into a date or a count.
    on_hold: job.on_hold ?? null,
    on_hold_reason: job.on_hold_reason ?? null,
    on_hold_placed_at: job.on_hold_placed_at ?? null,
    on_hold_released_at: job.on_hold_released_at ?? null,
    total_days_worked: job.total_days_worked ?? null,
    days_parked: job.days_parked ?? null,
  };
}

// ─── Which crew seats did the Edit panel actually change? ─────────────────
//
// PURE AND EXPORTED SO IT CAN BE PINNED BY A TEST, because getting it wrong
// silently replaces a day's crew. Saving the panel fires a full crew write
// (`/assign`, scope 'remaining') whenever ANY of the three answers is true, and
// that write restates every seat the caller did not omit. So a seat that reads
// as "changed" when nothing about the crew changed is not a cosmetic bug — it is
// a wipe with a save button on it.
//
// THE BUG THIS EXISTS TO PREVENT (guardian, Aug 20): the lead was compared
// against the ROW's lead while the panel seeded its field from the JOB's. Those
// two legitimately differ — the board sets a row's lead to the first NAMED lead
// among that row's jobs, so a second job on the same helper's row, with no lead
// of its own, reads `null` against a row reading "Mike Sanchez". Editing that
// job's PO number then reported `leadChanged`, fired the crew write, and the
// helper's day was rewritten from the job's stale seat. Compare like with like:
// every seat here is read from the SAME source the panel seeded its control
// from — the job, per-day, as the board GET overlaid it.
export interface EditCrewChangeInput {
  /** The panel's own starting values (what the office saw when it opened). */
  currentOperatorName: string | null;
  currentHelperName: string | null;
  /** The job's per-day lead, from the board GET's ledger overlay. */
  currentLeadName: string | null | undefined;
  /** What the panel returned. `undefined` = the panel did not speak. */
  newOperatorName?: string | null;
  newHelperName?: string | null;
  newLeadName?: string | null;
}

export function editCrewChanges(input: EditCrewChangeInput): {
  operatorChanged: boolean;
  helperChanged: boolean;
  leadChanged: boolean;
  /** True when a crew write must be sent at all. */
  crewWriteNeeded: boolean;
} {
  const operatorChanged =
    input.newOperatorName !== undefined &&
    (input.newOperatorName || null) !== (input.currentOperatorName || null);
  const helperChanged =
    input.newHelperName !== undefined &&
    (input.newHelperName || null) !== (input.currentHelperName || null);
  const leadChanged = offPlatformLeadChanged(input.newLeadName, input.currentLeadName);
  return {
    operatorChanged,
    helperChanged,
    leadChanged,
    crewWriteNeeded: operatorChanged || helperChanged || leadChanged,
  };
}
