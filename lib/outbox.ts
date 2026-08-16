/**
 * THE OUTBOX — work typed with no signal, held on the phone until it lands.
 *
 * FOUNDER (Aug 16): "one issue we might run into is they try to complete
 * information but they don't have service. How can we resolve that, to ensure
 * if they don't have service there is still a way for them to save
 * information?"
 *
 * WHAT EXISTED BEFORE THIS. Nothing, plus a lie. The work-performed page wrote
 * a copy to localStorage, but that copy is only ever read to PREFILL the form —
 * no code path has ever re-sent it. `components/NetworkMonitor` told the
 * operator "Changes will sync when you reconnect", and its `handleOnline`
 * merely dismisses its own toast. So a crew member in a parking garage typed a
 * day of cutting, was told it was saved, and it never was.
 *
 * WHY A QUEUE IS SAFE HERE, which is the part that makes this workable:
 * the work-items write path REPLACES on (job, operator, work_date) rather than
 * appending. So sending the same submission twice is a no-op, not a double
 * entry — which matters, because a retrying queue WILL occasionally send twice
 * (the request succeeded but the response was lost). Idempotency on the server
 * is what earns the right to retry on the client.
 *
 * DESIGN NOTES
 *  • localStorage, not IndexedDB: these payloads are a few kB, and localStorage
 *    is synchronous, which means a submission is durable BEFORE the tab can be
 *    killed by the OS. An async IndexedDB write can lose the race with a phone
 *    that backgrounds the browser the moment the operator locks the screen.
 *  • Every entry carries its own `work_date`, so a queued day that flushes
 *    tomorrow still books to the day it was worked.
 *  • Entries are never silently dropped. They expire only after
 *    OUTBOX_MAX_AGE_MS, and an expired entry is surfaced, not deleted — losing
 *    a day of billable work quietly is the failure this whole file exists to
 *    prevent.
 */

export const OUTBOX_KEY = 'pontifex.outbox.v1';
/** After this long, stop auto-retrying and ask a human to look. 7 days. */
export const OUTBOX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Give up on a single entry after this many attempts within the age window. */
export const OUTBOX_MAX_ATTEMPTS = 25;

export interface OutboxEntry {
  /** Stable id so a flush that partially succeeds can remove only what landed. */
  id: string;
  /** Absolute URL path, e.g. `/api/job-orders/<id>/work-items`. */
  url: string;
  method: 'POST' | 'PUT' | 'PATCH';
  /** Already-serialised JSON. Kept as a string so nothing re-encodes it later. */
  body: string;
  /** Epoch ms when the operator pressed the button — NOT when it was sent. */
  queuedAt: number;
  attempts: number;
  lastError?: string;
  /** Shown in the pending list: "Work performed · Parkk Concrete · Aug 16". */
  label: string;
}

function safeParse(raw: string | null): OutboxEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((e) => e && e.id && e.url) : [];
  } catch {
    // Corrupt storage must not brick the form. An unreadable queue is bad; a
    // page that throws on load and strands the operator entirely is worse.
    return [];
  }
}

export function readOutbox(storage: Storage): OutboxEntry[] {
  return safeParse(storage.getItem(OUTBOX_KEY));
}

export function writeOutbox(storage: Storage, entries: OutboxEntry[]): void {
  try {
    storage.setItem(OUTBOX_KEY, JSON.stringify(entries));
  } catch {
    /* quota / private mode — the caller still has the in-memory copy */
  }
}

/**
 * Queue a submission. Replaces any existing entry for the same URL+method,
 * because a second attempt at the SAME day's ticket is a correction, not an
 * addition — two queued versions of one day would fight each other on flush.
 */
export function enqueue(
  storage: Storage,
  entry: Omit<OutboxEntry, 'attempts' | 'queuedAt'> & { queuedAt?: number }
): OutboxEntry[] {
  const now = entry.queuedAt ?? Date.now();
  const existing = readOutbox(storage).filter(
    (e) => !(e.url === entry.url && e.method === entry.method)
  );
  const next = [...existing, { ...entry, queuedAt: now, attempts: 0 }];
  writeOutbox(storage, next);
  return next;
}

export function removeEntry(storage: Storage, id: string): OutboxEntry[] {
  const next = readOutbox(storage).filter((e) => e.id !== id);
  writeOutbox(storage, next);
  return next;
}

/** Entries still worth retrying automatically. */
export function retryable(entries: OutboxEntry[], now = Date.now()): OutboxEntry[] {
  return entries.filter(
    (e) => now - e.queuedAt < OUTBOX_MAX_AGE_MS && e.attempts < OUTBOX_MAX_ATTEMPTS
  );
}

/**
 * Entries that have stopped retrying and now need a person. These are NOT
 * deleted — the office would never learn a day went missing.
 */
export function stuck(entries: OutboxEntry[], now = Date.now()): OutboxEntry[] {
  return entries.filter(
    (e) => now - e.queuedAt >= OUTBOX_MAX_AGE_MS || e.attempts >= OUTBOX_MAX_ATTEMPTS
  );
}

/**
 * How long to wait before attempt N. Exponential with a ceiling, so a phone
 * that is genuinely offline for an hour is not burning battery on a tight loop,
 * and a hundred crew phones coming back on one site's wifi do not arrive as a
 * thundering herd.
 */
export function backoffMs(attempts: number): number {
  const ms = 2000 * Math.pow(2, Math.max(0, attempts));
  return Math.min(ms, 5 * 60 * 1000);
}

/** What the operator is told. Plain, specific, and never falsely reassuring. */
export function pendingSummary(entries: OutboxEntry[], now = Date.now()): string {
  const waiting = retryable(entries, now);
  const blocked = stuck(entries, now);
  if (waiting.length === 0 && blocked.length === 0) return '';
  if (blocked.length > 0) {
    return `${blocked.length} ${blocked.length === 1 ? 'entry has' : 'entries have'} not sent. Tell the office — do not re-enter it.`;
  }
  return `${waiting.length} ${waiting.length === 1 ? 'entry is' : 'entries are'} saved on this phone and will send when you have signal.`;
}
