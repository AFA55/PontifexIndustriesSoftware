import { buildCrewCopyRows } from './duplicate-crew';

const OPTS = { tenantId: 'tenant-1', newJobId: 'job-new', addedBy: 'admin-1' };

describe('buildCrewCopyRows', () => {
  it('returns nothing when there is no crew (the default second-crew case)', () => {
    expect(buildCrewCopyRows([], OPTS)).toEqual([]);
    expect(buildCrewCopyRows(null, OPTS)).toEqual([]);
    expect(buildCrewCopyRows(undefined, OPTS)).toEqual([]);
  });

  it('re-keys crew onto the new job with the caller as added_by', () => {
    const rows = buildCrewCopyRows(
      [{ user_id: 'u1', role: 'operator' }, { user_id: 'u2', role: 'helper' }],
      OPTS
    );
    expect(rows).toEqual([
      { tenant_id: 'tenant-1', job_order_id: 'job-new', user_id: 'u1', role: 'operator', added_by: 'admin-1' },
      { tenant_id: 'tenant-1', job_order_id: 'job-new', user_id: 'u2', role: 'helper', added_by: 'admin-1' },
    ]);
  });

  it('preserves each member role rather than flattening everyone to helper', () => {
    const rows = buildCrewCopyRows([{ user_id: 'u1', role: 'operator' }], OPTS);
    expect(rows[0].role).toBe('operator');
  });

  it('never copies a lead row — the copy is staffed via the assign path', () => {
    const rows = buildCrewCopyRows(
      [{ user_id: 'lead-1', role: 'lead' }, { user_id: 'u1', role: 'helper' }],
      OPTS
    );
    expect(rows.map(r => r.user_id)).toEqual(['u1']);
  });

  it('coerces an unknown role to helper (the least-privileged crew role)', () => {
    const rows = buildCrewCopyRows([{ user_id: 'u1', role: 'supervisor' }], OPTS);
    expect(rows[0].role).toBe('helper');
  });

  it('emits one row per user so the (job, user) unique index cannot trip', () => {
    const rows = buildCrewCopyRows(
      [{ user_id: 'u1', role: 'operator' }, { user_id: 'u1', role: 'helper' }],
      OPTS
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('operator');
  });

  it('always stamps the caller tenant, never a tenant from the source rows', () => {
    const rows = buildCrewCopyRows(
      [{ user_id: 'u1', role: 'helper', tenant_id: 'other-tenant' } as never],
      OPTS
    );
    expect(rows[0].tenant_id).toBe('tenant-1');
  });

  it('skips rows with no user_id', () => {
    const rows = buildCrewCopyRows([{ user_id: '', role: 'helper' }], OPTS);
    expect(rows).toEqual([]);
  });
});
