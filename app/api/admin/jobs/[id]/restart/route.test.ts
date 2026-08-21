/**
 * ── A RESTART IS A DATE ON A CUSTOMER'S SIGNED TICKET ───────────────────────
 *
 * `scheduled_date` goes straight to `job_phases.started_on`, and `phaseForDate`
 * files every day under the LAST phase started by then. So the two things this
 * route must never do are silent:
 *
 *   1. accept a date that lands on or before a day already worked. Leifeng
 *      restarted with 2026-08-12 typed for 2026-08-21 prints Aug 13's hours —
 *      already worked, already billed under scope A — as "Day 1" of a scope
 *      that did not exist that day, under a fabricated "Work paused 2 days"
 *      band. A fully backwards date is worse: `sortPhases` orders by
 *      `started_on`, so the new phase sorts FIRST and the sheet labels the
 *      original scope "New scope (phase 1)".
 *
 *   2. drop the note the office typed. The modal has always collected it
 *      ("Contractor called us back") and the route never read `body.reason` —
 *      the tenth thing built and never connected in one week. On Leifeng
 *      `on_hold_reason` is null, so without it the pause band on the printed
 *      sheet says "Reason:" and nothing else, on the very job this was built
 *      for.
 *
 * The last test walks the inserted rows back through `phaseGaps()` — the same
 * function the ticket renders from — so "reaches the ticket" is demonstrated
 * rather than asserted about an intermediate.
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
  requireSalesStaff: jest.fn(async () => ({
    authorized: true,
    userId: 'admin-1',
    userEmail: 'admin@example.com',
    role: 'operations_manager',
    tenantId: 'tenant-1',
  })),
}));
jest.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: jest.fn() } }));

import { POST } from './route';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { numberJobDays, phaseGaps, type JobPhase } from '@/lib/job-phases';

type Result = { data?: unknown; error?: unknown };
type Seen = { table: string; method: string; args: unknown[] };

function mockTables(queues: Record<string, Result[]>): Seen[] {
  const seen: Seen[] = [];
  const cursors: Record<string, number> = {};
  (supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => {
    const i = cursors[table] ?? 0;
    cursors[table] = i + 1;
    const result = queues[table]?.[i] ?? { data: [], error: null };
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

const ctx = { params: Promise.resolve({ id: 'job-leifeng' }) };
const req = (body: unknown) => ({ json: async () => body }) as unknown as Parameters<typeof POST>[0];

/** Leifeng, parked. Worked Aug 10, 11 and 13; comes back Friday Aug 21. */
const PARKED_JOB = {
  id: 'job-leifeng',
  job_number: 'JOB-2026-400368',
  customer_name: 'Leifeng Construction',
  tenant_id: 'tenant-1',
  status: 'on_hold',
  description: 'Saw cut and remove exterior slab at 6 areas.',
  scheduled_date: '2026-08-10',
  assigned_to: null,
  helper_assigned_to: null,
  on_hold: true,
  on_hold_placed_at: '2026-08-14T13:00:00Z',
  on_hold_placed_by: 'admin-1',
  on_hold_reason: null,
  on_hold_released_at: null,
};

const WORKED = [
  { work_date: '2026-08-10' },
  { work_date: '2026-08-11' },
  { work_date: '2026-08-13' },
];

/** Queue the reads a successful restart makes, in the order it makes them. */
function queueFor(job: Record<string, unknown> = PARKED_JOB, phases: unknown[] = []) {
  return mockTables({
    job_orders: [{ data: job }, { data: null, error: null }],
    job_phases: [{ data: phases, error: null }, { data: null, error: null }, { data: null, error: null }],
    job_workday_evidence: [{ data: WORKED, error: null }],
    job_orders_history: [{ data: null, error: null }],
  });
}

const GOOD = {
  scheduled_date: '2026-08-21',
  scope_text: 'Core drill 12 penetrations through the north wall.',
  reason: 'Contractor called us back',
};

