/**
 * WHAT NUMBER THE CREW'S PHONE PRINTS.
 *
 * Three crew-facing screens — the job ticket, work-performed and day-complete —
 * have always derived "Day N" client-side as `total_days_worked + 1`. That is
 * the LIFETIME ordinal, and on a restarted job it is precisely the wrong one:
 * Leifeng comes back Friday Aug 21 as day 4 of the contract, but the man
 * standing on the slab is on day ONE of getting back on it. (See the two
 * definitions at the top of `lib/job-phases.ts` — they are both true and must
 * never be swapped for one another.)
 *
 * So the server computes the PHASE ordinal and hands it down as
 * `phase_day_number` (+ `phase_number`), and the screens prefer it.
 *
 * ── THE SHIP-SAFETY PROPERTY ────────────────────────────────────────────────
 *
 * A job that has never been restarted has NO rows in `job_phases` — which today
 * is every job in production, because the migration that creates the table is
 * not even applied. `phaseDayFields()` returns null for that job, the routes
 * omit the field entirely, and `displayDayNumber()` falls straight back to
 * `total_days_worked + 1`. Byte-for-byte the behaviour that shipped.
 *
 * That fallback is deliberately the FIRST thing tested in this file, because it
 * is the property that makes this change safe to ship on a live platform with
 * thirteen men on it.
 *
 * ── WHAT THIS DOES NOT TRY TO FIX ───────────────────────────────────────────
 *
 * `total_days_worked + 1` is also wrong in two other ways that are documented
 * and out of scope here: re-opening a day whose log already landed double-counts
 * it, and a backfilled ticket for an earlier date gets the last ordinal rather
 * than its own. Neither is made worse — the fallback path is untouched, and the
 * phase path numbers TODAY out of the proven-date list, so a date already proven
 * keeps the ordinal it earned instead of being appended on the end.
 */

import { byDate, numberJobDays, type JobPhase } from './job-phases';

/** The optional fields the job payload gains. Absent ⇒ nothing changed. */
export interface PhaseDayFields {
  /** 1-based ordinal of the day WITHIN its phase. Restarts at 1 on a restart. */
  phase_day_number: number;
  /** Which run of work that day belongs to. 1 for a job never restarted. */
  phase_number: number;
}

/**
 * The phase ordinal for one calendar day of one job, or null to change nothing.
 *
 * `provenDates` must be the job's PROVEN work dates — the `job_workday_evidence`
 * view, nothing looser. A plan is not attendance: a date counts only when the
 * job can show a filed log, or a NAMED crew placed by the office who actually
 * clocked in. Keeping that rule in the one place it already lives is why this
 * function takes the dates rather than fetching them.
 *
 * `today` is appended when it is not already proven. That reproduces the intent
 * of the comment this replaces — *"total_days_worked + 1 (today is a new day)"*
 * — but per phase: the crew is starting a day that has no evidence yet, and it
 * still needs a number to write on. When today IS already proven (the log
 * landed, or the office crewed them and they clocked in), it keeps the ordinal
 * it already earned instead of being counted a second time.
 */
export function phaseDayFields(args: {
  phases: readonly JobPhase[] | null | undefined;
  provenDates: readonly string[] | null | undefined;
  /** Bare tenant-local 'YYYY-MM-DD' — the day being numbered. */
  today: string | null | undefined;
}): PhaseDayFields | null {
  const { phases, today } = args;

  // No phases means the job was never restarted, and every function in
  // `lib/job-phases.ts` reads that as one implicit phase where
  // phaseDay === lifetimeDay. Returning null keeps the field off the wire so
  // the client cannot even accidentally prefer it.
  if (!phases || phases.length === 0) return null;
  if (!today) return null;

  const proven = args.provenDates ?? [];
  const dates = proven.includes(today) ? proven : [...proven, today];

  const hit = byDate(numberJobDays(phases, dates)).get(today);
  if (!hit) return null;

  return { phase_day_number: hit.phaseDay, phase_number: hit.phaseNumber };
}

/** The shape the three crew screens actually hold in state. */
export interface DayNumberSource {
  phase_day_number?: number | null;
  total_days_worked?: number | null;
}

/**
 * The number to print. Prefer the server's phase ordinal; otherwise the exact
 * expression the screens used before this existed.
 *
 * Anything that is not a usable positive integer — absent, null, a string that
 * survived a JSON round-trip badly, NaN — falls back. On the crew's phone a
 * wrong-but-plausible day number is worse than the old one, and "no number at
 * all" is worse than both.
 */
export function displayDayNumber(job: DayNumberSource | null | undefined): number {
  const phaseDay = job?.phase_day_number;
  if (typeof phaseDay === 'number' && Number.isFinite(phaseDay) && phaseDay >= 1) {
    return phaseDay;
  }
  return (job?.total_days_worked || 0) + 1;
}
