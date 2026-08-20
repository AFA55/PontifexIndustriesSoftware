/**
 * THE RULE, AND THE WORDS FOR IT — pure, no database.
 *
 * Split out of `lib/timecard-job-context.ts` (which owns the reads) for two
 * reasons that both matter here:
 *
 *   • that module imports `supabaseAdmin` and therefore the SERVICE-ROLE KEY, so
 *     nothing in it may ever be pulled into a `'use client'` bundle — and the
 *     label formatters are exactly the things a page would reach for;
 *   • the rule below is the one both the timecard and the work ticket obey, and
 *     a rule worth sharing is worth being able to exercise without a database.
 *
 * The precedence ladder itself, and the evidence that fixed it, are documented
 * on `resolveDayJobs` and in the header of `lib/timecard-job-context.ts`.
 */

// ── The ladder (pure) ────────────────────────────────────────────────────────

/** Which record named a job for a person-day. */
export type JobEvidenceSource = 'day_ledger' | 'operator_log' | 'helper_log' | 'timecard';

/**
 * Authority, low number = higher. The two filed-log kinds share one rung: an
 * operator ticket and a helper log are the same class of evidence, filed by the
 * same crew on the same phones, and neither outranks the other.
 */
const SOURCE_RANK: Record<JobEvidenceSource, number> = {
  day_ledger: 0,
  operator_log: 1,
  helper_log: 1,
  timecard: 2,
};

/**
 * The clock-in stamp is a 7 a.m. guess frozen before the board exists (see the
 * module note). When it is what answered, the answer is INFERRED and every
 * surface must label it as such rather than presenting it as recorded fact.
 */
export function isInferredSource(source: JobEvidenceSource): boolean {
  return source === 'timecard';
}

export interface JobDayEvidence {
  jobId: string;
  source: JobEvidenceSource;
}

/**
 * How a job named ONLY by the clock-in stamp is treated.
 *
 * `'lowest'` — THE PAYROLL RULE, and the default. The stamp is the last rung:
 *   it answers only when the board and the filed logs both said nothing, and a
 *   stamp that disagrees with the board is reported as a conflict. Set by the
 *   Axel Valverde evidence in the module note.
 *
 * `'always_counts'` — THE BILLING RULE, used only by `lib/job-clock-attribution.ts`
 *   when deciding whether a person-day divides at the in-route presses. There a
 *   tagged card is a claim on hours that already exist on that card, so it is
 *   always one of the day's jobs (founder, Aug 14: Zack's card named
 *   JOB-2026-424813 while the board placed him on JOB-2026-675188, and the
 *   ticket has to divide his day between both). Preserved verbatim — the split
 *   that shipped in 5ca940e9 is not in scope here and must not shift.
 */
export type CardTagPolicy = 'lowest' | 'always_counts';

export interface DayJobResolution {
  /** The jobs this person was on that day, most-authoritative source first. */
  jobIds: string[];
  /** Jobs named ONLY by a rung the ladder outranked. Surfaced, never dropped. */
  conflictJobIds: string[];
  /** jobId → the highest-authority source that named it. Covers both lists. */
  sourceByJobId: Map<string, JobEvidenceSource>;
}

/**
 * Apply the ladder to one person-day's evidence.
 *
 * Pure and synchronous on purpose: it is the rule, and both the timecard (which
 * LISTS a day's jobs) and the work ticket (which DIVIDES hours between them) run
 * their day through this same function, differing only in `cardTagPolicy`.
 *
 * The winning rung is the highest-authority one that named anything at all.
 * Everything it named is accepted — two jobs on one board day is normal and both
 * get listed. Everything named only BELOW it is a conflict.
 */
export function resolveDayJobs(
  evidence: Iterable<JobDayEvidence>,
  opts: { cardTagPolicy?: CardTagPolicy } = {}
): DayJobResolution {
  const cardTagPolicy = opts.cardTagPolicy ?? 'lowest';

  /** jobId → best (lowest-rank) source that named it, in first-seen order. */
  const best = new Map<string, JobEvidenceSource>();
  /**
   * Jobs a CARD TAG named, whatever else also named them.
   *
   * Tracked separately from `best`, which keeps only the highest-authority
   * source per job. Under `always_counts` the acceptance test has to ask "did a
   * card tag name this job?", and `best` cannot answer that once a filed log —
   * a higher rung — named the same job. Zack, Aug 14 2026: the board placed him
   * on JOB-2026-675188, his card was tagged JOB-2026-424813, and he ALSO filed
   * an operator log for 424813. Reading `best` alone made 424813 an
   * operator_log, which the board outranks, so the day stopped dividing and
   * commit 5ca940e9 silently reverted. It is the only person-day of that shape
   * in production, and it is the one the split exists for.
   */
  const cardTagged = new Set<string>();
  let decidingRank = Number.POSITIVE_INFINITY;

  for (const e of evidence) {
    if (!e?.jobId || !e.source) continue;
    const rank = SOURCE_RANK[e.source];
    if (rank === undefined) continue;
    if (e.source === 'timecard') cardTagged.add(e.jobId);
    // Under the billing policy a tagged card is never what DECIDES the day — it
    // is simply always included — so it must not raise the deciding rung above
    // the board's or the log's.
    const decides = !(cardTagPolicy === 'always_counts' && e.source === 'timecard');
    if (decides && rank < decidingRank) decidingRank = rank;
    const current = best.get(e.jobId);
    if (current === undefined || rank < SOURCE_RANK[current]) best.set(e.jobId, e.source);
  }

  const jobIds: string[] = [];
  const conflictJobIds: string[] = [];
  for (const [jobId, source] of best) {
    const accepted =
      SOURCE_RANK[source] <= decidingRank ||
      (cardTagPolicy === 'always_counts' && cardTagged.has(jobId));
    if (accepted) jobIds.push(jobId);
    else conflictJobIds.push(jobId);
  }

  // Stable, authority-first order so the primary job of a day is deterministic
  // (the rollups downstream count a whole day under `jobIds[0]`).
  jobIds.sort((a, b) => SOURCE_RANK[best.get(a)!] - SOURCE_RANK[best.get(b)!]);
  conflictJobIds.sort((a, b) => SOURCE_RANK[best.get(a)!] - SOURCE_RANK[best.get(b)!]);

  return { jobIds, conflictJobIds, sourceByJobId: best };
}

