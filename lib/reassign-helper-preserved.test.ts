/**
 * AN UNRELATED EDIT MUST NOT TAKE THE HELPER OFF THE JOB.
 *
 * THE FAILURE (guardian, Aug 20). The board's Edit panel fires ONE write for the
 * whole crew, and that write restates every seat the caller did not omit. Two
 * things then had to be true at once for a helper to survive a PO-number edit,
 * and neither was:
 *
 *   1. The panel compared the crew LEAD against the board ROW's lead while
 *      seeding its own field from the JOB's. Those legitimately differ — a row
 *      takes the first NAMED lead among its jobs, so a second job on the same
 *      helper's row, named by nobody, reads `null` against a row reading "Mike
 *      Sanchez". `leadChanged` came back true when nothing about the crew had
 *      changed, and the crew write fired. (Pinned in
 *      app/dashboard/admin/schedule-board/_components/edit-crew-changes.test.ts.)
 *
 *   2. That write omits `helperId` — it is not changing the helper — and
 *      `applyReassignment` resolved an omitted helper from
 *      `job_orders.helper_assigned_to`: the JOB's seat, not the anchor date's
 *      ledger row. 39 of 111 production ledger rows disagree with their job's
 *      helper seat. On a helper-only crew the helper IS the crew, so the day's
 *      helper was rewritten from a stale job-level column — the helper lost the
 *      day and their timecard stopped landing on the job. That is the exact
 *      failure the helper-only feature exists to end.
 *
 * The operator seat had been fixed for precisely this reason and its comment
 * warned that reading the job's lead "would quietly promote a day-override back"
 * — with the helper beside it doing that very thing. These tests hold the second
 * half shut: OMITTED MEANS THE LEDGER'S ANSWER, for both seats, always.
 *
 * They also pin the two rules the lead name lives by (an emptied crew keeps no
 * lead; a crew placed under a real operator keeps none either) and the retry that
 * lets all of this ship before the migration is applied by hand.
 */
jest.mock('next/server', () => ({}));
jest.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: jest.fn() } }));
jest.mock('@/lib/send-reminder', () => ({ sendNotification: jest.fn() }));
jest.mock('@/lib/sms', () => ({ sendSMS: jest.fn() }));
jest.mock('@/lib/audit', () => ({ logAuditEvent: jest.fn() }));

import { applyReassignment } from './reassign';
import { supabaseAdmin } from './supabase-admin';
import { OFF_PLATFORM_LEAD_COLUMN } from './off-platform-lead';

type Result = { data?: unknown; error?: unknown };
type Seen = { table: string; method: string; args: unknown[] };

/**
 * Table-keyed PostgREST stand-in. Each `from(table)` takes the NEXT queued result
 * for that table, and every method call is recorded so the test can read the
 * payload that would have hit the database.
 */
