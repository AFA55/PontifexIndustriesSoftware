/**
 * The rule this file exists to defend: a failure to LEARN which company is
 * asking must never be reported as "this user has no company", because 101 call
 * sites read that as "run the query unfiltered".
 */

const maybeSingle = jest.fn();

jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  },
}));

import { getTenantId } from './get-tenant-id';

beforeEach(() => {
  maybeSingle.mockReset();
});

describe('getTenantId', () => {
  it('returns the tenant on the happy path', async () => {
    maybeSingle.mockResolvedValue({ data: { tenant_id: 'patriot' }, error: null });
    await expect(getTenantId('u1')).resolves.toBe('patriot');
  });

  it('THROWS when the database cannot be reached', async () => {
    // The whole point. Returning null here downgraded every
    // `if (tenantId) query.eq('tenant_id', tenantId)` into an unscoped,
    // platform-wide query — on reads, updates and deletes alike. Supabase was
    // unreachable for over an hour on Aug 16; this is a live condition, not a
    // thought experiment.
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'fetch failed', code: undefined },
    });
    await expect(getTenantId('u1')).rejects.toThrow(/Could not resolve tenant/);
  });

  it('THROWS on a timeout rather than reporting no tenant', async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'Connection terminated due to connection timeout' },
    });
    await expect(getTenantId('u1')).rejects.toThrow(/could not resolve tenant/i);
  });

  it('THROWS when the profile does not exist', async () => {
    // "I don't know who this is" must not become "show them everything".
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getTenantId('ghost')).rejects.toThrow(/No profile found/);
  });

  it('still returns null for a user who genuinely has no tenant', async () => {
    // The one legitimate null: the query SUCCEEDED and the answer is "none".
    // That is a fact about the user, not a failure to find out — a tenant-less
    // super_admin is allowed by lib/api-auth.
    maybeSingle.mockResolvedValue({ data: { tenant_id: null }, error: null });
    await expect(getTenantId('platform-owner')).resolves.toBeNull();
  });

  it('names the user in the error so a 500 is diagnosable', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(getTenantId('user-123')).rejects.toThrow(/user-123/);
  });

  it('does not convert a rejected promise into a null', async () => {
    // A thrown network error must propagate, not be caught and flattened.
    maybeSingle.mockRejectedValue(new Error('socket hang up'));
    await expect(getTenantId('u1')).rejects.toThrow(/socket hang up/);
  });
});
