/**
 * Pure helpers for the admin job-ticket crew view: which date span to pull
 * timecards for, and how to group per-member clock-in/out entries by date.
 *
 * Kept pure (no supabase imports) so they are unit-testable — the summary
 * route (/api/admin/jobs/[id]/summary) does the fetching and feeds rows in.
 */

export interface CrewSpanJob {
  scheduled_date: string | null;
  end_date?: string | null;
  scheduled_end_date?: string | null;
  actual_end_date?: string | null;
  status?: string | null;
}

/**
 * The [from, to] local-YMD window of timecards relevant to a job.
 * - from = scheduled_date (no span without it → null)
 * - to   = the latest known end (end_date / scheduled_end_date /
 *          actual_end_date), floored at scheduled_date; while the job is not
 *          completed/cancelled the window extends to `today` so a job running
 *          long still shows the crew's current cards.
 */
export function crewTimecardSpan(
  job: CrewSpanJob,
  today: string
): { from: string; to: string } | null {
  const from = job.scheduled_date;
  if (!from) return null;
  let to = from;
  for (const candidate of [job.end_date, job.scheduled_end_date, job.actual_end_date]) {
    if (candidate && candidate > to) to = candidate;
  }
  const active = !['completed', 'cancelled', 'archived'].includes(job.status || '');
  if (active && today > to) to = today;
  return { from, to };
}

export interface CrewTimecardRow {
  user_id: string;
  date: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  total_hours: number | null;
  job_order_id: string | null;
}

export interface CrewTimecardEntry {
  user_id: string;
  full_name: string | null;
  clock_in_time: string | null;
  clock_out_time: string | null;
  total_hours: number | null;
  /** true = the card was clocked against THIS job; false = a general day card. */
  job_linked: boolean;
}

export interface CrewTimecardDay {
  date: string;
  entries: CrewTimecardEntry[];
}

/**
 * Group raw timecard rows into per-date buckets (ascending date), resolving
 * member names and flagging cards not linked to this job as day cards.
 * Within a date, job-linked cards sort first, then by clock-in time.
 */
export function groupCrewTimecards(
  rows: CrewTimecardRow[],
  nameByUserId: Map<string, string | null>,
  jobId: string
): CrewTimecardDay[] {
  const byDate = new Map<string, CrewTimecardEntry[]>();
  for (const r of rows) {
    if (!r.date) continue;
    const entry: CrewTimecardEntry = {
      user_id: r.user_id,
      full_name: nameByUserId.get(r.user_id) ?? null,
      clock_in_time: r.clock_in_time ?? null,
      clock_out_time: r.clock_out_time ?? null,
      total_hours: r.total_hours ?? null,
      job_linked: r.job_order_id === jobId,
    };
    const bucket = byDate.get(r.date);
    if (bucket) bucket.push(entry);
    else byDate.set(r.date, [entry]);
  }
  return Array.from(byDate.keys())
    .sort()
    .map((date) => ({
      date,
      entries: byDate.get(date)!.sort((a, b) => {
        if (a.job_linked !== b.job_linked) return a.job_linked ? -1 : 1;
        return (a.clock_in_time || '').localeCompare(b.clock_in_time || '');
      }),
    }));
}
