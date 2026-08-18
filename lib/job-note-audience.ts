/**
 * Job notes have TWO audiences (founder, Aug 15):
 *   • `internal` — the office talking to itself. The crew never sees it.
 *   • `operator` — the office talking TO the crew. The crew sees it, its photos
 *                  come with it, and the crew is told it arrived.
 *
 * Pure + dependency-free on purpose: the two questions that actually matter
 * here — "may this person see this note?" and "who has to be told?" — are the
 * two that are expensive to get wrong and impossible to unit-test once they are
 * tangled up with Supabase. Both live here; the API route and both UIs call in.
 */

export type NoteAudience = 'internal' | 'operator';

/**
 * Non-worker tiers from lib/rbac.ts (worker = operator / apprentice /
 * shop_help). An ALLOWLIST, not a denylist — a role invented next month must
 * not silently inherit the office's private notes. Mirrors the RLS policy in
 * 20260815c_job_note_audience_and_photos.sql; if you change one, change both.
 */
export const OFFICE_NOTE_ROLES: readonly string[] = [
  'super_admin',
  'operations_manager',
  'admin',
  'supervisor',
  'salesman',
  'shop_manager',
  'inventory_manager',
];

export function isOfficeRole(role: string | null | undefined): boolean {
  return !!role && OFFICE_NOTE_ROLES.includes(role);
}

/**
 * The crew's half of the conversation.
 *
 * A crew reply is `audience: 'internal'` — only the office may address a crew,
 * and that rule does not move. But a reply typed into the crew-facing thread is
 * ALSO readable by the rest of the crew on that job: a two-man crew that cannot
 * see what its own operator already told the office asks the office the same
 * question twice.
 *
 * That widening is scoped to this ONE note_type on purpose. An operator's
 * workflow notes ('amendment', 'completion', 'done_for_day') stay author-only —
 * a day-complete note about a helper must not become readable by that helper.
 *
 * Only a NON-office author may write it (enforced in the POST route), so the
 * office cannot hand a crew an internal note by mislabelling its kind.
 */
export const CREW_REPLY_NOTE_TYPE = 'crew_reply';

export function isCrewReply(note: NoteVisibilityRecord): boolean {
  return note.note_type === CREW_REPLY_NOTE_TYPE;
}

/**
 * Anything that is not explicitly `operator` is `internal`.
 *
 * The asymmetry is deliberate and is the whole safety property: a typo, a stale
 * client, a missing field or an unknown value must fall to the private side.
 * Promoting a note the office believed was private has no undo.
 */
export function normalizeNoteAudience(value: unknown): NoteAudience {
  return value === 'operator' ? 'operator' : 'internal';
}

export interface NoteVisibilityRecord {
  audience?: string | null;
  note_type?: string | null;
  author_id?: string | null;
}

export interface NoteViewer {
  userId: string;
  role: string | null | undefined;
  /** Is this viewer crewed on the job (any of the three assignment paths)? */
  isCrewOnJob: boolean;
}

/**
 * THE VISIBILITY RULE, in one place:
 * the office sees every note; everyone else sees only their own notes, plus
 * `operator`-audience notes and crew replies on a job they are crewed on.
 */
export function canViewNote(viewer: NoteViewer, note: NoteVisibilityRecord): boolean {
  // change_log rows are machine chatter — no longer written, never shown.
  if (note.note_type === 'change_log') return false;
  if (note.author_id && note.author_id === viewer.userId) return true;
  if (isOfficeRole(viewer.role)) return true;
  if (!viewer.isCrewOnJob) return false;
  // The crew's own thread — see CREW_REPLY_NOTE_TYPE. Deliberately keyed off the
  // note KIND, never off `audience`: a reply stays `internal`, so nothing here
  // widens who may be ADDRESSED, only who may read the crew's own words.
  if (isCrewReply(note)) return true;
  return normalizeNoteAudience(note.audience) === 'operator';
}

