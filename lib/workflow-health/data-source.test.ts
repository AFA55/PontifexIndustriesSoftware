/**
 * Query-shape tests for the Supabase data source.
 *
 * These exist because the two things that can go wrong here are both invisible
 * to `tsc` and to `npm run build`:
 *
 *   1. A FILTER THAT HIDES THE FAILURE. `activeCrew` used to carry
 *      `.eq('active', true)`, which dropped the denominator from 15 to 13 and
 *      removed the two people — switched off, not deleted, still filing hours —
 *      whose labour silently costs $0. Set eleven rates, the card goes green,
 *      and the metric conceals the exact failure it was built to catch.
 *
 *   2. A MISSING TENANT SCOPE. `supabaseAdmin` bypasses RLS, so a forgotten
 *      `.eq('tenant_id', …)` is a cross-tenant leak with nothing underneath it.
 *
 * The Supabase client is replaced with a recorder, so what is asserted is
 * which filters were actually applied — not what a mocked result pretended.
 */

const mockCalls: Array<{ table: string; fn: string; args: unknown[] }> = [];
const mockRows: Record<string, unknown[]> = {};
const mockErrors: Record<string, { message: string } | undefined> = {};

jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const record =
        (fn: string) =>
        (...args: unknown[]) => {
          mockCalls.push({ table, fn, args });
          return builder;
        };
      for (const fn of [
        'select',
        'eq',
        'is',
        'in',
        'gte',
        'lte',
        'not',
        'or',
        'order',
        'limit',
        'insert',
      ]) {
        builder[fn] = record(fn);
      }
      builder.then = (resolve: (v: unknown) => unknown) => {
        const error = mockErrors[table];
        return Promise.resolve(resolve({ data: error ? null : (mockRows[table] ?? []), error: error ?? null }));
      };
      return builder;
    },
  },
}));

import { createSupabaseHealthDataSource } from './data-source';

const TENANT = 'patriot-tenant-id';

function callsFor(table: string) {
  return mockCalls.filter((c) => c.table === table);
}

function applied(table: string, fn: string, firstArg: unknown): boolean {
  return callsFor(table).some((c) => c.fn === fn && c.args[0] === firstArg);
}

beforeEach(() => {
  mockCalls.length = 0;
  for (const k of Object.keys(mockRows)) delete mockRows[k];
  for (const k of Object.keys(mockErrors)) delete mockErrors[k];
});

describe('activeCrew', () => {
  it('does NOT filter on profiles.active — that is what hid two real people', async () => {
    // The production shape, Aug 17 2026: Javi (apprentice) and David
    // (supervisor) are both active=false, both NOT deleted, both filed hours
    // in the window, and neither has an hourly rate. They are the whole reason
    // this metric exists, and the `active` filter was removing them.
    mockRows.profiles = [
      { id: 'javi', full_name: 'Javi', hourly_rate: null },
      { id: 'david', full_name: 'David', hourly_rate: null },
      { id: 'dante', full_name: 'Dante burgess', hourly_rate: 26 },
    ];
    mockRows.timecards = [{ user_id: 'javi' }, { user_id: 'david' }, { user_id: 'dante' }];

    const crew = await createSupabaseHealthDataSource().activeCrew(TENANT, '2026-05-19');

    expect(crew.map((c) => c.full_name)).toEqual(['Javi', 'David', 'Dante burgess']);
    // The assertion that pins the fix: no `active` filter on the profiles read.
    expect(callsFor('profiles').some((c) => c.fn === 'eq' && c.args[0] === 'active')).toBe(false);
  });

  it('still excludes DELETED profiles — nobody can set a rate on one', async () => {
    mockRows.profiles = [];
    mockRows.timecards = [];
    await createSupabaseHealthDataSource().activeCrew(TENANT, '2026-05-19');
    expect(applied('profiles', 'is', 'deleted_at')).toBe(true);
  });

  it('restricts to the roles that are actually paid off a timecard', async () => {
    mockRows.profiles = [];
    await createSupabaseHealthDataSource().activeCrew(TENANT, '2026-05-19');
    const roleFilter = callsFor('profiles').find((c) => c.fn === 'in' && c.args[0] === 'role');
    expect(roleFilter).toBeDefined();
    expect(roleFilter!.args[1]).toEqual(
      expect.arrayContaining(['operator', 'apprentice', 'supervisor'])
    );
    // super_admin and salesman are NOT paid off a timecard; flagging the
    // founder for a missing hourly rate would be pure noise.
    expect(roleFilter!.args[1]).not.toEqual(expect.arrayContaining(['super_admin']));
  });

  it('names the tenant on BOTH hops — supabaseAdmin has no RLS beneath it', async () => {
    mockRows.profiles = [{ id: 'javi', full_name: 'Javi', hourly_rate: null }];
    mockRows.timecards = [{ user_id: 'javi' }];

    await createSupabaseHealthDataSource().activeCrew(TENANT, '2026-05-19');

    expect(applied('profiles', 'eq', 'tenant_id')).toBe(true);
    expect(applied('timecards', 'eq', 'tenant_id')).toBe(true);
    expect(
      callsFor('timecards').filter((c) => c.fn === 'eq' && c.args[1] === TENANT)
    ).toHaveLength(1);
  });

  it('THROWS on a database error instead of reporting an empty crew', async () => {
    // `data ?? []` here would render as "0 of 0 crew have a rate" — a broken
    // query wearing a healthy number, which is the failure this whole feature
    // was built to end.
    mockErrors.profiles = { message: 'column profiles.nope does not exist' };
    await expect(
      createSupabaseHealthDataSource().activeCrew(TENANT, '2026-05-19')
    ).rejects.toThrow('does not exist');
  });
});
