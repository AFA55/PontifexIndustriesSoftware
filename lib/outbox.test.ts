import {
  OUTBOX_KEY,
  OUTBOX_MAX_AGE_MS,
  OUTBOX_MAX_ATTEMPTS,
  readOutbox,
  writeOutbox,
  enqueue,
  removeEntry,
  retryable,
  stuck,
  backoffMs,
  pendingSummary,
  type OutboxEntry,
} from './outbox';

/** Minimal Storage stand-in — jsdom's localStorage is shared across tests. */
function memStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, v); },
  } as Storage;
}

const entry = (over: Partial<OutboxEntry> = {}): Omit<OutboxEntry, 'attempts'> => ({
  id: 'e1',
  url: '/api/job-orders/job-1/work-items',
  method: 'POST',
  body: '{"items":[]}',
  queuedAt: 1_000_000,
  label: 'Work performed · Parkk · Aug 16',
  ...over,
});

describe('enqueue / read', () => {
  it('holds a submission the network could not take', () => {
    const s = memStorage();
    enqueue(s, entry());
    expect(readOutbox(s)).toHaveLength(1);
    expect(readOutbox(s)[0].attempts).toBe(0);
  });

  it('REPLACES a second attempt at the same day rather than queueing both', () => {
    // Two queued versions of one day's ticket would fight each other on flush,
    // and whichever landed last would win at random. A re-submit is a
    // correction, not an addition.
    const s = memStorage();
    enqueue(s, entry({ body: '{"items":[1]}' }));
    enqueue(s, entry({ id: 'e2', body: '{"items":[1,2]}' }));
    const all = readOutbox(s);
    expect(all).toHaveLength(1);
    expect(all[0].body).toBe('{"items":[1,2]}');
  });

  it('keeps submissions for DIFFERENT jobs side by side', () => {
    const s = memStorage();
    enqueue(s, entry());
    enqueue(s, entry({ id: 'e2', url: '/api/job-orders/job-2/work-items' }));
    expect(readOutbox(s)).toHaveLength(2);
  });

  it('records when the OPERATOR pressed the button, not when it sends', () => {
    // The queued time is what proves a day was captured on the day it happened,
    // even if it only reaches the server tomorrow.
    const s = memStorage();
    enqueue(s, entry({ queuedAt: 123 }));
    expect(readOutbox(s)[0].queuedAt).toBe(123);
  });
});

describe('corrupt or empty storage', () => {
  it('reads an empty queue rather than throwing', () => {
    expect(readOutbox(memStorage())).toEqual([]);
  });

  it('survives unparseable storage', () => {
    // A page that throws on load strands the operator completely — worse than
    // an unreadable queue.
    expect(readOutbox(memStorage({ [OUTBOX_KEY]: 'not json{' }))).toEqual([]);
  });

  it('drops junk entries but keeps the good ones', () => {
    const s = memStorage({
      [OUTBOX_KEY]: JSON.stringify([{ nope: true }, null, { id: 'ok', url: '/x' }]),
    });
    expect(readOutbox(s).map((e) => e.id)).toEqual(['ok']);
  });

  it('does not throw when storage refuses to write', () => {
    const full = { ...memStorage(), setItem: () => { throw new Error('QuotaExceeded'); } } as Storage;
    expect(() => writeOutbox(full, [])).not.toThrow();
  });
});

describe('retryable / stuck', () => {
  const base = { ...entry(), attempts: 0 } as OutboxEntry;

  it('keeps retrying a fresh entry', () => {
    expect(retryable([base], base.queuedAt + 60_000)).toHaveLength(1);
    expect(stuck([base], base.queuedAt + 60_000)).toHaveLength(0);
  });

  it('stops retrying after a week and flags it for a human', () => {
    const now = base.queuedAt + OUTBOX_MAX_AGE_MS + 1;
    expect(retryable([base], now)).toHaveLength(0);
    expect(stuck([base], now)).toHaveLength(1);
  });

  it('stops retrying after too many attempts', () => {
    const tired = { ...base, attempts: OUTBOX_MAX_ATTEMPTS };
    expect(retryable([tired], base.queuedAt)).toHaveLength(0);
    expect(stuck([tired], base.queuedAt)).toHaveLength(1);
  });

  it('never deletes a stuck entry — it is still a day of work', () => {
    // `stuck` reports; nothing here removes. Losing billable work quietly is
    // the exact failure this file exists to prevent.
    const s = memStorage();
    enqueue(s, entry());
    const old = readOutbox(s).map((e) => ({ ...e, attempts: 99 }));
    writeOutbox(s, old);
    expect(readOutbox(s)).toHaveLength(1);
  });
});

describe('removeEntry', () => {
  it('removes only what actually landed', () => {
    const s = memStorage();
    enqueue(s, entry());
    enqueue(s, entry({ id: 'e2', url: '/api/job-orders/job-2/work-items' }));
    const left = removeEntry(s, readOutbox(s)[0].id);
    expect(left).toHaveLength(1);
    expect(left[0].url).toContain('job-2');
  });
});

describe('backoffMs', () => {
  it('starts quickly so a brief dropout costs seconds', () => {
    expect(backoffMs(0)).toBe(2000);
    expect(backoffMs(1)).toBe(4000);
  });

  it('backs off so an hour offline does not drain the battery', () => {
    expect(backoffMs(5)).toBe(64_000);
  });

  it('caps, so a site full of phones reconnecting is not a thundering herd', () => {
    expect(backoffMs(20)).toBe(5 * 60 * 1000);
    expect(backoffMs(999)).toBe(5 * 60 * 1000);
  });

  it('handles a nonsense attempt count without returning something negative', () => {
    expect(backoffMs(-3)).toBe(2000);
  });
});

describe('pendingSummary', () => {
  const base = { ...entry(), attempts: 0 } as OutboxEntry;

  it('says nothing when there is nothing waiting', () => {
    expect(pendingSummary([])).toBe('');
  });

  it('promises only what it can deliver', () => {
    // "will send when you have signal" is true — there IS a flusher. The old
    // NetworkMonitor message said this while nothing re-sent anything.
    const msg = pendingSummary([base], base.queuedAt + 1000);
    expect(msg).toMatch(/saved on this phone/i);
    expect(msg).toMatch(/will send when you have signal/i);
  });

  it('escalates to a human instead of promising a retry that stopped', () => {
    const msg = pendingSummary([base], base.queuedAt + OUTBOX_MAX_AGE_MS + 1);
    expect(msg).toMatch(/not sent/i);
    expect(msg).toMatch(/tell the office/i);
    // Re-entering it would double-count against a server that replaces on
    // (job, operator, work_date) only if the date matches — a re-typed entry
    // on a different day would be a second row.
    expect(msg).toMatch(/do not re-enter/i);
  });

  it('counts correctly in the singular and the plural', () => {
    const two = [base, { ...base, id: 'e2', url: '/api/job-orders/job-2/work-items' }];
    expect(pendingSummary([base], base.queuedAt)).toMatch(/1 entry is/);
    expect(pendingSummary(two, base.queuedAt)).toMatch(/2 entries are/);
  });
});
