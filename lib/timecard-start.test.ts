import { resolveEffectiveStart, computeLate } from './timecard-start';

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

describe('computeLate — grace boundary (strict >), timezone, edit regression', () => {
  // 2026-06-22 is in EDT (UTC-4). A 07:00 America/New_York start = 11:00:00Z.
  const NY = 'America/New_York';
  const localDate = '2026-06-22';
  const startNY = { startTime: '07:00', source: 'standard' as const };
  // Helper: tenant-local 07:00 + `mins` minutes, expressed as a UTC ISO string.
  const at = (mins: number) =>
    new Date(Date.UTC(2026, 5, 22, 11, 0, 0) + mins * 60_000).toISOString();

  it('exactly on time (0 min late) → not late', () => {
    const r = computeLate({ clockInIso: at(0), effectiveStart: startNY, graceMinutes: 7, tenantTz: NY, localDate });
    expect(r.isLate).toBe(false);
    expect(r.lateMinutes).toBe(0);
    expect(r.scheduledStartTime).toBe('07:00');
    expect(r.lateSource).toBe('standard');
  });

  it('6 min late, grace 7 → on time (under grace)', () => {
    const r = computeLate({ clockInIso: at(6), effectiveStart: startNY, graceMinutes: 7, tenantTz: NY, localDate });
    expect(r.isLate).toBe(false);
    expect(r.lateMinutes).toBe(0);
  });

  it('exactly 7 min late, grace 7 → STILL on time (strict >, not >=)', () => {
    const r = computeLate({ clockInIso: at(7), effectiveStart: startNY, graceMinutes: 7, tenantTz: NY, localDate });
    expect(r.isLate).toBe(false);
    expect(r.lateMinutes).toBe(0);
  });

  it('8 min late, grace 7 → late (more than grace)', () => {
    const r = computeLate({ clockInIso: at(8), effectiveStart: startNY, graceMinutes: 7, tenantTz: NY, localDate });
    expect(r.isLate).toBe(true);
    expect(r.lateMinutes).toBe(8);
  });

  it('respects a custom grace (grace 0: 1 min late → late)', () => {
    const onTime = computeLate({ clockInIso: at(0), effectiveStart: startNY, graceMinutes: 0, tenantTz: NY, localDate });
    expect(onTime.isLate).toBe(false);
    const late = computeLate({ clockInIso: at(1), effectiveStart: startNY, graceMinutes: 0, tenantTz: NY, localDate });
    expect(late.isLate).toBe(true);
    expect(late.lateMinutes).toBe(1);
  });

  it('timezone-aware: same wall instant judged correctly per tz', () => {
    // 11:00:00Z is 07:00 in New York (on time) but 08:00 in America/Chicago is wrong —
    // verify a 07:00 Chicago start (= 12:00Z) flags an 11:00Z clock-in as on-time-relative.
    // Concretely: a Denver tenant (UTC-6 in summer) with 07:00 start = 13:00Z.
    const denverStartUtc = Date.UTC(2026, 5, 22, 13, 0, 0); // 07:00 America/Denver (MDT)
    const eightLate = new Date(denverStartUtc + 8 * 60_000).toISOString();
    const r = computeLate({
      clockInIso: eightLate,
      effectiveStart: { startTime: '07:00', source: 'standard' },
      graceMinutes: 7,
      tenantTz: 'America/Denver',
      localDate,
    });
    expect(r.isLate).toBe(true);
    expect(r.lateMinutes).toBe(8);
    // The SAME instant against a New York tenant (07:00 NY = 11:00Z) would be 2h late,
    // proving the tz actually drives the comparison.
    const rNY = computeLate({
      clockInIso: eightLate,
      effectiveStart: { startTime: '07:00', source: 'standard' },
      graceMinutes: 7,
      tenantTz: NY,
      localDate,
    });
    expect(rNY.isLate).toBe(true);
    expect(rNY.lateMinutes).toBe(128); // 2h8m
  });

  it('no baseline start → never late (fail-open)', () => {
    const r = computeLate({
      clockInIso: at(120),
      effectiveStart: { startTime: null, source: null },
      graceMinutes: 7,
      tenantTz: NY,
      localDate,
    });
    expect(r.isLate).toBe(false);
    expect(r.scheduledStartTime).toBeNull();
    expect(r.lateSource).toBeNull();
  });

  it('REGRESSION: editing a late clock-in to an on-time one clears is_late', () => {
    // Was clocked in 30 min late → flagged.
    const before = computeLate({ clockInIso: at(30), effectiveStart: startNY, graceMinutes: 7, tenantTz: NY, localDate });
    expect(before.isLate).toBe(true);
    expect(before.lateMinutes).toBe(30);
    // Admin corrects the time to the actual on-time arrival (5 min after start).
    const after = computeLate({ clockInIso: at(5), effectiveStart: startNY, graceMinutes: 7, tenantTz: NY, localDate });
    expect(after.isLate).toBe(false);
    expect(after.lateMinutes).toBe(0);
  });

  it('REGRESSION: editing to a still-late time KEEPS it flagged', () => {
    const after = computeLate({ clockInIso: at(20), effectiveStart: startNY, graceMinutes: 7, tenantTz: NY, localDate });
    expect(after.isLate).toBe(true);
    expect(after.lateMinutes).toBe(20);
  });
});
