/**
 * Payroll approval is not a button, it is an endpoint.
 *
 * The timecards page hides Approve unless the user's effective `timecards`
 * permission is 'full'. Until Aug 18 the route behind it checked only
 * `requireAdmin`, so the hiding was cosmetic: any admin could approve the whole
 * crew's week with a single POST. And the per-user grant that was supposed to
 * be the remedy was read from nowhere — every call site passed null.
 *
 * These tests pin both directions at the REAL route: granting works, and not
 * granting cannot be routed around by calling the API directly.
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
  requireAdmin: jest.fn(),
}));

/** Per-table queue of results, so the same chainable builder serves every call. */
const mockQueues: Record<string, Array<{ data: unknown; error: unknown }>> = {};
const mockTables: string[] = [];

jest.mock('@/lib/supabase-admin', () => {
  const next = (table: string) => mockQueues[table]?.shift() ?? { data: null, error: null };
  const make = (table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.update = () => builder;
    builder.eq = () => builder;
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

import { POST } from './route';
import { requireAdmin } from '@/lib/api-auth';

const asMock = requireAdmin as jest.Mock;
const params = Promise.resolve({ id: 'tc-1' });
const req = {} as never;

function authAs(role: string) {
  asMock.mockResolvedValue({
    authorized: true,
    userId: 'amanda',
    userEmail: 'office@patriotconcretecutting.com',
    role,
    tenantId: 'patriot',
  });
}

beforeEach(() => {
  asMock.mockReset();
  mockTables.length = 0;
  for (const k of Object.keys(mockQueues)) delete mockQueues[k];
});

describe('POST /api/admin/timecards/[id]/approve', () => {
  it('403s an admin whose only permission is the role preset (timecards: view)', async () => {
    authAs('admin');
    mockQueues.user_card_permissions = [{ data: [], error: null }];

    const res: any = await POST(req, { params });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'card_permission_required', effective: 'view' });
    // Refused BEFORE touching payroll data.
    expect(mockTables).not.toContain('timecards');
  });

  it('approves for the same admin once she holds a per-user timecards:full grant', async () => {
    authAs('admin');
    mockQueues.user_card_permissions = [
      { data: [{ card_key: 'timecards', permission_level: 'full' }], error: null },
    ];
    mockQueues.timecards = [
      { data: { id: 'tc-1', is_approved: false, user_id: 'op-1' }, error: null },
      { data: { id: 'tc-1', is_approved: true }, error: null },
    ];

    const res: any = await POST(req, { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
  });

  it('403s when the grant is only view — a lower grant is not a partial yes', async () => {
    authAs('admin');
    mockQueues.user_card_permissions = [
      { data: [{ card_key: 'timecards', permission_level: 'view' }], error: null },
    ];

    const res: any = await POST(req, { params });
    expect(res.status).toBe(403);
  });

  it('operations_manager still approves without any override row', async () => {
    authAs('operations_manager');
    mockQueues.timecards = [
      { data: { id: 'tc-1', is_approved: false, user_id: 'op-1' }, error: null },
      { data: { id: 'tc-1', is_approved: true }, error: null },
    ];

    const res: any = await POST(req, { params });

    expect(res.status).toBe(200);
    // Bypass roles never consult the permissions table.
    expect(mockTables).not.toContain('user_card_permissions');
  });

  it('the role guard still runs first — a non-admin never reaches the card gate', async () => {
    asMock.mockResolvedValue({
      authorized: false,
      response: { status: 403, json: async () => ({ error: 'Forbidden. Admin access required.' }) },
    });

    const res: any = await POST(req, { params });

    expect(res.status).toBe(403);
    expect(mockTables).toHaveLength(0);
  });
});
