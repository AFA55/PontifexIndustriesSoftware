/**
 * A CREW ID ARRIVES IN A REQUEST BODY, AND `supabaseAdmin` BYPASSES RLS.
 *
 * `applyReassignment` has always fetched the JOB `.eq('tenant_id', tenantId)`, so
 * a schedule-board editor could never touch another company's job. The two ids
 * that say WHO GOES were never checked at all: `operatorId` and `helperId` came
 * straight off the POST body and straight into `job_daily_assignments`, and the
 * only thing standing between that and another tenant's employee appearing on a
 * Patriot job — and finding it on their phone via /api/job-orders, which reads the
 * same ledger — was that the board's own pickers happen to be tenant-scoped.
 *
 * That is a UI convention, not a boundary. It matters more now than it did
 * yesterday: helper-only assignment (founder, Aug 20) makes the HELPER seat a
 * primary, first-class way to place someone, and `helperId` is exactly the field
 * that had no check.
 *
 * The guard costs nothing — the write path already looked each id up to cache the
 * name on the ledger row; it now looks it up within the tenant.
 *
 * ⚠️ THE MOCK HAS TO BE ABLE TO FAIL (guardian, Aug 20). The first version of
 * these tests handed back `{ data: null }` for the profiles query no matter what
 * was asked, so they passed with the `.eq('tenant_id', …)` deleted — proving only
 * that a null row is refused. The stand-in below FILTERS a fixture the way
 * PostgREST would: drop the tenant filter and the foreign helper is found, gets a
 * name, and is written onto the job. A guard is only real if the test that
 * describes it goes red when it is removed.
 */
jest.mock('next/server', () => ({}));
jest.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: jest.fn() } }));
jest.mock('@/lib/send-reminder', () => ({ sendNotification: jest.fn() }));
jest.mock('@/lib/sms', () => ({ sendSMS: jest.fn() }));
jest.mock('@/lib/audit', () => ({ logAuditEvent: jest.fn() }));

import { applyReassignment } from './reassign';
import { supabaseAdmin } from './supabase-admin';

type Result = { data?: unknown; error?: unknown };
type ProfileRow = { id: string; tenant_id: string; full_name: string };

/**
 * Table-keyed PostgREST stand-in (same shape as reassign-live-guard.test.ts),
 * except that `profiles` is a real little table: `.eq(col, val)` narrows a
 * fixture and `.maybeSingle()` answers with what survives. That is what makes a
 * missing tenant filter observable.
 */
function mockTables(queues: Record<string, Result[]>, profiles: ProfileRow[] = []) {
  const cursors: Record<string, number> = {};
  const profileFilters: Array<Array<[string, unknown]>> = [];
  (supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => {
    const i = cursors[table] ?? 0;
    cursors[table] = i + 1;

    if (table === 'profiles') {
      const filters: Array<[string, unknown]> = [];
      profileFilters.push(filters);
      const rows = () =>
        profiles.filter((p) =>
          filters.every(([col, val]) => (p as unknown as Record<string, unknown>)[col] === val)
        );
      const builder: Record<string | symbol, unknown> = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === 'eq') {
              return (col: string, val: unknown) => {
                filters.push([col, val]);
                return builder;
              };
            }
            if (prop === 'maybeSingle' || prop === 'single') {
              return () => Promise.resolve({ data: rows()[0] ?? null, error: null });
            }
            if (prop === 'then') {
              return (res: (v: unknown) => unknown, rej: (v: unknown) => unknown) =>
                Promise.resolve({ data: rows(), error: null }).then(res, rej);
            }
            return () => builder;
          },
        }
      ) as Record<string | symbol, unknown>;
      return builder;
    }

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
            return () => Promise.resolve(result);
          }
          return () => proxy;
        },
      }
    ) as Record<string | symbol, unknown>;
    return proxy;
  });
  return profileFilters;
}

const OURS = 'tenant-1';
const THEIRS = 'tenant-2';
const HELPER = 'micah';

const job = {
  id: 'job-1',
  job_number: 'JOB-2026-898480',
  customer_name: 'AM King',
  location: '474 Oconee Business Pkwy',
  job_type: 'wall sawing',
  arrival_time: null,
  assigned_to: null,
  helper_assigned_to: null,
  status: 'scheduled',
  scheduled_date: '2026-08-20',
  end_date: null,
  is_multi_day: false,
  dispatched_at: null,
  tenant_id: OURS,
};

const params = {
  jobOrderId: 'job-1',
  assignmentDate: '2026-08-20',
  scope: 'day' as const,
  tenantId: OURS,
  actor: { userId: 'admin-1', userEmail: 'admin@example.com', role: 'admin' },
};

beforeEach(() => {
  (supabaseAdmin.from as jest.Mock).mockReset();
});

it('refuses a helper who is not in this tenant, instead of writing them onto the job', async () => {
  // The helper EXISTS and has a name — he just works for somebody else. Without
  // the tenant filter the lookup finds him, caches "Micah Rentz" on the ledger
  // row, and another company's employee is on a Patriot job.
  const profileFilters = mockTables(
    {
      job_orders: [{ data: job }],
      // The anchor ledger row, then the live-work probe.
      job_daily_assignments: [{ data: null }],
      daily_job_logs: [{ data: [] }],
    },
    [{ id: HELPER, tenant_id: THEIRS, full_name: 'Micah Rentz' }]
  );

  const result = await applyReassignment({ ...params, operatorId: null, helperId: HELPER });

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.status).toBe(400);
    expect(result.error).toMatch(/not on this company/i);
  }
  // …and it was refused because the query ASKED the tenant, not because the
  // fixture happened to be empty.
  expect(profileFilters).toHaveLength(1);
  expect(profileFilters[0]).toContainEqual(['tenant_id', OURS]);
  expect(profileFilters[0]).toContainEqual(['id', HELPER]);
});

it('lets a helper from this tenant through — the guard must not become a wall', async () => {
  mockTables(
    {
      job_orders: [{ data: job }, { data: { ...job, helper_assigned_to: HELPER, status: 'assigned' } }],
      job_daily_assignments: [{ data: null }, { data: [] }, { data: null }],
      daily_job_logs: [{ data: [] }],
      tenants: [{ data: { timezone: 'America/New_York' } }],
    },
    [{ id: HELPER, tenant_id: OURS, full_name: 'Micah Rentz' }]
  );

  const result = await applyReassignment({ ...params, operatorId: null, helperId: HELPER });

  expect(result.ok).toBe(true);
  if (result.ok) expect(result.job.helper_assigned_to).toBe(HELPER);
});

it('reports a lookup we could not perform as OUR failure, not as a foreign crew id', async () => {
  // A dropped connection used to be indistinguishable from a foreign id, so the
  // office was told their own operator was not on their crew — an accusation
  // instead of a retry.
  (supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => {
    const result =
      table === 'profiles'
        ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }
        : table === 'job_orders'
          ? { data: job }
          : { data: [], error: null };
    const proxy: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') {
            return (res: (v: unknown) => unknown, rej: (v: unknown) => unknown) =>
              Promise.resolve(result).then(res, rej);
          }
          if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve(result);
          return () => proxy;
        },
      }
    ) as Record<string | symbol, unknown>;
    return proxy;
  });

  const result = await applyReassignment({ ...params, operatorId: null, helperId: HELPER });

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.status).toBe(503);
    expect(result.error).not.toMatch(/not on this company/i);
    expect(result.details).toMatch(/nothing was changed/i);
  }
});
