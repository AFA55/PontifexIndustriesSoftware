/**
 * WHOSE JOB WAS THAT DAY — and what happens when the records disagree.
 *
 * The case these pin is Keontre Mcknight's real week, Aug 17–20 2026: two AM
 * King jobs at ONE address, one of them a quick-add with no project name that
 * was scheduled for a single day, completed, and then stayed reachable on his
 * phone and caught later filings.
 *
 *   QA-2026-533392   AM KING   project_name NULL      scheduled 8/17 only, completed
 *   JOB-2026-898480  AM King   "GE - KAA pit infill"  scheduled 8/19 →, assigned
 *
 *   Mon 8/17   9.48 h   board: QA-533392   card untagged
 *   Tue 8/18   8.00 h   board: nothing     card untagged   his log: QA-533392
 *   Wed 8/19   9.28 h   board: 898480      card: 898480    his log: QA-533392  ← conflict
 *   Thu 8/20   open     board: nothing     card: 898480
 *
 * The founder's account is project 1 on Mon+Tue and project 2 on Wed+Thu, so
 * Wednesday is the test: the filed log names the OLD job and must not win, and
 * must not be silently dropped either. A timecard that quietly picks the wrong
 * job is worse than one showing none, because the office would trust it.
 *
 * And the totals stay 9.48 / 8.00 / 9.28 / open. Naming a day's jobs must never
 * become apportioning a day's hours — that is the work ticket's arithmetic and
 * it stays there.
 */
const mockResults: Record<string, { data: any[] | null; error: any }> = {};
/** Every filter the resolver applied, per table — so the tenant scope is testable. */
const mockCalls: Record<string, { method: string; args: any[] }[]> = {};

jest.mock('./supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      // Minimal PostgREST builder stand-in: every chained method returns the
      // builder, and awaiting it yields whatever this table is configured with.
      const b: any = {};
      for (const method of ['select', 'eq', 'in', 'or', 'order', 'limit']) {
        b[method] = (...args: any[]) => {
          (mockCalls[table] ??= []).push({ method, args });
          return b;
        };
      }
      b.then = (resolve: any, reject: any) =>
        Promise.resolve(mockResults[table] ?? { data: [], error: null }).then(resolve, reject);
      return b;
    },
  },
}));

import {
  resolveDayJobs,
  resolveTimecardDayJobs,
  loadTimecardDayJobs,
  formatJobContextLabel,
  formatJobConflictNote,
  personDayKey,
  isInferredSource,
  TimecardJobContextError,
  TimecardTenantScopeError,
} from './timecard-job-context';
import { buildWeekDayEntries, getWeekDates, type TimecardEntry } from './timecard-utils';
// Pure, database-free: imported from the rules module directly.
import { isStaleCardTag } from './timecard-job-rules';

const TENANT = 'ee3d8081-cec2-47f3-ac23-bdc0bb2d142d';
const KEON = 'bb5f3f96-1960-477b-8ca4-24f3a38a2670';
const OLD_JOB = 'd215cc94-9467-4875-8859-6c940712b635'; // QA-2026-533392
const NEW_JOB = 'b699d8ec-3aa2-4d7b-8b41-f32869bf157c'; // JOB-2026-898480

const MON = '2026-08-17';
const TUE = '2026-08-18';
const WED = '2026-08-19';
const THU = '2026-08-20';

/** His four cards, with the hours exactly as production carries them. */
const CARDS = [
  { id: 'tc-mon', user_id: KEON, date: MON, job_order_id: null, total_hours: 9.48 },
  { id: 'tc-tue', user_id: KEON, date: TUE, job_order_id: null, total_hours: 8.0 },
  { id: 'tc-wed', user_id: KEON, date: WED, job_order_id: NEW_JOB, total_hours: 9.28 },
  // Thursday is still open — clocked in, never clocked out.
  { id: 'tc-thu', user_id: KEON, date: THU, job_order_id: NEW_JOB, total_hours: null },
];

