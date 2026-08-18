/**
 * THE LIVE-CREW GUARD HAS TO READ THE STATE THE BOARD IS DRAWING.
 *
 * The board draws its operator rows from the per-day ledger
 * (`job_daily_assignments.operator_id`), NOT from `job_orders.assigned_to`.
 * The two disagree in production constantly. JOB-2026-402357 is the shape that
 * matters: status `in_progress`, `assigned_to` NULL, `helper_assigned_to` NULL,
 * and nine ledger rows putting Aiden on it.
 *
 * The first version of the guard fed `crewClearNeedsConfirmation` the job's
 * lead columns. On that job they are both NULL, so `stripsCrew()` computed
 * `hadSomeone = false`, the guard never fired, and clearing the row — or
 * dragging the job to the unassigned pool — took Aiden off an in-progress job
 * with no 409, no confirm modal, and nothing in the response to say so. The
 * incident again, through a guard built to stop it. `hasWorkLogged` does not
 * rescue it either: the check short-circuits on `stripsCrew()` first.
 *
 * These tests drive `applyReassignment` against that exact production shape.
 */

jest.mock('next/server', () => ({}));
jest.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: jest.fn() } }));
jest.mock('@/lib/send-reminder', () => ({ sendNotification: jest.fn() }));
jest.mock('@/lib/sms', () => ({ sendSMS: jest.fn() }));
jest.mock('@/lib/audit', () => ({ logAuditEvent: jest.fn() }));

import { applyReassignment } from './reassign';
import { supabaseAdmin } from './supabase-admin';

type Result = { data?: unknown; error?: unknown };

/**
 * Table-keyed PostgREST stand-in: every builder method returns itself, and
 * awaiting it (or `.single()` / `.maybeSingle()`) resolves the next queued
 * result for THAT table. Keyed by table rather than by call order so a
 * fire-and-forget side effect can't shift the results the assertions depend on.
 */
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

const ACTOR = { userId: 'admin-1', userEmail: 'admin@example.com', role: 'admin' };

const baseParams = {
  jobOrderId: 'job-402357',
  assignmentDate: '2026-08-18',
  scope: 'day' as const,
  tenantId: 'tenant-1',
  actor: ACTOR,
};

/** JOB-2026-402357 as it actually sits in production. */
const liveJobWithNoLead = {
  id: 'job-402357',
  job_number: 'JOB-2026-402357',
  customer_name: 'Parkk Concrete',
  location: '214 Industrial Park Drive',
  job_type: 'wall sawing',
  arrival_time: null,
  assigned_to: null,
  helper_assigned_to: null,
  status: 'in_progress',
  scheduled_date: '2026-08-18',
  end_date: null,
  is_multi_day: false,
  dispatched_at: null,
  tenant_id: 'tenant-1',
};

describe('applyReassignment live-crew guard reads the per-day ledger', () => {
  beforeEach(() => {
    (supabaseAdmin.from as jest.Mock).mockReset();
  });

  it('BLOCKS clearing a live job whose operator lives only in the ledger (JOB-2026-402357)', async () => {
    mockTables({
      job_orders: [{ data: liveJobWithNoLead }],
      // The ledger says Aiden is on it today. job_orders says nobody is.
      job_daily_assignments: [{ data: { operator_id: 'aiden', helper_id: null } }],
      daily_job_logs: [{ data: [] }], // no log today — the guard must not need one
    });

    const result = await applyReassignment({
      ...baseParams,
      operatorId: null,
      helperId: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.status).toBe(409);
    expect(result.block_type).toBe('live_job_unassign');
    expect(result.details).toContain('JOB-2026-402357');
  });

  it('BLOCKS when only the ledger HELPER is present (same seat, same rule)', async () => {
    mockTables({
      job_orders: [{ data: { ...liveJobWithNoLead, status: 'in_route' } }],
      job_daily_assignments: [{ data: { operator_id: null, helper_id: 'helper-9' } }],
      daily_job_logs: [{ data: [] }],
    });

    const result = await applyReassignment({
      ...baseParams,
      operatorId: null,
      helperId: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.status).toBe(409);
    expect(result.block_type).toBe('live_job_unassign');
  });

  it('still BLOCKS on the job lead when the date has no ledger row yet', async () => {
    mockTables({
      job_orders: [{ data: { ...liveJobWithNoLead, assigned_to: 'op-1', status: 'on_site' } }],
      job_daily_assignments: [{ data: null }], // no row for this date
      daily_job_logs: [{ data: [] }],
    });

    const result = await applyReassignment({
      ...baseParams,
      operatorId: null,
      helperId: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.status).toBe(409);
    expect(result.block_type).toBe('live_job_unassign');
  });

  it('does NOT block a job nobody has started (the guard must not become a wall)', async () => {
    mockTables({
      job_orders: [{ data: { ...liveJobWithNoLead, status: 'assigned' } }],
      job_daily_assignments: [{ data: { operator_id: 'aiden', helper_id: null } }],
      daily_job_logs: [{ data: [] }],
    });

    const result = await applyReassignment({
      ...baseParams,
      operatorId: null,
      helperId: null,
    });

    // The write path beyond the guard is not mocked here on purpose — the claim
    // under test is only that the guard let this through, not what the write
    // then did. Anything but a live-job refusal satisfies it.
    if (!result.ok) {
      expect(result.block_type).not.toBe('live_job_unassign');
    }
  });

  it('force: true is still the way past it (a confirmed clear must go through)', async () => {
    mockTables({
      job_orders: [{ data: liveJobWithNoLead }],
      job_daily_assignments: [{ data: { operator_id: 'aiden', helper_id: null } }],
      daily_job_logs: [{ data: [] }],
    });

    const result = await applyReassignment({
      ...baseParams,
      operatorId: null,
      helperId: null,
      force: true,
    });

    if (!result.ok) {
      expect(result.block_type).not.toBe('live_job_unassign');
    }
  });

  it('reads the anchor ledger row tenant-scoped and for the anchor date', async () => {
    const seen = mockTables({
      job_orders: [{ data: liveJobWithNoLead }],
      job_daily_assignments: [{ data: { operator_id: 'aiden', helper_id: null } }],
      daily_job_logs: [{ data: [] }],
    });

    await applyReassignment({ ...baseParams, operatorId: null, helperId: null });

    const jdaSelect = seen.find((c) => c.table === 'job_daily_assignments' && c.method === 'select');
    expect(jdaSelect?.args[0]).toBe('operator_id, helper_id');

    const jdaEqs = seen.filter((c) => c.table === 'job_daily_assignments' && c.method === 'eq');
    expect(jdaEqs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ args: ['assignment_date', '2026-08-18'] }),
        expect.objectContaining({ args: ['tenant_id', 'tenant-1'] }),
      ])
    );

    // M3: the today's-work probe is tenant-scoped too.
    const logEqs = seen.filter((c) => c.table === 'daily_job_logs' && c.method === 'eq');
    expect(logEqs).toEqual(
      expect.arrayContaining([expect.objectContaining({ args: ['tenant_id', 'tenant-1'] })])
    );
  });
});
