/**
 * WHICH PILE A JOB LANDS IN — the line where the founder's request actually died.
 *
 * The board GET splits the day's jobs into `assigned` (drawn on a crew row) and
 * `unassigned` (the dispatch pile). It read `job.assigned_to` alone, so a job
 * crewed with a HELPER AND NO OPERATOR was filed as unassigned: the office
 * pressed assign, watched the ticket drop straight back into the pile, and
 * concluded it had not worked. Zero of 111 production ledger rows were
 * helper-only, and this line is the reason.
 *
 * Three claims are held here, and the second and third are the ones that keep the
 * fix from becoming its own bug:
 *
 *   1. A helper the LEDGER placed on this date is a crew.
 *   2. A ledger row that places NOBODY is not — even when the job's own
 *      `helper_assigned_to` is still set. 11 production rows have exactly that
 *      shape: a date held open on the board for a job that has a helper on other
 *      days. They must keep landing in the pile.
 *   3. On a date the ledger never spoke for, the job's helper SEAT places nobody
 *      either. It is a job-level column, not a statement about this date; reading
 *      it would take a job out of the dispatch pile on a seat nobody stated —
 *      extend an `end_date` past the ledger rows and the new days would silently
 *      draw as crewed. `assigned_to` keeps its long-standing fallback; the helper
 *      seat never had one and does not get one.
 *
 * Plus the thing that must survive shipping ahead of the founder's hand-applied
 * migration: PostgREST rejects the WHOLE select on one unknown column, and this
 * select IS the per-day overlay. Unguarded, a missing `off_platform_lead_name`
 * would not degrade the lead's name — it would take the entire overlay down and
 * the board would quietly draw the job's first-ever operator on every date.
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
    role: 'super_admin',
  })),
}));
jest.mock('@/lib/get-tenant-id', () => ({ getTenantId: jest.fn(async () => 'tenant-1') }));
jest.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: jest.fn() } }));

import { GET } from './route';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { OFF_PLATFORM_LEAD_COLUMN } from '@/lib/off-platform-lead';

type Result = { data?: unknown; error?: unknown };
type Seen = { table: string; method: string; args: unknown[] };

const DATE = '2026-08-21'; // a Friday — a workday, so nothing is filtered by span rules

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

const req = { url: `https://x/api/admin/schedule-board?date=${DATE}` } as unknown as Parameters<typeof GET>[0];

function boardJob(over: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    job_number: 'JOB-2026-521763',
    customer_name: 'BWC Contracting',
    tenant_id: 'tenant-1',
    status: 'assigned',
    scheduled_date: DATE,
    end_date: null,
    is_will_call: false,
    assigned_to: null,
    helper_assigned_to: null,
    scheduling_flexibility: null,
    ...over,
  };
}

async function pilesFor(jobs: unknown[], ledger: Result | undefined) {
  mockTables({
    tenants: [{ data: { timezone: 'America/New_York' } }],
    schedule_board_view: [{ data: jobs }, { data: [] }, { data: [] }],
    job_daily_assignments: ledger ? [ledger] : [{ data: [] }],
    job_crew: [{ data: [] }],
  });
  const res = await GET(req);
  const body = (await res.json()) as { data: { assigned: { id: string }[]; unassigned: { id: string }[] } };
  return {
    assigned: body.data.assigned.map((j) => j.id),
    unassigned: body.data.unassigned.map((j) => j.id),
  };
}

beforeEach(() => {
  (supabaseAdmin.from as jest.Mock).mockReset();
});

describe('a crew of one helper is still a crew', () => {
  it('draws a helper-only ledger placement on the board, not in the unassigned pile', async () => {
    const piles = await pilesFor(
      [boardJob()],
      {
        data: [
          {
            job_order_id: 'job-1',
            operator_id: null,
            helper_id: 'axel',
            operator_name: null,
            helper_name: 'Axel Valverde',
            day_sequence: 1,
            [OFF_PLATFORM_LEAD_COLUMN]: 'Mike Sanchez',
          },
        ],
      }
    );
    expect(piles.assigned).toEqual(['job-1']);
    expect(piles.unassigned).toEqual([]);
  });

  it('carries the off-platform lead through to the board so the row can name it', async () => {
    mockTables({
      tenants: [{ data: { timezone: 'America/New_York' } }],
      schedule_board_view: [{ data: [boardJob()] }, { data: [] }, { data: [] }],
      job_daily_assignments: [
        {
          data: [
            {
              job_order_id: 'job-1',
              operator_id: null,
              helper_id: 'axel',
              helper_name: 'Axel Valverde',
              day_sequence: 1,
              [OFF_PLATFORM_LEAD_COLUMN]: 'Mike Sanchez',
            },
          ],
        },
      ],
      job_crew: [{ data: [] }],
    });
    const body = (await (await GET(req)).json()) as {
      data: { assigned: Array<Record<string, unknown>> };
    };
    expect(body.data.assigned[0].off_platform_lead_name).toBe('Mike Sanchez');
  });
});

describe('the shapes that must stay in the dispatch pile', () => {
  it('keeps a ledger row that places NOBODY unassigned, even with a helper on the job', async () => {
    // The 11 production rows. The ledger has spoken for this date and what it
    // said was "nobody" — the job's own seats are no longer the answer.
    const piles = await pilesFor(
      [boardJob({ helper_assigned_to: 'axel' })],
      {
        data: [
          { job_order_id: 'job-1', operator_id: null, helper_id: null, day_sequence: 1 },
        ],
      }
    );
    expect(piles.unassigned).toEqual(['job-1']);
    expect(piles.assigned).toEqual([]);
  });

  it('does NOT let a stale helper seat crew a date the ledger never stated', async () => {
    // No ledger row at all — e.g. an end_date extended past the days the office
    // actually stated. A job nobody sees in the pile is a job nobody dispatches.
    const piles = await pilesFor([boardJob({ helper_assigned_to: 'axel' })], { data: [] });
    expect(piles.unassigned).toEqual(['job-1']);
  });

  it('leaves the operator seat’s own fallback alone — that one is long-standing', async () => {
    const piles = await pilesFor([boardJob({ assigned_to: 'nate' })], { data: [] });
    expect(piles.assigned).toEqual(['job-1']);
  });
});

describe('the migration is applied by hand, so the overlay has to survive its absence', () => {
  it('re-selects without the lead column and keeps the whole per-day overlay', async () => {
    const seen = mockTables({
      tenants: [{ data: { timezone: 'America/New_York' } }],
      schedule_board_view: [{ data: [boardJob({ assigned_to: 'first-ever-op' })] }, { data: [] }, { data: [] }],
      job_daily_assignments: [
        // Postgres' answer when the column is not there yet. PostgREST rejects
        // the ENTIRE select, not just the column.
        {
          data: null,
          error: {
            code: '42703',
            message: `column job_daily_assignments.${OFF_PLATFORM_LEAD_COLUMN} does not exist`,
          },
        },
        {
          data: [
            {
              job_order_id: 'job-1',
              operator_id: 'todays-op',
              helper_id: 'axel',
              operator_name: "Today's Operator",
              helper_name: 'Axel Valverde',
              day_sequence: 2,
            },
          ],
        },
      ],
      job_crew: [{ data: [] }],
    });

    const body = (await (await GET(req)).json()) as {
      data: { assigned: Array<Record<string, unknown>> };
    };

    // Two selects: the hopeful one, then the exact previous shape.
    const selects = seen.filter((s) => s.table === 'job_daily_assignments' && s.method === 'select');
    expect(selects).toHaveLength(2);
    expect(String(selects[0].args[0])).toContain(OFF_PLATFORM_LEAD_COLUMN);
    expect(String(selects[1].args[0])).not.toContain(OFF_PLATFORM_LEAD_COLUMN);

    // …and the overlay still happened: the board shows TODAY's operator, not the
    // job's first-ever one, with only the lead's name missing.
    const job = body.data.assigned[0];
    expect(job.assigned_to).toBe('todays-op');
    expect(job.day_sequence).toBe(2);
    expect(job.off_platform_lead_name).toBeNull();
  });
});

// ═══ THE PARKED BUCKET ══════════════════════════════════════════════════════
//
// Leifeng sat parked ten days and appeared nowhere. The fix gives parked jobs a
// bucket of their own — GLOBAL, like will-call, because a parked job's date
// stopped meaning anything the moment it was parked.
//
// The claim that has to hold here is the one that would otherwise make the
// column WORSE than nothing: a parked job must leave the day's classification
// BEFORE `placesSomeone` sees it. Its scheduled_date still matches the filter,
// so without the diversion it draws in its operator's row AND in the folder —
// one job in two places, one of which says a crew is on it today.

describe('the parked bucket', () => {
  // Pinned so `days_parked` is arithmetic, not a function of the day this runs.
  // The park stamps are midday UTC, which is the same calendar day in every
  // timezone a person works in.
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20T16:00:00Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  /** Pinnacle Contracting, JOB-2026-815303 — parked since Jul 28. */
  const pinnacle = boardJob({
    id: 'pinnacle',
    job_number: 'JOB-2026-815303',
    customer_name: 'Pinnacle Contracting',
    status: 'on_hold',
    on_hold: true,
    on_hold_placed_at: '2026-07-28T12:05:41.409Z',
    on_hold_released_at: null,
    on_hold_reason: "Moved to Pending — contractor hasn't set a firm date",
    total_days_worked: 1,
  });

  /** Messer, JOB-2026-396494 — parked Aug 17, three days ago. */
  const messer = boardJob({
    id: 'messer',
    job_number: 'JOB-2026-396494',
    customer_name: 'Messer Construction',
    status: 'on_hold',
    on_hold: true,
    on_hold_placed_at: '2026-08-17T12:00:00.000Z',
    on_hold_released_at: null,
    on_hold_reason: 'Site not ready: Electrician are not ready',
    total_days_worked: 1,
  });

  /**
   * ClemTenn, JOB-2026-974669 — RELEASED BY HAND, flag left behind. The exact
   * production row that breaks a naive `on_hold === true`.
   */
  const clemtenn = boardJob({
    id: 'clemtenn',
    job_number: 'JOB-2026-974669',
    customer_name: 'ClemTenn',
    assigned_to: 'nate',
    on_hold: true,
    on_hold_placed_at: '2026-08-14T20:18:01.568Z',
    on_hold_released_at: '2026-08-20T12:02:01.493Z',
  });

  function board(dated: unknown[], parkedRows: Result, willCallRows: unknown[] = []) {
    mockTables({
      tenants: [{ data: { timezone: 'America/New_York' } }],
      schedule_board_view: [
        { data: dated },
        { data: [] }, // pending
        { data: willCallRows }, // will-call
        parkedRows, // parked
      ],
      job_daily_assignments: [{ data: [] }],
      job_crew: [{ data: [] }],
    });
    return GET(req);
  }

  type Body = {
    data: {
      assigned: { id: string }[];
      unassigned: { id: string }[];
      willCall: { id: string }[];
      parked: { id: string; job_number: string; days_parked: number | null; total_days_worked: number }[];
    };
  };

  it('draws a parked job ONCE — in the folder, never also on its old crew row', async () => {
    // The date filter still matches it: `scheduled_date` is simply stale.
    const res = await board(
      [pinnacle, boardJob({ id: 'live', assigned_to: 'nate' })],
      { data: [pinnacle] }
    );
    const body = (await res.json()) as Body;

    expect(body.data.parked.map((j) => j.id)).toEqual(['pinnacle']);
    expect(body.data.assigned.map((j) => j.id)).toEqual(['live']);
    expect(body.data.unassigned).toEqual([]);
  });

  it('does not park a job that was released by hand with the flag left true', async () => {
    // `isParked` compares the timestamps; the boolean is only a hint. Reading
    // the boolean would hide this live, assigned job from the board forever.
    const res = await board([clemtenn], { data: [clemtenn] });
    const body = (await res.json()) as Body;

    expect(body.data.parked).toEqual([]);
    expect(body.data.assigned.map((j) => j.id)).toEqual(['clemtenn']);
  });

  it('puts the longest-sitting job first and says how long each has sat', async () => {
    const res = await board([], { data: [messer, pinnacle] });
    const body = (await res.json()) as Body;

    expect(body.data.parked.map((j) => j.job_number)).toEqual([
      'JOB-2026-815303', // Jul 28
      'JOB-2026-396494', // Aug 17
    ]);
    expect(body.data.parked.map((j) => j.days_parked)).toEqual([23, 3]);
    expect(body.data.parked[0].total_days_worked).toBe(1);
  });

  it('claims a parked will-call job for the folder, not the will-call pile', async () => {
    const parkedWillCall = { ...pinnacle, is_will_call: true };
    const res = await board([], { data: [parkedWillCall] }, [parkedWillCall]);
    const body = (await res.json()) as Body;

    expect(body.data.parked.map((j) => j.id)).toEqual(['pinnacle']);
    expect(body.data.willCall).toEqual([]);
  });

  it('degrades to an empty folder when the migration has not been applied', async () => {
    // VERIFIED Aug 20: `schedule_board_view` carries none of the on_hold columns
    // yet. PostgREST rejects the WHOLE query, and the board must not 500 on it.
    const res = await board([boardJob({ assigned_to: 'nate' })], {
      data: null,
      error: {
        code: '42703',
        message: 'column schedule_board_view.on_hold does not exist',
      },
    });
    const body = (await res.json()) as Body;

    expect(res.status).toBe(200);
    expect(body.data.parked).toEqual([]);
    expect(body.data.assigned.map((j) => j.id)).toEqual(['job-1']);
  });
});
