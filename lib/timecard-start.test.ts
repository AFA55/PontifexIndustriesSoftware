import { resolveEffectiveStart } from './timecard-start';

/**
 * Minimal chainable Supabase mock. Each table maps to the result object the
 * terminal call (.limit / .maybeSingle / awaited builder) resolves to.
 */
function makeClient(tables: Record<string, { data: unknown }>) {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: null };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        limit: () => Promise.resolve(result),
        maybeSingle: () => Promise.resolve(result),
        then: (resolve: (v: unknown) => unknown) => resolve(result),
      };
      return builder;
    },
  } as never;
}

const base = {
  tenantId: 'tenant-1',
  operatorId: 'op-1',
  role: 'operator',
  localDate: '2026-06-22',
  isShopHours: false,
};

describe('resolveEffectiveStart — precedence chain', () => {
  it('1. uses the assigned job arrival_time (jobsite)', async () => {
    const supabaseAdmin = makeClient({
      job_orders: { data: [{ id: 'j1', customer_name: 'Acme', arrival_time: '07:30', shop_arrival_time: '06:00' }] },
    });
    const r = await resolveEffectiveStart({ supabaseAdmin, ...base });
    expect(r).toEqual({ startTime: '07:30', source: 'job', job: { id: 'j1', customer_name: 'Acme' } });
  });

  it('2. uses shop_arrival_time for shop clock-ins', async () => {
    const supabaseAdmin = makeClient({
      job_orders: { data: [{ id: 'j1', customer_name: 'Acme', arrival_time: '07:30', shop_arrival_time: '06:00' }] },
    });
    const r = await resolveEffectiveStart({ supabaseAdmin, ...base, isShopHours: true });
    expect(r.startTime).toBe('06:00');
    expect(r.source).toBe('job');
  });

  it('3. falls to a per-day override when no job (operator > role > all)', async () => {
    const supabaseAdmin = makeClient({
      job_orders: { data: [] },
      timecard_day_overrides: { data: [
        { start_time: '06:30', scope: 'all', role: null, operator_id: null },
        { start_time: '08:00', scope: 'role', role: 'operator', operator_id: null },
        { start_time: '09:15', scope: 'operator', role: null, operator_id: 'op-1' },
      ] },
    });
    const r = await resolveEffectiveStart({ supabaseAdmin, ...base });
    expect(r.startTime).toBe('09:15'); // operator-specific wins
    expect(r.source).toBe('day_override');
  });

  it('4. role-scoped override applies when no operator-specific one matches', async () => {
    const supabaseAdmin = makeClient({
      job_orders: { data: [] },
      timecard_day_overrides: { data: [
        { start_time: '06:30', scope: 'all', role: null, operator_id: null },
        { start_time: '08:00', scope: 'role', role: 'operator', operator_id: null },
      ] },
    });
    const r = await resolveEffectiveStart({ supabaseAdmin, ...base });
    expect(r.startTime).toBe('08:00');
    expect(r.source).toBe('day_override');
  });

  it('5. all-scope override (safety-training day) applies to everyone', async () => {
    const supabaseAdmin = makeClient({
      job_orders: { data: [] },
      timecard_day_overrides: { data: [{ start_time: '06:30', scope: 'all', role: null, operator_id: null }] },
    });
    const r = await resolveEffectiveStart({ supabaseAdmin, ...base });
    expect(r.startTime).toBe('06:30');
    expect(r.source).toBe('day_override');
  });

  it('6. falls to the tenant standard start time when no job and no override', async () => {
    const supabaseAdmin = makeClient({
      job_orders: { data: [] },
      timecard_day_overrides: { data: [] },
      tenants: { data: { default_start_time: '07:00:00' } },
    });
    const r = await resolveEffectiveStart({ supabaseAdmin, ...base });
    expect(r.startTime).toBe('07:00:00');
    expect(r.source).toBe('standard');
  });

  it('7. returns null when nothing resolves (fail-open, no false flag)', async () => {
    const supabaseAdmin = makeClient({
      job_orders: { data: [] },
      timecard_day_overrides: { data: [] },
      tenants: { data: null },
    });
    const r = await resolveEffectiveStart({ supabaseAdmin, ...base });
    expect(r).toEqual({ startTime: null, source: null, job: null });
  });

  it('8. a job beats both an override and the standard (precedence)', async () => {
    const supabaseAdmin = makeClient({
      job_orders: { data: [{ id: 'j9', customer_name: 'Beta', arrival_time: '05:45', shop_arrival_time: null }] },
      timecard_day_overrides: { data: [{ start_time: '06:30', scope: 'all', role: null, operator_id: null }] },
      tenants: { data: { default_start_time: '07:00' } },
    });
    const r = await resolveEffectiveStart({ supabaseAdmin, ...base });
    expect(r.startTime).toBe('05:45');
    expect(r.source).toBe('job');
  });
});