function mockTables(queues: Record<string, Result[]>): Seen[] {
  const seen: Seen[] = [];
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

/** Every row of the upsert the ledger write actually sent. */
function ledgerRows(seen: Seen[], nth = 0): Record<string, unknown>[] {
  const upserts = seen.filter((s) => s.table === 'job_daily_assignments' && s.method === 'upsert');
  return (upserts[nth]?.args[0] as Record<string, unknown>[]) ?? [];
}

function jobUpdate(seen: Seen[]): Record<string, unknown> {
  const update = seen.find((s) => s.table === 'job_orders' && s.method === 'update');
  return (update?.args[0] as Record<string, unknown>) ?? {};
}

const TENANT = 'tenant-1';
const AXEL = 'axel-valverde';
const STALE_HELPER = 'someone-else';
const OPERATOR = 'conrade-nate';

const helperOnlyJob = {
  id: 'job-b',
  job_number: 'JOB-2026-521763',
  customer_name: 'BWC Contracting',
  location: '474 Oconee Business Pkwy',
  job_type: 'wall sawing',
  arrival_time: null,
  assigned_to: null,
  // THE STALE SEAT. This is the value the old code wrote onto the day.
  helper_assigned_to: STALE_HELPER,
  status: 'assigned',
  scheduled_date: '2026-08-21',
  end_date: '2026-08-23',
  is_multi_day: true,
  dispatched_at: null,
  tenant_id: TENANT,
};

const params = {
  jobOrderId: 'job-b',
  assignmentDate: '2026-08-21',
  tenantId: TENANT,
  actor: { userId: 'admin-1', userEmail: 'admin@example.com', role: 'admin' },
};

beforeEach(() => {
  (supabaseAdmin.from as jest.Mock).mockReset();
});

describe('an omitted helper is the ANCHOR DATE’s helper, not the job’s seat', () => {
  it('keeps Axel on every remaining day when an unrelated field is saved', async () => {
    const seen = mockTables({
      job_orders: [{ data: helperOnlyJob }, { data: { ...helperOnlyJob } }],
      job_daily_assignments: [
        // The anchor date's ledger row: Axel, alone, under an unnamed lead.
        { data: { operator_id: null, helper_id: AXEL } },
        { data: [] }, // the job's own rows across the scope dates
        { data: null }, // the upsert
      ],
      daily_job_logs: [{ data: [] }],
      profiles: [{ data: { full_name: 'Axel Valverde' } }],
      tenants: [{ data: { timezone: 'America/New_York' } }],
    });

    // Exactly what the Edit panel sends when only the PO number changed and the
    // lead comparison misfired: both seats OMITTED, scope 'remaining'.
    const result = await applyReassignment({
      ...params,
      scope: 'remaining',
      offPlatformLeadName: null,
    });

    expect(result.ok).toBe(true);
    const rows = ledgerRows(seen);
    // Aug 21, 22 and 23 — the whole remaining span the panel writes.
    expect(rows.map((r) => r.assignment_date)).toEqual(['2026-08-21', '2026-08-22', '2026-08-23']);
    for (const row of rows) {
      expect(row.helper_id).toBe(AXEL);
      expect(row.helper_name).toBe('Axel Valverde');
      expect(row.operator_id).toBeNull();
    }
    // …and the job's seat is corrected to the crew that is actually on it,
    // rather than the day being rewritten from the stale seat.
    expect(jobUpdate(seen).helper_assigned_to).toBe(AXEL);
    // Nobody was reported as removed — because nobody was.
    if (result.ok) {
      expect(result.crew_change.helper_cleared).toBe(false);
      expect(result.crew_change.operator_cleared).toBe(false);
    }
  });

  it('still falls back to the job’s seat when the ledger has said nothing for that date', async () => {
    // No anchor row: the office has never stated this date. The job's own seats
    // are the only answer there is, and that must not change.
    const seen = mockTables({
      job_orders: [{ data: helperOnlyJob }, { data: { ...helperOnlyJob } }],
      job_daily_assignments: [{ data: null }, { data: [] }, { data: null }],
      daily_job_logs: [{ data: [] }],
      profiles: [{ data: { full_name: 'Someone Else' } }],
      tenants: [{ data: { timezone: 'America/New_York' } }],
    });

    const result = await applyReassignment({ ...params, scope: 'day' });

    expect(result.ok).toBe(true);
    expect(ledgerRows(seen)[0].helper_id).toBe(STALE_HELPER);
  });

  it('an explicit null still takes the helper off — omitted and null stay different', async () => {
    const seen = mockTables({
      job_orders: [{ data: helperOnlyJob }, { data: { ...helperOnlyJob } }],
      job_daily_assignments: [
        { data: { operator_id: null, helper_id: AXEL } },
        { data: [] },
        { data: null },
      ],
      daily_job_logs: [{ data: [] }],
      tenants: [{ data: { timezone: 'America/New_York' } }],
    });

    const result = await applyReassignment({ ...params, scope: 'day', helperId: null });

    expect(result.ok).toBe(true);
    expect(ledgerRows(seen)[0].helper_id).toBeNull();
    if (result.ok) expect(result.crew_change.helper_cleared).toBe(true);
  });
});

describe('the off-platform lead only survives on a crew that has one', () => {
  it('is cleared when the helper is removed and the row is left with nobody', async () => {
    // The skeleton shape. Leaving "Mike Sanchez" on it means the next helper
    // assigned to this row inherits a lead who is not running their crew.
    const seen = mockTables({
      job_orders: [{ data: helperOnlyJob }, { data: { ...helperOnlyJob } }],
      job_daily_assignments: [
        { data: { operator_id: null, helper_id: AXEL } },
        { data: [] },
        { data: null },
      ],
      daily_job_logs: [{ data: [] }],
      tenants: [{ data: { timezone: 'America/New_York' } }],
    });

    // The row-helper control omits the lead field entirely — "I said nothing
    // about the lead" — which used to leave the stored name behind.
    const result = await applyReassignment({ ...params, scope: 'day', helperId: null });

    expect(result.ok).toBe(true);
    expect(ledgerRows(seen)[0][OFF_PLATFORM_LEAD_COLUMN]).toBeNull();
    if (result.ok) expect(result.off_platform_lead_name).toBeNull();
  });

  it('is cleared when a Pontifex operator takes the crew — a crew has one lead', async () => {
    const seen = mockTables({
      job_orders: [{ data: helperOnlyJob }, { data: { ...helperOnlyJob } }],
      job_daily_assignments: [
        { data: { operator_id: null, helper_id: AXEL } },
        { data: [] },
        { data: [] },
        { data: null },
      ],
      daily_job_logs: [{ data: [] }],
      profiles: [{ data: { full_name: 'Conrade Richardson' } }, { data: { full_name: 'Axel Valverde' } }],
      tenants: [{ data: { timezone: 'America/New_York' } }],
    });

    const result = await applyReassignment({
      ...params,
      scope: 'day',
      operatorId: OPERATOR,
      offPlatformLeadName: 'Mike Sanchez',
    });

    expect(result.ok).toBe(true);
    expect(ledgerRows(seen)[0][OFF_PLATFORM_LEAD_COLUMN]).toBeNull();
  });

  it('is kept, untouched, when the caller says nothing about a helper-only crew', async () => {
    const seen = mockTables({
      job_orders: [{ data: helperOnlyJob }, { data: { ...helperOnlyJob } }],
      job_daily_assignments: [
        { data: { operator_id: null, helper_id: AXEL } },
        { data: [] },
        { data: null },
      ],
      daily_job_logs: [{ data: [] }],
      profiles: [{ data: { full_name: 'Axel Valverde' } }],
      tenants: [{ data: { timezone: 'America/New_York' } }],
    });

    const result = await applyReassignment({ ...params, scope: 'day' });

    expect(result.ok).toBe(true);
    // The column is absent from the payload entirely — a drag or a sequence
    // shuffle must not erase a name the office typed yesterday.
    expect(OFF_PLATFORM_LEAD_COLUMN in ledgerRows(seen)[0]).toBe(false);
    if (result.ok) expect('off_platform_lead_name' in result).toBe(false);
  });
});

describe('shipping before the migration is applied by hand', () => {
  it('retries the assignment WITHOUT the lead column and still places the crew', async () => {
    const seen = mockTables({
      job_orders: [{ data: helperOnlyJob }, { data: { ...helperOnlyJob } }],
      job_daily_assignments: [
        { data: { operator_id: null, helper_id: AXEL } },
        { data: [] },
        // PostgREST's answer when the column is not in the schema cache yet.
        {
          data: null,
          error: {
            code: 'PGRST204',
            message: `Could not find the '${OFF_PLATFORM_LEAD_COLUMN}' column of 'job_daily_assignments' in the schema cache`,
          },
        },
        { data: null }, // the retry
      ],
      daily_job_logs: [{ data: [] }],
      profiles: [{ data: { full_name: 'Axel Valverde' } }],
      tenants: [{ data: { timezone: 'America/New_York' } }],
    });

    const result = await applyReassignment({
      ...params,
      scope: 'day',
      offPlatformLeadName: 'Mike Sanchez',
    });

    // Losing the lead's NAME in that window is a visible degradation. Losing the
    // ASSIGNMENT would mean the office pressed assign and nothing happened.
    expect(result.ok).toBe(true);
    expect(ledgerRows(seen, 0)[0][OFF_PLATFORM_LEAD_COLUMN]).toBe('Mike Sanchez');
    expect(OFF_PLATFORM_LEAD_COLUMN in ledgerRows(seen, 1)[0]).toBe(false);
    expect(ledgerRows(seen, 1)[0].helper_id).toBe(AXEL);
  });

  it('does NOT swallow a real write failure as a missing column', async () => {
    mockTables({
      job_orders: [{ data: helperOnlyJob }],
      job_daily_assignments: [
        { data: { operator_id: null, helper_id: AXEL } },
        { data: [] },
        { data: null, error: { code: '42501', message: 'permission denied for table job_daily_assignments' } },
        { data: null, error: { code: '42501', message: 'permission denied for table job_daily_assignments' } },
      ],
      daily_job_logs: [{ data: [] }],
      profiles: [{ data: { full_name: 'Axel Valverde' } }],
      tenants: [{ data: { timezone: 'America/New_York' } }],
    });

    const result = await applyReassignment({
      ...params,
      scope: 'day',
      offPlatformLeadName: 'Mike Sanchez',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(500);
  });
});