export function filterVisibleNotes<T extends NoteVisibilityRecord>(
  viewer: NoteViewer,
  notes: T[],
): T[] {
  return notes.filter((n) => canViewNote(viewer, n));
}

// ── Who gets told ────────────────────────────────────────────────────────────

export interface CrewSources {
  job?: { assigned_to?: string | null; helper_assigned_to?: string | null } | null;
  /** Extra crew added through the "+" path. */
  crew?: Array<{ user_id?: string | null }> | null;
  /**
   * The PER-DAY ledger. Pre-filtered by the caller to current/future dates —
   * this is how the board actually places people, and a job can be crewed
   * entirely through it with both job-level slots null (see lib/dispatch.ts).
   * Readers that skip it are the reason four jobs went out silently this week.
   */
  dailyAssignments?: Array<{ operator_id?: string | null; helper_id?: string | null }> | null;
}

/** Every user id crewed on the job, from all three assignment paths, deduped. */
export function resolveJobCrewUserIds(sources: CrewSources): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | null | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  add(sources.job?.assigned_to);
  add(sources.job?.helper_assigned_to);
  for (const c of sources.crew ?? []) add(c?.user_id);
  for (const d of sources.dailyAssignments ?? []) {
    add(d?.operator_id);
    add(d?.helper_id);
  }
  return out;
}

/**
 * The office side of the conversation — who, in the office, owns this job.
 *
 * A crew reply must NOT go to "every admin". The office bell is only read while
 * it is worth reading; nine people getting a notification meant for one is how
 * it stops being read, and then the reply may as well not have been written.
 */
export interface OfficeSources {
  /**
   * Author ids of the office→crew notes already on this job. Whoever asked the
   * question is who is waiting on the answer, so they are notified first.
   */
  officeNoteAuthorIds?: Array<string | null | undefined> | null;
  /**
   * `job_orders.project_manager_id` — the job's owner. The fallback for a
   * reply on a job where no office note survives to name an asker.
   */
  projectManagerId?: string | null;
}

/**
 * Who hears a crew reply: the office people who wrote to this crew, or failing
 * that the job's project manager. Never the replier themselves.
 */
export function resolveCrewReplyNotifyRecipients(
  sources: OfficeSources,
  opts: { authorId?: string | null },
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | null | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  for (const id of sources.officeNoteAuthorIds ?? []) add(id);
  // Only when nobody in the office has spoken on this job — a PM who is already
  // one of the askers is not notified twice, and a PM who never wrote to this
  // crew is not pulled into a thread somebody else is holding.
  if (out.length === 0) add(sources.projectManagerId);
  return out.filter((id) => id !== opts.authorId);
}

/**
 * Who is notified when a note is posted. BOTH DIRECTIONS:
 *
 *   • office → crew (`audience: 'operator'`) — the whole crew on the job.
 *   • crew  → office (`note_type: 'crew_reply'`) — the office people who wrote
 *     to this crew, else the project manager.
 *
 * Any other `internal` note notifies NOBODY here — that is the point of it.
 * The author is never notified about their own note.
 *
 * The crew-reply branch is keyed off the note KIND, not the audience, because a
 * reply deliberately stays `audience: 'internal'` (see CREW_REPLY_NOTE_TYPE).
 */
export function resolveNoteNotifyRecipients(
  sources: CrewSources & OfficeSources,
  opts: { audience: unknown; authorId?: string | null; noteType?: string | null },
): string[] {
  if (opts.noteType === CREW_REPLY_NOTE_TYPE) {
    return resolveCrewReplyNotifyRecipients(sources, opts);
  }
  if (normalizeNoteAudience(opts.audience) !== 'operator') return [];
  return resolveJobCrewUserIds(sources).filter((id) => id !== opts.authorId);
}

/** Trim a note down to something that reads well inside a push notification. */
export function notePreview(content: string, max = 120): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