function loadKeonsWeek() {
  mockResults.job_daily_assignments = {
    data: [
      { assignment_date: MON, operator_id: KEON, helper_id: null, job_order_id: OLD_JOB },
      { assignment_date: WED, operator_id: KEON, helper_id: null, job_order_id: NEW_JOB },
    ],
    error: null,
  };
  mockResults.daily_job_logs = {
    data: [
      { operator_id: KEON, log_date: TUE, job_order_id: OLD_JOB },
      // Filed against the finished job from the new jobsite — the whole point.
      { operator_id: KEON, log_date: WED, job_order_id: OLD_JOB },
    ],
    error: null,
  };
  mockResults.helper_work_logs = { data: [], error: null };
  mockResults.job_orders = {
    data: [
      {
        id: OLD_JOB,
        job_number: 'QA-2026-533392',
        customer_name: 'AM KING',
        project_name: null,
        status: 'completed',
      },
      {
        id: NEW_JOB,
        job_number: 'JOB-2026-898480',
        customer_name: 'AM King',
        project_name: 'GE - KAA pit infill',
        status: 'assigned',
      },
    ],
    error: null,
  };
}

beforeEach(() => {
  for (const k of Object.keys(mockResults)) delete mockResults[k];
  for (const k of Object.keys(mockCalls)) delete mockCalls[k];
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── The ladder, in isolation ────────────────────────────────────────────────

describe('resolveDayJobs — the precedence ladder', () => {
  it('the schedule board decides the day', () => {
    const r = resolveDayJobs([
      { jobId: NEW_JOB, source: 'day_ledger' },
      { jobId: OLD_JOB, source: 'operator_log' },
    ]);
    expect(r.jobIds).toEqual([NEW_JOB]);
    expect(r.conflictJobIds).toEqual([OLD_JOB]);
  });

  it('the clock-in tag NEVER outranks the board — it is stamped before the board exists', () => {
    // Axel Valverde, Wed Aug 12: card stamped Leifeng at clock-in, office placed
    // him on Estes 61 minutes later. The board is right; the card is residue.
    const r = resolveDayJobs([
      { jobId: 'leifeng', source: 'timecard' },
      { jobId: 'estes', source: 'day_ledger' },
    ]);
    expect(r.jobIds).toEqual(['estes']);
    expect(r.conflictJobIds).toEqual(['leifeng']);
  });

  it('a filed log answers when the board said nothing', () => {
    const r = resolveDayJobs([{ jobId: OLD_JOB, source: 'operator_log' }]);
    expect(r.jobIds).toEqual([OLD_JOB]);
    expect(r.conflictJobIds).toEqual([]);
  });

  it('the clock-in tag answers only when nothing else did, and is marked inferred', () => {
    const r = resolveDayJobs([{ jobId: NEW_JOB, source: 'timecard' }]);
    expect(r.jobIds).toEqual([NEW_JOB]);
    expect(isInferredSource(r.sourceByJobId.get(NEW_JOB)!)).toBe(true);
  });

  it('two jobs on one board day are BOTH the day’s jobs', () => {
    const r = resolveDayJobs([
      { jobId: 'a', source: 'day_ledger' },
      { jobId: 'b', source: 'day_ledger' },
    ]);
    expect(new Set(r.jobIds)).toEqual(new Set(['a', 'b']));
    expect(r.conflictJobIds).toEqual([]);
  });

  it('no evidence at all resolves to nothing — and says so rather than guessing', () => {
    const r = resolveDayJobs([]);
    expect(r.jobIds).toEqual([]);
    expect(r.conflictJobIds).toEqual([]);
  });

  it('the BILLING policy is preserved: a tagged card is always one of the day’s jobs', () => {
    // lib/job-clock-attribution.ts passes `always_counts` because the hours it
    // is dividing sit on that very card (Zack, Aug 14). The split that shipped
    // in 5ca940e9 must not shift underneath the timecard work.
    const r = resolveDayJobs(
      [
        { jobId: 'card-job', source: 'timecard' },
        { jobId: 'board-job', source: 'day_ledger' },
        { jobId: 'log-job', source: 'operator_log' },
      ],
      { cardTagPolicy: 'always_counts' }
    );
    expect(new Set(r.jobIds)).toEqual(new Set(['card-job', 'board-job']));
    expect(r.conflictJobIds).toEqual(['log-job']);
  });

  it('ZACK, AUG 14 EXACTLY: the card tag still counts when a filed log named the SAME job', () => {
    // The real row shape, which the three-distinct-jobs case above does not
    // reach: the board placed Zack on JOB-2026-675188, his card was tagged
    // JOB-2026-424813, and he ALSO filed an operator log for 424813. Keying the
    // acceptance test off the job's BEST source made 424813 an operator_log,
    // which the board outranks, so the day collapsed to one job and stopped
    // dividing — a silent revert of 5ca940e9. Verified as the only person-day
    // of this shape in production between Jul 1 and Aug 20 2026.
    const r = resolveDayJobs(
      [
        { jobId: '675188', source: 'day_ledger' },
        { jobId: '424813', source: 'operator_log' },
        { jobId: '424813', source: 'timecard' },
      ],
      { cardTagPolicy: 'always_counts' }
    );
    expect(new Set(r.jobIds)).toEqual(new Set(['675188', '424813']));
    expect(r.conflictJobIds).toEqual([]);
  });

  it('and the PAYROLL policy is unmoved by that same day — the board still decides', () => {
    // Same evidence, default policy: the timecard LISTS, so 424813 is reported
    // as a conflict rather than printed as a second job.
    const r = resolveDayJobs([
      { jobId: '675188', source: 'day_ledger' },
      { jobId: '424813', source: 'operator_log' },
      { jobId: '424813', source: 'timecard' },
    ]);
    expect(r.jobIds).toEqual(['675188']);
    expect(r.conflictJobIds).toEqual(['424813']);
  });
});

// ── Keon's week, end to end ─────────────────────────────────────────────────

describe("Keontre's week, Aug 17–20 2026", () => {
  it('all four days resolve to a job — none renders blank', async () => {
    loadKeonsWeek();
    const days = await resolveTimecardDayJobs(CARDS, TENANT);

    for (const date of [MON, TUE, WED, THU]) {
      const day = days.get(personDayKey(KEON, date));
      expect(day).toBeDefined();
      expect(day!.unresolved).toBe(false);
      expect(day!.jobs.length).toBeGreaterThan(0);
    }
  });

  it('Mon + Tue are project 1, Wed + Thu are project 2 — the founder’s account', async () => {
    loadKeonsWeek();
    const days = await resolveTimecardDayJobs(CARDS, TENANT);
    const jobOn = (d: string) => days.get(personDayKey(KEON, d))!.jobs.map((j) => j.jobNumber);

    expect(jobOn(MON)).toEqual(['QA-2026-533392']); // board
    expect(jobOn(TUE)).toEqual(['QA-2026-533392']); // his log, board silent
    expect(jobOn(WED)).toEqual(['JOB-2026-898480']); // board, over the stale log
    expect(jobOn(THU)).toEqual(['JOB-2026-898480']); // clock-in tag, nothing else
  });

  it('Wednesday does NOT silently prefer the log', async () => {
    loadKeonsWeek();
    const wed = (await resolveTimecardDayJobs(CARDS, TENANT)).get(personDayKey(KEON, WED))!;
    expect(wed.jobs.map((j) => j.jobNumber)).not.toContain('QA-2026-533392');
  });

  it('Wednesday SURFACES the disagreement instead of hiding it', async () => {
    loadKeonsWeek();
    const wed = (await resolveTimecardDayJobs(CARDS, TENANT)).get(personDayKey(KEON, WED))!;

    expect(wed.conflicts.map((c) => c.jobNumber)).toEqual(['QA-2026-533392']);
    const note = formatJobConflictNote(wed)!;
    expect(note).toContain('QA-2026-533392');
    expect(note).toContain('JOB-2026-898480');
    // And it names WHICH record made each claim, because that is what the
    // office is being asked to judge.
    expect(note).toContain('work log');
    expect(note).toContain('schedule board');
  });

  it('the other three days carry no conflict', async () => {
    loadKeonsWeek();
    const days = await resolveTimecardDayJobs(CARDS, TENANT);
    for (const date of [MON, TUE, THU]) {
      expect(formatJobConflictNote(days.get(personDayKey(KEON, date)))).toBeNull();
    }
  });

  it('Thursday’s answer is labelled inferred — it rests on the 7 a.m. stamp alone', async () => {
    loadKeonsWeek();
    const thu = (await resolveTimecardDayJobs(CARDS, TENANT)).get(personDayKey(KEON, THU))!;
    expect(thu.jobs[0].source).toBe('timecard');
    expect(isInferredSource(thu.jobs[0].source)).toBe(true);
  });

  it('names contractor, job number and project — the three fields payroll asked for', async () => {
    loadKeonsWeek();
    const wed = (await resolveTimecardDayJobs(CARDS, TENANT)).get(personDayKey(KEON, WED))!;
    const label = formatJobContextLabel(wed.jobs[0])!;
    expect(label).toContain('JOB-2026-898480');
    expect(label).toContain('AM King');
    expect(label).toContain('GE - KAA pit infill');
  });

  it('a quick-add with no project name still prints its job number and contractor', async () => {
    loadKeonsWeek();
    const mon = (await resolveTimecardDayJobs(CARDS, TENANT)).get(personDayKey(KEON, MON))!;
    // The two AM King jobs are at one address and only the number tells them
    // apart, so the number must never be the field that gets dropped.
    expect(formatJobContextLabel(mon.jobs[0])).toBe('QA-2026-533392 · AM KING');
  });

  it('THE HOURS STAY WHOLE AND UNDIVIDED: 9.48 / 8.00 / 9.28 / open', async () => {
    loadKeonsWeek();
    const days = await resolveTimecardDayJobs(CARDS, TENANT);
    const byDate = new Map([...days.values()].map((d) => [d.date, d]));

    const entries = buildWeekDayEntries(
      CARDS.map((c) => ({
        id: c.id,
        date: c.date,
        clock_in_time: `${c.date}T11:00:00Z`,
        clock_out_time: c.total_hours === null ? null : `${c.date}T20:00:00Z`,
        total_hours: c.total_hours,
        hour_type: null,
        is_shop_hours: false,
        is_night_shift: false,
        is_approved: false,
        clock_in_method: 'gps',
        notes: null,
      })) as TimecardEntry[],
      getWeekDates(MON),
      byDate
    );

    const hoursOn = (d: string) => entries.find((e) => e.date === d)!.totalHours;
    expect(hoursOn(MON)).toBe(9.48);
    expect(hoursOn(TUE)).toBe(8.0);
    expect(hoursOn(WED)).toBe(9.28);
    // Still open: no clock-out, so no hours yet — NOT a day that was worked for free.
    expect(hoursOn(THU)).toBe(0);

    // The week's total is the sum of the true clocked days, untouched by the
    // fact that the week spans two jobs.
    expect(Number(entries.reduce((s, e) => s + e.totalHours, 0).toFixed(2))).toBe(26.76);

    // And the job names rode along on the same rows.
    expect(entries.find((e) => e.date === WED)!.jobs!.map((j) => j.jobNumber)).toEqual([
      'JOB-2026-898480',
    ]);
    expect(entries.find((e) => e.date === WED)!.jobConflicts!.map((j) => j.jobNumber)).toEqual([
      'QA-2026-533392',
    ]);
  });

  it('a day with no card at all is left alone — not marked "job not recorded"', async () => {
    loadKeonsWeek();
    const days = await resolveTimecardDayJobs(CARDS, TENANT);
    const byDate = new Map([...days.values()].map((d) => [d.date, d]));
    const entries = buildWeekDayEntries([], getWeekDates(MON), byDate);
    // Saturday: nobody clocked, so there is no job question to answer.
    const sat = entries.find((e) => e.date === '2026-08-22')!;
    expect(sat.totalHours).toBe(0);
    expect(sat.jobs).toBeUndefined();
  });
});

// ── The two states that must never look like a blank ────────────────────────

describe('nothing resolves, and the lookup dies', () => {
  it('a day no record names comes back unresolved, explicitly', async () => {
    mockResults.job_daily_assignments = { data: [], error: null };
    mockResults.daily_job_logs = { data: [], error: null };
    mockResults.helper_work_logs = { data: [], error: null };
    mockResults.job_orders = { data: [], error: null };

    const days = await resolveTimecardDayJobs(
      [{ id: 'tc-x', user_id: KEON, date: TUE, job_order_id: null }],
      TENANT
    );
    const day = days.get(personDayKey(KEON, TUE))!;
    expect(day.unresolved).toBe(true);
    expect(day.jobs).toEqual([]);
    expect(day.conflicts).toEqual([]);
  });

  it('a failed read THROWS rather than reporting "no job"', async () => {
    mockResults.job_daily_assignments = {
      data: null,
      error: { code: '42703', message: 'column job_daily_assignments.bogus does not exist' },
    };

    const err = await resolveTimecardDayJobs(CARDS, TENANT).catch((e) => e);
    expect(err).toBeInstanceOf(TimecardJobContextError);
    expect(err.step).toBe('daily assignments');
    expect(err.pgError.code).toBe('42703');
    // PostgREST rejects the whole select on one bad column name, so the failure
    // must be loud: a dead query reading as "nobody was anywhere" is the exact
    // defect this module exists to fix, one layer down.
    expect(console.error).toHaveBeenCalled();
  });

  it('loadTimecardDayJobs turns the throw into an error the surface must PRINT', async () => {
    mockResults.job_orders = {
      data: null,
      error: { code: '42703', message: 'column job_orders.bogus does not exist' },
    };
    mockResults.job_daily_assignments = {
      data: [{ assignment_date: MON, operator_id: KEON, helper_id: null, job_order_id: OLD_JOB }],
      error: null,
    };

    const { byPersonDay, error } = await loadTimecardDayJobs(CARDS, TENANT);
    expect(error).toContain('42703');
    expect(byPersonDay.size).toBe(0);

    // …and the day rows say "could not load", never a silent blank.
    const entries = buildWeekDayEntries(
      [
        {
          id: 'tc-mon', date: MON, clock_in_time: `${MON}T11:00:00Z`,
          clock_out_time: `${MON}T20:00:00Z`, total_hours: 9.48, hour_type: null,
          is_shop_hours: false, is_night_shift: false, is_approved: false,
          clock_in_method: 'gps', notes: null,
        },
      ] as TimecardEntry[],
      getWeekDates(MON),
      undefined,
      true
    );
    const mon = entries.find((e) => e.date === MON)!;
    expect(mon.jobsUnavailable).toBe(true);
    expect(mon.jobsUnresolved).toBe(false); // NOT the same claim as "no job"
    expect(mon.totalHours).toBe(9.48); // and the hours are still the hours
  });
});

// ── The helper slot ─────────────────────────────────────────────────────────

/**
 * Axel Valverde's real week, Aug 17–20 2026. He is an apprentice and rides as
 * the HELPER, so the board names his day in `job_daily_assignments.helper_id`
 * and never in `operator_id`. Nothing else names Aug 20 for him at all except
 * the board and his (outranked) clock-in tag.
 *
 * This is what a wrong filter on that read costs: every helper's day goes blank
 * on the payroll sheet while every operator's still resolves, which looks like
 * "those guys had no job" rather than like a bug.
 */
describe('a helper is not an operator, and the board knows it', () => {
  const AXEL = 'd1f0b6a2-77c4-4a0e-9f31-0c2e6b5a8e11';
  const OWENS = '3f2a1c88-59d2-4a77-9a1c-6b0d3e2f7a44'; // JOB-2026-654657
  const CENTER = '9c7e4b10-2d63-4f85-b0aa-1e5c8d3f6b22'; // JOB-2026-974669

  const AXEL_CARDS = [
    { id: 'ax-thu', user_id: AXEL, date: THU, job_order_id: OWENS },
  ];

  beforeEach(() => {
    mockResults.job_daily_assignments = {
      data: [
        // Named ONLY in the helper slot — operator_id is somebody else.
        { assignment_date: THU, operator_id: KEON, helper_id: AXEL, job_order_id: CENTER },
      ],
      error: null,
    };
    mockResults.daily_job_logs = { data: [], error: null };
    mockResults.helper_work_logs = { data: [], error: null };
    mockResults.job_orders = {
      data: [
        { id: CENTER, job_number: 'JOB-2026-974669', customer_name: 'AM King', project_name: null, status: 'assigned' },
        { id: OWENS, job_number: 'JOB-2026-654657', customer_name: 'AM King', project_name: 'Owens Rd', status: 'assigned' },
      ],
      error: null,
    };
  });

  it("resolves the helper's day from the board's helper slot", async () => {
    const days = await resolveTimecardDayJobs(AXEL_CARDS, TENANT);
    const thu = days.get(personDayKey(AXEL, THU))!;
    expect(thu.unresolved).toBe(false);
    expect(thu.jobs.map((j) => j.jobNumber)).toEqual(['JOB-2026-974669']);
    // …and the clock-in tag it outranked is REPORTED, not dropped.
    expect(thu.conflicts.map((j) => j.jobNumber)).toEqual(['JOB-2026-654657']);
  });

  it('asks the ledger for the helper slot, not just the operator slot', async () => {
    await resolveTimecardDayJobs(AXEL_CARDS, TENANT);
    const or = (mockCalls.job_daily_assignments ?? []).find((c) => c.method === 'or');
    expect(or!.args[0]).toContain(`helper_id.in.(${AXEL})`);
  });
});

// ── Tenant scoping ──────────────────────────────────────────────────────────

describe('tenant isolation', () => {
  it("a job the tenant filter excluded never reaches a payroll document", async () => {
    loadKeonsWeek();
    // `job_orders` comes back empty, as it would for another tenant's job.
    mockResults.job_orders = { data: [], error: null };
    const days = await resolveTimecardDayJobs(CARDS, TENANT);
    for (const day of days.values()) {
      expect(day.jobs).toEqual([]);
      expect(day.conflicts).toEqual([]);
      expect(day.unresolved).toBe(true);
    }
  });

  it('EVERY read carries the tenant filter — unconditionally, not "if we have one"', async () => {
    loadKeonsWeek();
    await resolveTimecardDayJobs(CARDS, TENANT);
    for (const table of [
      'job_daily_assignments',
      'daily_job_logs',
      'helper_work_logs',
      'job_orders',
    ]) {
      const scoped = (mockCalls[table] ?? []).some(
        (c) => c.method === 'eq' && c.args[0] === 'tenant_id' && c.args[1] === TENANT
      );
      expect([table, scoped]).toEqual([table, true]);
    }
  });

  it('the day-ledger read is narrowed to the people asked about', async () => {
    loadKeonsWeek();
    await resolveTimecardDayJobs(CARDS, TENANT);
    const or = (mockCalls.job_daily_assignments ?? []).find((c) => c.method === 'or');
    expect(or).toBeDefined();
    expect(or!.args[0]).toBe(`operator_id.in.(${KEON}),helper_id.in.(${KEON})`);
  });

  it('a MISSING tenant refuses — it does not quietly read every tenant', async () => {
    loadKeonsWeek();
    // The idiom this replaced (`if (tenantId) q = q.eq(...)`) turned this call
    // into four RLS-bypassed reads across every tenant on the platform, and put
    // whatever came back onto one company's payroll sheet.
    const err = await resolveTimecardDayJobs(CARDS, null as unknown as string).catch((e) => e);
    expect(err).toBeInstanceOf(TimecardTenantScopeError);
    // Nothing was queried at all.
    expect(Object.keys(mockCalls)).toEqual([]);
  });

  it('an empty week with no tenant refuses too — not a free pass on a quiet week', async () => {
    const err = await resolveTimecardDayJobs([], '' as unknown as string).catch((e) => e);
    expect(err).toBeInstanceOf(TimecardTenantScopeError);
  });

  it('loadTimecardDayJobs does NOT soften a missing tenant into a printable note', async () => {
    loadKeonsWeek();
    // A failed READ degrades to a message the sheet prints. A missing TENANT
    // must not: that would ship a payroll document built from an unscoped read.
    await expect(
      loadTimecardDayJobs(CARDS, undefined as unknown as string)
    ).rejects.toBeInstanceOf(TimecardTenantScopeError);
  });
});

// ── The stale clock-in tag (pure) ───────────────────────────────────────────

describe('isStaleCardTag — is this card naming yesterday’s job?', () => {
  const HARPER = 'JOB-2026-631148';
  const PARKK = 'JOB-2026-424813';
  const NC_675188 = 'JOB-2026-675188';

  it('MICAH, AUG 4: the board says Harper, the card says Monday, nothing else speaks', () => {
    // The founder's report. His card was stamped JOB-2026-424813 at the 07:04
    // clock-in — Monday's job — while the board had him at Harper as Conrade's
    // helper. He filed nothing for Parkk that Tuesday, and neither did anyone
    // else on his behalf. The stamp is the only thing that says he was there.
    expect(
      isStaleCardTag({ tagJobId: PARKK, ledgerJobIds: [HARPER], loggedJobIds: [] })
    ).toBe(true);
  });

  it('ZACK, AUG 14: contradicted too, but he FILED the tagged job’s log that day', () => {
    // The one person-day of this shape in production with corroboration, and the
    // day commit 5ca940e9 exists for. Two records name 424813 — the tag and his
    // own operator log — against one line of a board. The tag stands.
    expect(
      isStaleCardTag({ tagJobId: PARKK, ledgerJobIds: [NC_675188], loggedJobIds: [PARKK] })
    ).toBe(false);
  });

  it('a SILENT board decides nothing — the tag is then the only record there is', () => {
    expect(isStaleCardTag({ tagJobId: PARKK, ledgerJobIds: [], loggedJobIds: [] })).toBe(false);
    expect(isStaleCardTag({ tagJobId: PARKK, ledgerJobIds: null, loggedJobIds: null })).toBe(false);
  });

  it('a board that AGREES is not a contradiction', () => {
    expect(
      isStaleCardTag({ tagJobId: PARKK, ledgerJobIds: [PARKK, HARPER], loggedJobIds: [] })
    ).toBe(false);
  });

  it('an untagged card has nothing to condemn', () => {
    expect(isStaleCardTag({ tagJobId: null, ledgerJobIds: [HARPER], loggedJobIds: [] })).toBe(false);
  });

  it('a log naming some OTHER job is not corroboration of this tag', () => {
    expect(
      isStaleCardTag({ tagJobId: PARKK, ledgerJobIds: [HARPER], loggedJobIds: [HARPER] })
    ).toBe(true);
  });
});
