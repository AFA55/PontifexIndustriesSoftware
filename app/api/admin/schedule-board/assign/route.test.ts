/**
 * THE HELPER SEAT HAS THREE STATES AND THIS ROUTE HAS TO KEEP THEM APART.
 *
 * `operatorId` was given a tri-state after the Aug 18 crew wipe — omit the key
 * to mean "I am not touching the operator", send null to mean "take them off".
 * `helperId` was left as `helperId ?? null`, which collapses the two: an
 * omitted key arrived as an explicit clear.
 *
 * That mattered immediately, because three callers on the board now omit the
 * key on purpose:
 *   • the edit panel's `crewFields` sets `helperId` only when the helper
 *     changed — so changing ONLY the operator would have wiped the helper, and
 *     with scope 'remaining' on every remaining day of a multi-day job;
 *   • the row-operator handler omits it when the row's helper name can't be
 *     resolved (its comment says omitting keeps whoever is on it);
 *   • the drag handler does the same.
 *
 * /reorder already read it correctly. /assign did not, and none of the unit
 * tests reached this layer — which is exactly why it slipped through. These
 * tests live at the route.
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/api-auth', () => ({
  requireScheduleBoardAccess: jest.fn(async () => ({
    authorized: true,
    userId: 'admin-1',
    userEmail: 'admin@example.com',
    role: 'admin',
  })),
}));
jest.mock('@/lib/get-tenant-id', () => ({ getTenantId: jest.fn(async () => 'tenant-1') }));
jest.mock('@/lib/audit', () => ({ logAuditEvent: jest.fn() }));
jest.mock('@/lib/error-logger', () => ({ logApiError: jest.fn() }));
jest.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: jest.fn() } }));
jest.mock('@/lib/reassign', () => ({
  ...jest.requireActual('@/lib/reassign'),
  applyReassignment: jest.fn(),
}));

import { POST } from './route';
import { applyReassignment } from '@/lib/reassign';
import { supabaseAdmin } from '@/lib/supabase-admin';

type Result = { data?: unknown; error?: unknown };

function mockTables(queues: Record<string, Result[]>) {
  const seen: { table: string; method: string; args: unknown[] }[] = [];
  const cursors: Record<string, number> = {};
  (supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => {
    const i = cursors[table] ?? 0;
    cursors[table] = i + 1;
    const result = queues[table]?.[i] ?? { data: null, error: null };
    const proxy: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') {
            return (res: (v: unknown) => unknown, rej: (v: unknown) => unknown) =>
              Promise.resolve(result).then(res, rej);
          }
          if (prop === 'maybeSingle' || prop === 'single') {
            return (...args: unknown[]) => {
              seen.push({ table, method: prop as string, args });
              return Promise.resolve(result);
            };
          }
          return (...args: unknown[]) => {
            seen.push({ table, method: prop as string, args });
            return proxy;
          };
        },
      }
    ) as Record<string | symbol, unknown>;
    return proxy;
  });
  return seen;
}

const req = (body: unknown) => ({ json: async () => body }) as unknown as Parameters<typeof POST>[0];

const okReassign = {
  ok: true as const,
  job: {
    id: 'job-1',
    job_number: 'JOB-2026-000001',
    customer_name: 'Parkk Concrete',
    assigned_to: 'op-2',
    helper_assigned_to: 'helper-1',
    status: 'assigned',
  },
  day_sequence: 1,
  operator_day_job_count: 1,
  sequences: { '2026-08-18': 1 },
  crew_change: {
    operator_cleared: false,
    helper_cleared: false,
    operator_changed: true,
    helper_changed: false,
  },
};

describe('POST /assign — per-day path preserves an untouched helper seat', () => {
  beforeEach(() => {
    (applyReassignment as jest.Mock).mockReset().mockResolvedValue(okReassign);
    (supabaseAdmin.from as jest.Mock).mockReset();
  });

  it('an operator-only edit omits helperId, so the helper is KEPT (not cleared)', async () => {
    await POST(
      req({
        jobOrderId: 'job-1',
        operatorId: 'op-2',
        assignment_date: '2026-08-18',
        scope: 'remaining',
      })
    );

    const args = (applyReassignment as jest.Mock).mock.calls[0][0];
    expect(args.operatorId).toBe('op-2');
    // undefined — NOT null. `null` here is "take the helper off", and with
    // scope 'remaining' it would have done it on every remaining day.
    expect(args.helperId).toBeUndefined();
  });

  it('an explicit null helperId still clears the helper', async () => {
    await POST(
      req({
        jobOrderId: 'job-1',
        operatorId: 'op-2',
        helperId: null,
        assignment_date: '2026-08-18',
      })
    );

    expect((applyReassignment as jest.Mock).mock.calls[0][0].helperId).toBeNull();
  });

  it('a helper-only edit still omits the operator (the Aug 18 fix, unchanged)', async () => {
    await POST(
      req({ jobOrderId: 'job-1', helperId: 'helper-7', assignment_date: '2026-08-18' })
    );

    const args = (applyReassignment as jest.Mock).mock.calls[0][0];
    expect(args.operatorId).toBeUndefined();
    expect(args.helperId).toBe('helper-7');
  });
});

describe('POST /assign — legacy no-date path preserves an untouched helper seat', () => {
  beforeEach(() => {
    (applyReassignment as jest.Mock).mockReset();
    (supabaseAdmin.from as jest.Mock).mockReset();
  });

  it('leaves helper_assigned_to intact when the payload only changes the operator', async () => {
    const seen = mockTables({
      job_orders: [
        {
          data: {
            id: 'job-1',
            job_number: 'JOB-2026-000001',
            status: 'assigned',
            assigned_to: 'op-1',
            helper_assigned_to: 'helper-1',
          },
        },
        {
          data: {
            id: 'job-1',
            job_number: 'JOB-2026-000001',
            customer_name: 'Parkk Concrete',
            assigned_to: 'op-2',
            helper_assigned_to: 'helper-1',
            status: 'assigned',
          },
          error: null,
        },
      ],
    });

    const res = await POST(req({ jobOrderId: 'job-1', operatorId: 'op-2' }));
    expect(res.status).toBe(200);

    const update = seen.find((c) => c.table === 'job_orders' && c.method === 'update');
    expect(update).toBeDefined();
    const payload = update!.args[0] as Record<string, unknown>;
    expect(payload.assigned_to).toBe('op-2');
    expect(payload.helper_assigned_to).toBe('helper-1');
  });

  it('an explicit null still clears the helper on the legacy path', async () => {
    const seen = mockTables({
      job_orders: [
        {
          data: {
            id: 'job-1',
            job_number: 'JOB-2026-000001',
            status: 'assigned',
            assigned_to: 'op-1',
            helper_assigned_to: 'helper-1',
          },
        },
        { data: { id: 'job-1', job_number: 'JOB-2026-000001', assigned_to: 'op-2', helper_assigned_to: null, status: 'assigned' }, error: null },
      ],
    });

    await POST(req({ jobOrderId: 'job-1', operatorId: 'op-2', helperId: null }));

    const update = seen.find((c) => c.table === 'job_orders' && c.method === 'update');
    expect((update!.args[0] as Record<string, unknown>).helper_assigned_to).toBeNull();
  });
});

/**
 * ── TAKING THE LAST MAN OFF A PARKED JOB MUST LEAVE IT PARKED ───────────────
 *
 * JOB-2026-396494 is parked since Aug 17 with an operator on it and a
 * `scheduled_date` now in the past. The dispatcher pulls that operator off —
 * he is needed elsewhere while the job waits. If this route un-parks the job on
 * that write, it leaves the Parked column and files itself under a stale past
 * date the board's `lte(scheduled_date, today).or(end_date…)` filter does not
 * surface either: invisible again, which is the ten-day Leifeng failure caused
 * by the feature built to end it. Four of the six `on_hold` jobs in production
 * carry an operator, so it is reachable on four rows today.
 *
 * Held at the ROUTE because the unit test can only prove the helper's rule; it
 * cannot prove this route passes the right arguments to it.
 */