export interface TimecardJobContext {
  jobOrderId: string;
  jobNumber: string | null;
  /** The contractor being billed — what the founder calls "contractor name". */
  customerName: string | null;
  /** The project, when the job has one. Many quick-adds don't. */
  projectName: string | null;
  /** `job_orders.status` — a conflict against a `completed` job is the usual shape. */
  jobStatus: string | null;
  /** How we know — so the UI can be honest about a derived answer. */
  source: JobEvidenceSource;
}

/** One person's one day: the jobs named for it, and the evidence that lost. */
export interface TimecardDayJobs {
  userId: string;
  /** YYYY-MM-DD */
  date: string;
  /** Every job this person was on that day. Whole-day hours are NOT split across these. */
  jobs: TimecardJobContext[];
  /** Jobs named only by evidence the ladder outranked. Print these; do not hide them. */
  conflicts: TimecardJobContext[];
  /** No source named any job. The caller must SAY so — a blank reads as "no hours". */
  unresolved: boolean;
}

/** `${userId}|${YYYY-MM-DD}` — the key every map here is built on. */
export function personDayKey(userId: string, date: string): string {
  return `${userId}|${date}`;
}

// ── Display ──────────────────────────────────────────────────────────────────

/**
 * "JOB-2026-898480 · AM King — GE - KAA pit infill".
 *
 * Job number FIRST: it is the one field that always distinguishes two jobs for
 * one contractor at one address, which is exactly the case that produced a
 * wrong timecard (QA-2026-533392 has no project name at all).
 */
export function formatJobContextLabel(ctx: TimecardJobContext | undefined | null): string | null {
  if (!ctx) return null;
  const who = [ctx.customerName, ctx.projectName].filter(Boolean).join(' — ');
  if (ctx.jobNumber && who) return `${ctx.jobNumber} · ${who}`;
  return ctx.jobNumber || who || null;
}

/** What a job label should be qualified with, when the answer is not recorded fact. */
export function jobSourceNote(source: JobEvidenceSource): string | null {
  switch (source) {
    case 'day_ledger':
      return null; // the schedule board — the office's own record, stated plainly
    case 'operator_log':
    case 'helper_log':
      return 'from the filed work log';
    case 'timecard':
      // Never presented as fact: see the module note on the 7 a.m. stamp.
      return 'inferred from the clock-in tag';
  }
}

/** Human phrase for whichever record named a job. */
function sourcePhrase(source: JobEvidenceSource): string {
  switch (source) {
    case 'day_ledger':
      return 'the schedule board';
    case 'operator_log':
      return 'a filed work log';
    case 'helper_log':
      return 'a filed helper log';
    case 'timecard':
      return "the clock-in tag on this card";
  }
}

/**
 * The one-line note that keeps a disagreement visible.
 *
 * Deliberately says WHICH record made the losing claim and what beat it, because
 * the reader is deciding whether to trust the line above — and because "the card
 * says Leifeng, the board says Estes" is exactly the discrepancy the office is
 * being asked to catch.
 */
export function formatJobConflictNote(day: TimecardDayJobs | undefined | null): string | null {
  if (!day || day.conflicts.length === 0) return null;
  const named = day.conflicts
    .map((c) => {
      const label = formatJobContextLabel(c);
      return label ? `${sourcePhrase(c.source)} names ${label}` : null;
    })
    .filter(Boolean)
    .join('; ');
  if (!named) return null;
  const winner = day.jobs[0];
  const beat = winner
    ? `${sourcePhrase(winner.source)} places the day on ${formatJobContextLabel(winner)}`
    : 'nothing outranked it';
  return `Conflict — ${named}, but ${beat}. Hours are unaffected.`;
}

/** Said out loud, because a blank on a timecard reads as "no hours". */
export const NO_JOB_RECORDED = 'Job not recorded';

/** Said out loud, because "no job" and "we could not look it up" are different claims. */
export const JOB_LOOKUP_FAILED = 'Job lookup failed — not a record of "no job"';
