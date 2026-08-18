/**
 * Orchestration tests — specifically, what happens when the monitor's OWN
 * storage misbehaves.
 *
 * `loadHistory` returning an empty map on a read failure looked harmless. It
 * is not: with no history every metric is judged `new_breach`, so six live
 * breaches become six Telegram messages every single morning, forever, logged
 * only to console.error. That is both untrue (nothing is new) and the exact
 * mechanism by which the channel gets muted — which costs the feature the only
 * thing it has, the founder's trust that a message means something.
 */

const mockSelect = { data: [] as unknown[], error: null as { message: string } | null };
const mockInsert = { error: null as { message: string } | null };
const mockInserted: unknown[][] = [];

jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from() {
      const builder: Record<string, unknown> = {};
      const chain =
        () =>
        (...args: unknown[]) => {
          void args;
          return builder;
        };
      for (const fn of ['select', 'eq', 'gte', 'not', 'order', 'limit']) builder[fn] = chain();
      builder.insert = (rows: unknown[]) => {
        mockInserted.push(rows);
        return Promise.resolve({ error: mockInsert.error });
      };
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve({ data: mockSelect.error ? null : mockSelect.data, error: mockSelect.error }));
      return builder;
    },
  },
}));

import { deliverReport, loadHistory, type TenantHealthReport } from './service';
import type { MetricResultWithTrend } from './types';

function metric(over: Partial<MetricResultWithTrend> = {}): MetricResultWithTrend {
  return {
    key: 'signed_completions',
    label: 'Signed completions',
    unit: 'ratio',
    direction: 'higher_is_better',
    threshold: 0.7,
    why: 'A finished job with no signature is a bill you may not be able to defend.',
    status: 'breach',
    value: 0.13,
    numerator: 2,
    denominator: 15,
    detail: {},
    unknownReason: null,
    error: null,
    sentence: 'Only 2 of 15 of the last finished jobs have a customer signature on file.',
    action: 'Check the completion step is actually asking for a signature.',
    href: '/dashboard/admin/completed-jobs',
    prior: null,
    delta: null,
    trend: 'unknown',
    ...over,
  };
}

/** Six live breaches — the state of Patriot the day this shipped. */
function sixBreaches(): TenantHealthReport {
  return {
    tenantId: 'patriot',
    tenantName: 'Patriot Concrete Cutting',
    timezone: 'America/New_York',
    measuredAt: new Date('2026-08-18T12:30:00Z').toISOString(),
    results: Array.from({ length: 6 }, (_, i) =>
      metric({ key: `metric_${i}`, label: `Metric ${i}` })
    ),
  };
}

beforeEach(() => {
  mockSelect.data = [];
  mockSelect.error = null;
  mockInsert.error = null;
  mockInserted.length = 0;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('loadHistory', () => {
  it('returns NULL when the read fails — not an empty map', () => {
    // An empty map is indistinguishable from a brand-new tenant, and that
    // ambiguity is what turned a broken read into six daily false alarms.
    mockSelect.error = { message: 'relation does not exist' };
    return expect(loadHistory('patriot')).resolves.toBeNull();
  });

  it('buckets rows by metric on the happy path', async () => {
    mockSelect.data = [
      { metric_key: 'a', status: 'ok', value: '0.4', measured_at: '2026-08-17T12:30:00Z', alerted_at: null },
      { metric_key: 'a', status: 'breach', value: '0.2', measured_at: '2026-08-16T12:30:00Z', alerted_at: null },
      { metric_key: 'b', status: 'ok', value: null, measured_at: '2026-08-17T12:30:00Z', alerted_at: null },
    ];
    const history = await loadHistory('patriot');

    expect(history).not.toBeNull();
    expect(history!.get('a')).toHaveLength(2);
    // PostgREST hands numerics back as strings often enough to matter.
    expect(history!.get('a')![0].value).toBe(0.4);
    expect(history!.get('b')![0].value).toBeNull();
  });
});

describe('deliverReport when the history read failed', () => {
  it('sends ONE line about the monitor, not six "NEW" alerts', async () => {
    const sent: string[] = [];
    const outcome = await deliverReport(sixBreaches(), null, {
      nowMs: new Date('2026-08-18T12:30:00Z').getTime(),
      sendFn: async (text) => {
        sent.push(text);
        return true;
      },
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('could not read its own history');
    expect(sent[0]).not.toContain('NEW');
    expect(outcome.historyUnavailable).toBe(true);
    expect(outcome.reported).toEqual([]);
  });

  it('still records every measurement, and stamps NONE of them as alerted', async () => {
    // The numbers are good; only the comparison is missing. Throwing them away
    // would also throw away tomorrow's ability to compare.
    await deliverReport(sixBreaches(), null, {
      nowMs: new Date('2026-08-18T12:30:00Z').getTime(),
      sendFn: async () => true,
    });

    expect(mockInserted).toHaveLength(1);
    const rows = mockInserted[0] as Array<{ alerted_at: string | null }>;
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.alerted_at === null)).toBe(true);
  });

  it('reports the attempt so a dead channel can be spotted', async () => {
    const outcome = await deliverReport(sixBreaches(), null, {
      nowMs: Date.now(),
      sendFn: async () => false,
    });

    expect(outcome.messageAttempted).toBe(true);
    expect(outcome.messageSent).toBe(false);
    expect(outcome.sendError).toContain('transport declined');
  });

  it('says "dry run", not "declined", when the caller declined on purpose', async () => {
    // Otherwise a deliberate no-send reads like a broken channel in the cron's
    // JSON — and, worse, a broken channel reads like a dry run.
    const outcome = await deliverReport(sixBreaches(), null, {
      nowMs: Date.now(),
      sendFn: async () => false,
      declineReason: 'not sent — dry run',
    });

    expect(outcome.sendError).toBe('not sent — dry run');
  });
});

describe('deliverReport with history', () => {
  it('says nothing at all on an ordinary day where nothing changed', async () => {
    const history = new Map([
      [
        'metric_0',
        [
          {
            metric_key: 'metric_0',
            status: 'breach' as const,
            value: 0.13,
            measured_at: '2026-08-17T12:30:00Z',
            alerted_at: '2026-08-17T12:30:00Z',
          },
          {
            metric_key: 'metric_0',
            status: 'breach' as const,
            value: 0.13,
            measured_at: '2026-08-16T12:30:00Z',
            alerted_at: null,
          },
        ],
      ],
    ]);
    const report: TenantHealthReport = {
      ...sixBreaches(),
      results: [metric({ key: 'metric_0' })],
    };

    const sent: string[] = [];
    const outcome = await deliverReport(report, history, {
      // A Tuesday — the Monday summary would otherwise report everything.
      nowMs: new Date('2026-08-18T12:30:00Z').getTime(),
      sendFn: async (t) => {
        sent.push(t);
        return true;
      },
    });

    expect(sent).toHaveLength(0);
    expect(outcome.messageAttempted).toBe(false);
    expect(outcome.historyUnavailable).toBe(false);
    expect(outcome.rowsWritten).toBe(1);
  });
});