describe('POST /assign — a parked job stays parked unless someone lands on it', () => {
  const PARKED_WITH_OPERATOR = {
    id: 'job-1',
    job_number: 'JOB-2026-396494',
    status: 'on_hold',
    assigned_to: 'op-1',
    helper_assigned_to: null,
    on_hold: true,
    on_hold_placed_at: '2026-08-17T14:00:00Z',
    on_hold_released_at: null,
  };

  beforeEach(() => {
    (applyReassignment as jest.Mock).mockReset().mockResolvedValue(okReassign);
    (supabaseAdmin.from as jest.Mock).mockReset();
  });

  it('unassigning writes NO release — the job is still on hold afterwards', async () => {
    const seen = mockTables({
      job_orders: [
        { data: PARKED_WITH_OPERATOR },
        {
          data: {
            id: 'job-1',
            job_number: 'JOB-2026-396494',
            assigned_to: null,
            helper_assigned_to: null,
            status: 'on_hold',
          },
          error: null,
        },
      ],
    });

    await POST(req({ jobOrderId: 'job-1', operatorId: null, force: true }));

    const update = seen.find((c) => c.table === 'job_orders' && c.method === 'update');
    const payload = update!.args[0] as Record<string, unknown>;
    expect(payload.assigned_to).toBeNull();
    // The three fields that would evict it from the Parked column.
    expect(payload).not.toHaveProperty('on_hold');
    expect(payload).not.toHaveProperty('on_hold_released_at');
    expect(payload).not.toHaveProperty('status');
  });

  it('but crewing it DOES release the park — the ClemTenn fix is intact', async () => {
    const seen = mockTables({
      job_orders: [
        { data: PARKED_WITH_OPERATOR },
        {
          data: {
            id: 'job-1',
            job_number: 'JOB-2026-396494',
            assigned_to: 'op-2',
            helper_assigned_to: null,
            status: 'assigned',
          },
          error: null,
        },
      ],
    });

    await POST(req({ jobOrderId: 'job-1', operatorId: 'op-2' }));

    const update = seen.find((c) => c.table === 'job_orders' && c.method === 'update');
    const payload = update!.args[0] as Record<string, unknown>;
    expect(payload.on_hold).toBe(false);
    expect(payload.on_hold_released_at).toEqual(expect.any(String));
    expect(payload.status).toBe('assigned');
  });
});
