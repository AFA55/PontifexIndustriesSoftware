/**
 * CREW ASSIGNMENT SAFETY — the rules that stop a crew coming off a job nobody
 * asked to change.
 *
 * ── WHAT HAPPENED (Aug 18, 2026, mid-workday) ─────────────────────────────
 * The founder changed the HELPER on one schedule-board row. In four seconds
 * three jobs lost their operator — Conrade Richardson, "Nate" — including two
 * that were already `in_route` with crews driving to them, and a ticket
 * assigned ninety seconds earlier. Nothing errored and nothing said so; the
 * board still drew Conrade's name until the next refetch.
 *
 * Two independent faults had to line up:
 *
 *   1. THE BOARD IS KEYED ON A NAME, AND THE TWO ENDS SPELL IT DIFFERENTLY.
 *      A board row is labelled with `job_daily_assignments.operator_name` /
 *      `schedule_board_view.operator_name`, both of which are the bare
 *      `profiles.full_name` — "Conrade Richardson". The crew roster
 *      (/api/admin/schedule-board/operators) builds its `name` through
 *      `displayName()`, which since Aug 15 appends the nickname —
 *      "Conrade Richardson (Nate)". So `operatorIdMap["Conrade Richardson"]`
 *      was `undefined`. Everyone WITHOUT a nickname was unaffected, which is
 *      why this looked like it singled one man out.
 *
 *   2. AN UNDEFINED LOOKUP WAS TREATED AS "NOBODY". The row-helper handler
 *      sent `operatorId: operatorIdMap[rowOperatorName] || null` — restating
 *      an operator it had no business restating, and restating it as null.
 *      The write path could not tell "clear the operator" from "I didn't
 *      resolve one", because its `operatorId` was `string | null` with no
 *      third state, unlike `helperId` which has always had one.
 *
 * The rules below are the fix, kept pure so they can be tested without a
 * database and shared by the board client and the API routes.
 */

// ─── 1. Alias-aware name → id resolution ───────────────────────────────────

export interface CrewRosterEntry {
  id: string;
  /** Display name as rendered in pickers — may carry "(Nickname)" / "(email)". */
  name: string;
  /** `profiles.full_name` — what job rows and the per-day ledger are labelled with. */
  fullName?: string | null;
  /** `profiles.nickname` — what the office says out loud. */
  nickname?: string | null;
}

/**
 * An index value of `null` means the alias is AMBIGUOUS (two people answer to
 * it). Ambiguous never resolves: guessing which of two operators the office
 * meant is worse than refusing.
 */
export type CrewNameIndex = Map<string, string | null>;

function normalizeCrewName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Build a name→id index that answers to every spelling of a person the board
 * can possibly be holding: the roster display name, the bare full name (what
 * job rows are labelled with), and the nickname on its own.
 */
export function buildCrewNameIndex(entries: CrewRosterEntry[]): CrewNameIndex {
  const index: CrewNameIndex = new Map();

  const add = (alias: string | null | undefined, id: string) => {
    const key = normalizeCrewName(alias);
    if (!key) return;
    if (!index.has(key)) {
      index.set(key, id);
      return;
    }
    const existing = index.get(key);
    // Same person listed twice (operators AND helpers arrays) is not ambiguity.
    if (existing === id) return;
    index.set(key, null); // genuinely two people — refuse to resolve it
  };

  for (const e of entries) {
    if (!e?.id) continue;
    add(e.name, e.id);
    add(e.fullName, e.id);
    add(e.nickname, e.id);
  }

  return index;
}

/**
 * Resolve a crew name to a user id. Returns `null` when the name is unknown OR
 * ambiguous — callers MUST treat `null` as "I do not know who this is", never
 * as "nobody".
 */
export function resolveCrewId(index: CrewNameIndex, name: string | null | undefined): string | null {
  const key = normalizeCrewName(name);
  if (!key) return null;
  return index.get(key) ?? null;
}

// ─── 2. When a crew may be taken off a job ─────────────────────────────────

/**
 * Someone is standing on the job. `in_route` counts: the truck is moving, and
 * a board that says nobody is on it is worse than useless to the office trying
 * to find them.
 */
export const LIVE_JOB_STATUSES = [
  'in_route',
  'on_site',
  'in_progress',
  'pending_completion',
] as const;