beforeEach(() => {
  (supabaseAdmin.from as jest.Mock).mockReset();
});

describe('a restart cannot be dated into days already worked', () => {
  it('rejects the one-character typo — 08-12 for 08-21 — and writes nothing', async () => {
    const seen = queueFor();
    const res = await POST(req({ ...GOOD, scheduled_date: '2026-08-12' }), ctx);

    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toEqual({
      error: expect.stringContaining('2026-08-13'),
    });
    // Nothing was recorded and nothing was re-dated: the job is untouched.
    expect(seen.some((c) => c.method === 'insert')).toBe(false);
    expect(seen.some((c) => c.method === 'update')).toBe(false);
  });

  it('rejects a date EQUAL to the last day worked — two phases would claim it', async () => {
    queueFor();
    const res = await POST(req({ ...GOOD, scheduled_date: '2026-08-13' }), ctx);
    expect(res.status).toBe(400);
  });

  it('rejects a fully backwards date, which would print the old scope as "phase 1"', async () => {
    queueFor();
    const res = await POST(req({ ...GOOD, scheduled_date: '2026-08-01' }), ctx);
    expect(res.status).toBe(400);
  });

  it('rejects a date at or before the START of the run it is coming back from', async () => {
    // A job with no proven work yet, but a phase 2 that started Aug 18.
    const phases = [
      { id: 'p1', job_order_id: 'job-leifeng', phase_number: 1, started_on: '2026-08-10', scope_text: 'A', parked_on: '2026-08-14', park_reason: null },
      { id: 'p2', job_order_id: 'job-leifeng', phase_number: 2, started_on: '2026-08-18', scope_text: 'B', parked_on: null, park_reason: null },
    ];
    mockTables({
      job_orders: [{ data: PARKED_JOB }, { data: null, error: null }],
      job_phases: [{ data: phases, error: null }],
      job_workday_evidence: [{ data: [], error: null }],
    });
    const res = await POST(req({ ...GOOD, scheduled_date: '2026-08-18' }), ctx);
    expect(res.status).toBe(400);
  });

  it('accepts Friday Aug 21 — the day this feature was built for', async () => {
    queueFor();
    const res = await POST(req(GOOD), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()) as { data: { phase_number: number } }).toMatchObject({
      success: true,
      data: { phase_number: 2, scheduled_date: '2026-08-21' },
    });
  });
});

describe('only a parked job can be restarted', () => {
  it('refuses a job with a crew on the slab instead of downgrading it', async () => {
    mockTables({
      job_orders: [
        {
          data: {
            ...PARKED_JOB,
            status: 'in_progress',
            on_hold: false,
            on_hold_placed_at: null,
            on_hold_released_at: null,
          },
        },
      ],
    });
    const res = await POST(req(GOOD), ctx);
    expect(res.status).toBe(409);
  });

  it('accepts a job stopped by STATUS alone, with no placement timestamp', async () => {
    // Leifeng's real production shape: it was never parked through `on_hold`.
    mockTables({
      job_orders: [
        { data: { ...PARKED_JOB, on_hold: false, on_hold_placed_at: null } },
        { data: null, error: null },
      ],
      job_phases: [{ data: [], error: null }, { data: null, error: null }],
      job_workday_evidence: [{ data: WORKED, error: null }],
      job_orders_history: [{ data: null, error: null }],
    });
    const res = await POST(req(GOOD), ctx);
    expect(res.status).toBe(200);
  });
});

