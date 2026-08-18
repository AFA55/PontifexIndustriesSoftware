/**
 * THE OPEN DOOR INTO PAYROLL.
 *
 * Approving a timecard needs `timecards: 'full'`. Deciding a CORRECTION did not
 * — it gated on `requireAdmin` alone — while doing strictly more: it rewrites
 * `clock_in_time` and `clock_out_time` on the timecard and recomputes
 * `total_hours`. So an office admin who was refused the Approve button could
 * still change what a worker was paid, from a different screen, with the same
 * account. Rejecting is the same authority pointed the other way: it closes out
 * the worker's dispute.
 *
 * Both directions are pinned here at the REAL route.
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/api-auth', () => ({ requireAdmin: jest.fn() }));
jest.mock('@/lib/timecard-start', () => ({ recomputeLateForEdit: jest.fn() }));

/** Per-table queue of results, so one chainable builder serves every call. */
const mockQueues: Record<string, Array<{ data: unknown; error: unknown }>> = {};
const mockTables: string[] = [];

jest.mock('@/lib/supabase-admin', () => {
  const next = (table: string) => mockQueues[table]?.shift() ?? { data: null, error: null };
  const make = (table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.update = () => builder;
    builder.insert = () => builder;
    builder.eq = () => builder;
    builder.maybeSingle = () => Promise.resolve(next(table));
    builder.single = () => Promise.resolve(next(table));
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(next(table)).then(resolve, reject);
    return builder;
  };
  return {
    supabaseAdmin: {
      from: (table: string) => {
        mockTables.push(table);
        return make(table);
      },
    },
  };
});

import { PATCH } from './route';
import { requireAdmin } from '@/lib/api-auth';

const asMock = requireAdmin as jest.Mock;
const params = Promise.resolve({ id: 'cr-1' });

const request = (body: unknown) => ({ json: async () => body }) as never;

function authAs(role: string) {
  asMock.mockResolvedValue({
    authorized: true,
    userId: 'amanda',
    userEmail: 'office@patriotconcretecutting.com',
    role,
    tenantId: 'patriot',
  });
}

/** A pending request from someone OTHER than the reviewer (self-approval is blocked). */
function pendingCorrection() {
  mockQueues.timecard_correction_requests = [
    {
      data: {
        id: 'cr-1',
        timecard_id: 'tc-1',
        requested_by: 'javier',
        requested_clock_in: '2026-08-17T13:00:00.000Z',
        requested_clock_out: '2026-08-17T23:00:00.000Z',
        status: 'pending',
        metadata: {},
        timecards: {
          id: 'tc-1',
          user_id: 'javier',
          date: '2026-08-17',
          is_shop_hours: false,
          clock_in_time: '2026-08-17T14:00:00.000Z',
          clock_out_time: '2026-08-17T22:00:00.000Z',
          lunch_duration_minutes: 30,
        },
        profiles: { id: 'javier', full_name: 'Javier Ruiz' },
      },
      error: null,
    },
    { data: null, error: null },
  ];
}

beforeEach(() => {
  asMock.mockReset();
  mockTables.length = 0;
  for (const k of Object.keys(mockQueues)) delete mockQueues[k];
});

describe('PATCH /api/admin/timecards/correction-requests/[id]', () => {
  it('403s an admin on the role preset — the same refusal Approve already gave', async () => {
    authAs('admin');
    mockQueues.user_card_permissions = [{ data: [], error: null }];
    pendingCorrection();

    const res: any = await PATCH(request({ action: 'approve' }), { params });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      code: 'card_permission_required',
      required: 'full',
      effective: 'view',
    });
    // Refused BEFORE reading or writing anything about payroll.
    expect(mockTables).not.toContain('timecard_correction_requests');
    expect(mockTables).not.toContain('timecards');
  });

  it('403s REJECT too — closing out a dispute is the same authority', async () => {
    authAs('admin');
    mockQueues.user_card_permissions = [{ data: [], error: null }];
    pendingCorrection();

    const res: any = await PATCH(request({ action: 'reject' }), { params });

    expect(res.status).toBe(403);
    expect(mockTables).not.toContain('timecard_correction_requests');
  });

  it('403s when the grant is only view — a lower grant is not a partial yes', async () => {
    authAs('admin');
    mockQueues.user_card_permissions = [
      { data: [{ card_key: 'timecards', permission_level: 'view' }], error: null },
    ];

    const res: any = await PATCH(request({ action: 'approve' }), { params });
    expect(res.status).toBe(403);
  });

  it('a grant on a DIFFERENT card does not open this one', async () => {
    authAs('admin');
    mockQueues.user_card_permissions = [
      { data: [{ card_key: 'billing', permission_level: 'full' }], error: null },
    ];

    const res: any = await PATCH(request({ action: 'approve' }), { params });
    expect(res.status).toBe(403);
  });

  it('lets the same admin through once she holds timecards:full', async () => {
    authAs('admin');
    mockQueues.user_card_permissions = [
      { data: [{ card_key: 'timecards', permission_level: 'full' }], error: null },
    ];
    pendingCorrection();

    const res: any = await PATCH(request({ action: 'approve' }), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, data: { status: 'approved' } });
    expect(mockTables).toContain('timecard_correction_requests');
  });

  it('operations_manager decides without any override row', async () => {
    authAs('operations_manager');
    pendingCorrection();

    const res: any = await PATCH(request({ action: 'approve' }), { params });

    expect(res.status).toBe(200);
    // Bypass roles never consult the permissions table.
    expect(mockTables).not.toContain('user_card_permissions');
  });

  it('the role guard still runs first — a non-admin never reaches the card gate', async () => {
    asMock.mockResolvedValue({
      authorized: false,
      response: { status: 403, json: async () => ({ error: 'Forbidden. Admin access required.' }) },
    });

    const res: any = await PATCH(request({ action: 'approve' }), { params });

    expect(res.status).toBe(403);
    expect(mockTables).toHaveLength(0);
  });
});