export function isLiveJobStatus(status: string | null | undefined): boolean {
  return !!status && (LIVE_JOB_STATUSES as readonly string[]).includes(status);
}

export interface CrewClearCheck {
  status: string | null | undefined;
  prevOperatorId: string | null;
  prevHelperId: string | null;
  nextOperatorId: string | null;
  nextHelperId: string | null;
  /** True when a daily log / work item exists for this job today. */
  hasWorkLogged?: boolean;
}

/** Somebody was on this job, and after this write nobody would be. */
export function stripsCrew(c: CrewClearCheck): boolean {
  const hadSomeone = !!c.prevOperatorId || !!c.prevHelperId;
  const keepsSomeone = !!c.nextOperatorId || !!c.nextHelperId;
  return hadSomeone && !keepsSomeone;
}

/**
 * A crew clear that must not happen as a side effect. The office may still do
 * it — deliberately, with `force` — but never by pressing something else.
 */
export function crewClearNeedsConfirmation(c: CrewClearCheck): boolean {
  if (!stripsCrew(c)) return false;
  return isLiveJobStatus(c.status) || c.hasWorkLogged === true;
}

/**
 * Message shown to the office when a crew clear is blocked. Deliberately says
 * what to do instead — a blocked action with no next step is just a wall.
 */
export function crewClearBlockedMessage(jobNumber: string | null | undefined, status: string | null | undefined): string {
  const label = (status || 'live').replace(/_/g, ' ');
  return `${jobNumber || 'This job'} is ${label} — a crew is on it right now. Assign someone else instead, or confirm you really mean to leave it with nobody.`;
}

/**
 * DATE MOVE → CREW CLEAR (`movingStart` in the admin job-order PATCH route).
 *
 * The rule exists for a good reason: crew is a per-day assignment, so whoever
 * was free on Monday is not necessarily free on Thursday, and a silently
 * carried operator means nobody re-checks. That reasoning describes a job
 * nobody has started.
 *
 * It stops describing a job that is `in_route` or being worked. There, a date
 * edit is almost always a correction — fixing an end date, nudging a
 * multi-day span — and the crew on it is a fact about the present, not a
 * guess about a future day. So the clear is withheld for live/worked jobs; the
 * office can still take a crew off explicitly.
 *
 * Note this is deliberately NOT gated on `dispatched_at`. A dispatched but
 * unstarted job that moves to next week SHOULD go back to the unassigned pool
 * for re-picking — that is the whole point of the rule. It is being STARTED
 * that makes the crew a fact.
 */
export function shouldClearCrewOnDateMove(job: {
  status: string | null | undefined;
  hasWorkLogged?: boolean;
}): boolean {
  if (isLiveJobStatus(job.status)) return false;
  if (job.hasWorkLogged === true) return false;
  return true;
}

// ─── 3. Saying what changed ────────────────────────────────────────────────

export interface CrewChangeSummary {
  operator_cleared: boolean;
  helper_cleared: boolean;
  operator_changed: boolean;
  helper_changed: boolean;
}

export function summarizeCrewChange(
  prev: { operatorId: string | null; helperId: string | null },
  next: { operatorId: string | null; helperId: string | null }
): CrewChangeSummary {
  return {
    operator_changed: prev.operatorId !== next.operatorId,
    helper_changed: prev.helperId !== next.helperId,
    operator_cleared: !!prev.operatorId && !next.operatorId,
    helper_cleared: !!prev.helperId && !next.helperId,
  };
}

/**
 * One human sentence for a toast / API `notice`, or null when nothing was
 * taken off. The office pressed a button and three jobs quietly lost their
 * operator; whatever the rule, the answer has to say so.
 */
export function describeCrewClear(
  summary: CrewChangeSummary,
  names: { operator?: string | null; helper?: string | null }
): string | null {
  const lost: string[] = [];
  if (summary.operator_cleared) lost.push(names.operator || 'the operator');
  if (summary.helper_cleared) lost.push(names.helper || 'the helper');
  if (lost.length === 0) return null;
  return `${lost.join(' and ')} ${lost.length > 1 ? 'were' : 'was'} taken off this job — it now has no ${summary.operator_cleared ? 'operator' : 'helper'}.`;
}