describe('the note the office typed reaches the printed ticket', () => {
  it('lands on the phase that ENDED, which is where the pause band reads it', async () => {
    const seen = queueFor();
    await POST(req(GOOD), ctx);

    const insert = seen.find((c) => c.table === 'job_phases' && c.method === 'insert');
    const rows = insert!.args[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);

    const outgoing = rows.find((r) => r.phase_number === 1)!;
    const incoming = rows.find((r) => r.phase_number === 2)!;
    expect(outgoing.park_reason).toBe('Contractor called us back');
    expect(outgoing.scope_text).toBe(PARKED_JOB.description);
    // The new run has not been parked, so it carries no reason of its own.
    expect(incoming.park_reason).toBeNull();
    expect(incoming.restarted_by).toBe('admin-1');

    // …and the ticket. `phaseGaps` is exactly what the printed sheet renders
    // its band from, so run the rows that were just written through it.
    const written = rows.map((r) => r as unknown as JobPhase);
    const gaps = phaseGaps(
      written,
      numberJobDays(written, ['2026-08-10', '2026-08-11', '2026-08-13', '2026-08-21'])
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0].parkReason).toBe('Contractor called us back');
    expect(gaps[0].days).toBe(8); // "Work paused 8 days · Aug 13 → Aug 21"
  });

  it('does not overwrite a reason recorded when the job was parked', async () => {
    const seen = queueFor({ ...PARKED_JOB, on_hold_reason: 'Contractor pushed us off' });
    await POST(req(GOOD), ctx);

    const insert = seen.find((c) => c.table === 'job_phases' && c.method === 'insert');
    const rows = insert!.args[0] as Array<Record<string, unknown>>;
    expect(rows.find((r) => r.phase_number === 1)!.park_reason).toBe('Contractor pushed us off');
  });

  it('keeps the typed note in the audit trail either way', async () => {
    const seen = queueFor({ ...PARKED_JOB, on_hold_reason: 'Contractor pushed us off' });
    await POST(req(GOOD), ctx);

    const audit = seen.find((c) => c.table === 'job_orders_history' && c.method === 'insert');
    const row = audit!.args[0] as { changes: Record<string, unknown>; notes: string };
    expect(row.changes.restart_note).toBe('Contractor called us back');
    expect(row.notes).toContain('Contractor called us back');
  });

  it('records no reason at all when none exists anywhere — never invents one', async () => {
    const seen = queueFor();
    await POST(req({ scheduled_date: '2026-08-21', scope_text: 'Core drill.' }), ctx);

    const insert = seen.find((c) => c.table === 'job_phases' && c.method === 'insert');
    const rows = insert!.args[0] as Array<Record<string, unknown>>;
    expect(rows.find((r) => r.phase_number === 1)!.park_reason).toBeNull();
  });
});

describe('the job row after a restart', () => {
  it('leaves the park behind and re-dates the job', async () => {
    const seen = queueFor();
    await POST(req(GOOD), ctx);

    const update = seen.find((c) => c.table === 'job_orders' && c.method === 'update');
    const payload = update!.args[0] as Record<string, unknown>;
    expect(payload.on_hold).toBe(false);
    expect(payload.on_hold_released_at).toEqual(expect.any(String));
    expect(payload.scheduled_date).toBe('2026-08-21');
    expect(payload.description).toBe(GOOD.scope_text);
    // Nobody is on it, so it comes back to the dispatch pile, not to 'assigned'.
    expect(payload.status).toBe('scheduled');
  });

  it('does NOT re-status a job parked mid-flight (the ClemTenn shape)', async () => {
    // `on_hold` true while the status still says 'assigned'. Re-statusing it
    // is the downgrade `releaseParkedJobFields` refuses to make.
    const seen = queueFor({ ...PARKED_JOB, status: 'assigned', assigned_to: 'op-1' });
    await POST(req(GOOD), ctx);

    const update = seen.find((c) => c.table === 'job_orders' && c.method === 'update');
    const payload = update!.args[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('status');
    expect(payload.on_hold).toBe(false);
  });

  it('fails CLOSED when job_phases is missing — never silently loses the old scope', async () => {
    mockTables({
      job_orders: [{ data: PARKED_JOB }],
      job_phases: [
        {
          data: null,
          error: { code: 'PGRST205', message: "Could not find the table 'public.job_phases'" },
        },
      ],
    });
    const res = await POST(req(GOOD), ctx);
    expect(res.status).toBe(503);
  });
});
