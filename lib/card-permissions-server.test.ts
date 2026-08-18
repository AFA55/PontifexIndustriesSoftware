/**
 * The server half of the gate. A permission the browser honours and the API does
 * not is decoration — hiding a button stops nobody who can type a URL.
 *
 * Also pins the tenant scoping: `supabaseAdmin` bypasses RLS, so a lookup that
 * forgets `tenant_id` would let a row written against the wrong company grant
 * something here.
 */

const mockEqCalls: Array<[string, unknown]> = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };
const mockFrom = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/supabase-admin', () => {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (col: string, val: unknown) => {
    mockEqCalls.push([col, val]);
    return builder;
  };
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(mockResult).then(resolve, reject);
  return {
    supabaseAdmin: {
      from: (table: string) => {
        mockFrom(table);
        return builder;
      },
    },
  };
});

import {
  loadUserCardPermissions,
  loadUserCardPermissionsResult,
  requireCardLevel,
  resolveCardPermission,
} from './card-permissions-server';

const AMANDA = { userId: 'amanda', role: 'admin', tenantId: 'patriot' };

beforeEach(() => {
  mockEqCalls.length = 0;
  mockFrom.mockClear();
  mockResult = { data: [], error: null };
});

describe('loadUserCardPermissions', () => {
  it('scopes the lookup to BOTH the user and the tenant', async () => {
    mockResult = { data: [{ card_key: 'timecards', permission_level: 'full' }], error: null };

    await loadUserCardPermissions('amanda', 'patriot');

    expect(mockFrom).toHaveBeenCalledWith('user_card_permissions');
    expect(mockEqCalls).toEqual([
      ['user_id', 'amanda'],
      ['tenant_id', 'patriot'],
    ]);
  });

  it('returns null (→ role preset) rather than an empty map when there are no rows', async () => {
    mockResult = { data: [], error: null };
    await expect(loadUserCardPermissions('amanda', 'patriot')).resolves.toBeNull();
  });

  it('falls back to the role preset on a DB error instead of inventing access', async () => {
    mockResult = { data: null, error: { message: 'connection terminated' } };
    await expect(loadUserCardPermissions('amanda', 'patriot')).resolves.toBeNull();
  });

  /**
   * "No rows" and "the read failed" both fall back to the preset, and that is
   * the right DIRECTION for both. But only one of them means the answer might
   * be wrong, and the refusal has to say which — otherwise Amanda is told to
   * ask an operations manager for a permission she already holds, and the
   * office finds the grant already there and concludes the software lies.
   */
  it('distinguishes a FAILED read from an EMPTY one', async () => {
    mockResult = { data: [], error: null };
    await expect(loadUserCardPermissionsResult('amanda', 'patriot')).resolves.toEqual({
      permissions: null,
      lookupFailed: false,
    });

    mockResult = { data: null, error: { message: 'connection terminated' } };
    await expect(loadUserCardPermissionsResult('amanda', 'patriot')).resolves.toEqual({
      permissions: null,
      lookupFailed: true,
    });
  });
});

describe('resolveCardPermission', () => {
  it('never queries the table for a bypass role', async () => {
    const d = await resolveCardPermission(
      { userId: 'andres', role: 'operations_manager', tenantId: 'patriot' },
      'timecards',
      'full'
    );
    expect(d).toEqual({ allowed: true, effective: 'full', source: 'bypass_role', lookupFailed: false });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('requireCardLevel — the server refusal', () => {
  it('REFUSES an admin with no override (preset is view, approving needs full)', async () => {
    mockResult = { data: [], error: null };

    const denied = await requireCardLevel(AMANDA, 'timecards', 'full', 'Approving a timecard');

    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(403);
    const body = await denied!.json();
    expect(body).toMatchObject({ code: 'card_permission_required', required: 'full', effective: 'view' });
  });

  it('ALLOWS the same admin once the per-user grant exists', async () => {
    mockResult = { data: [{ card_key: 'timecards', permission_level: 'full' }], error: null };

    await expect(requireCardLevel(AMANDA, 'timecards', 'full', 'Approving a timecard')).resolves.toBeNull();
  });

  it('REFUSES when the grant is below the level the action needs', async () => {
    mockResult = { data: [{ card_key: 'timecards', permission_level: 'view' }], error: null };

    const denied = await requireCardLevel(AMANDA, 'timecards', 'full', 'Approving a timecard');
    expect(denied!.status).toBe(403);
  });

  it('a grant on a DIFFERENT card does not open this one', async () => {
    mockResult = { data: [{ card_key: 'billing', permission_level: 'full' }], error: null };

    const denied = await requireCardLevel(AMANDA, 'timecards', 'full', 'Approving a timecard');
    expect(denied!.status).toBe(403);
  });

  it('lets a bypass role straight through', async () => {
    await expect(
      requireCardLevel({ userId: 'root', role: 'super_admin', tenantId: null }, 'timecards', 'full', 'x')
    ).resolves.toBeNull();
  });
});

describe('requireCardLevel — when the lookup itself failed', () => {
  it('does NOT tell her to go and ask for a permission she may already have', async () => {
    mockResult = { data: null, error: { message: 'connection terminated' } };

    const denied = await requireCardLevel(AMANDA, 'timecards', 'full', 'Approving a timecard');

    expect(denied).not.toBeNull();
    // 503, not 403: this is our fault, and it is worth retrying.
    expect(denied!.status).toBe(503);
    const body = await denied!.json();
    expect(body.code).toBe('card_permission_unavailable');
    expect(body.error).toMatch(/could not read your permissions/i);
    expect(body.error).not.toMatch(/ask an operations manager/i);
    // And it says nothing happened, so nobody re-runs a payroll action to check.
    expect(body.error).toMatch(/nothing was changed/i);
  });

  it('still REFUSES — failing closed is not negotiable', async () => {
    mockResult = { data: null, error: { message: 'connection terminated' } };
    const denied = await requireCardLevel(AMANDA, 'timecards', 'full', 'Approving a timecard');
    expect(denied).not.toBeNull();
  });

  it('a genuine absence of rows still gets the actionable 403', async () => {
    mockResult = { data: [], error: null };

    const denied = await requireCardLevel(AMANDA, 'timecards', 'full', 'Approving a timecard');

    expect(denied!.status).toBe(403);
    const body = await denied!.json();
    expect(body.error).toMatch(/ask an operations manager/i);
  });
});
