/**
 * A CREW OF ONE HELPER, UNDER A LEAD WHO IS NOT ON PONTIFEX.
 *
 * WHY (founder, Aug 20 2026): *"Sometimes the helpers get assigned to operators
 * that aren't on the platform. What I would like to do to resolve this is just to
 * be able to assign helpers to jobs — so if the helper is in Pontifex we can
 * assign them, and it can show in their timecard even if they are assigned to
 * someone without it."*
 *
 * `job_daily_assignments` has permitted this shape since April — `operator_id` and
 * `helper_id` are both nullable — and across 111 production rows it had never once
 * occurred: 55 both, 33 operator-only, 23 NOBODY, 0 helper-only. The schema was
 * never the obstacle; the schedule board's UI was.
 *
 * These tests pin the two claims that make the fix real rather than cosmetic:
 *
 *   1. A HELPER-ONLY ROW IS A PLACEMENT, NOT A SKELETON. The 23 rows with nobody
 *      on them hold a date open on the board and must supply neither a job nor a
 *      `day_sequence` — the guard that stopped Axel's Aug 12 being ordered off an
 *      empty row and 3.65 h landing on a job he never visited. A helper-only row
 *      is the opposite: a real crew, whose day must resolve.
 *
 *   2. THE HELPER'S TIMECARD LANDS ON THE JOB, from the board alone, with no
 *      operator anywhere in the evidence and nothing filed by the crew.
 *
 * The regression case is deliberately included: every day that resolved before
 * this change must resolve identically after it.
 */
const mockResults: Record<string, { data: any[] | null; error: any }> = {};
const mockCalls: Record<string, { method: string; args: any[] }[]> = {};

jest.mock('./supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
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

import { resolveTimecardDayJobs, personDayKey } from './timecard-job-context';
import { resolveDayJobs } from './timecard-job-rules';
import { buildTicketDays, ticketRange, grandTotalHours } from './work-ticket';
import {
  normalizeOffPlatformLeadName,
  describeOffPlatformLead,
  isMissingColumnError,
  placesSomeone,
  isHelperOnlyPlacement,
  resolveOffPlatformLead,
  offPlatformLeadChanged,
  OFF_PLATFORM_LEAD_MAX_LENGTH,
} from './off-platform-lead';

const TENANT = 'ee3d8081-cec2-47f3-ac23-bdc0bb2d142d';
const HELPER = 'bb5f3f96-1960-477b-8ca4-24f3a38a2670';
const OPERATOR = '298b3194-20df-475e-8011-a3ad082b72ef';
const JOB = 'b699d8ec-3aa2-4d7b-8b41-f32869bf157c';
const OTHER_JOB = 'd215cc94-9467-4875-8859-6c940712b635';

const DAY = '2026-08-20';

function reset() {
  for (const k of Object.keys(mockResults)) delete mockResults[k];
  for (const k of Object.keys(mockCalls)) delete mockCalls[k];
  mockResults.job_orders = {
    data: [
      { id: JOB, job_number: 'JOB-2026-898480', customer_name: 'AM King', project_name: 'GE - KAA pit infill', status: 'assigned' },
      { id: OTHER_JOB, job_number: 'QA-2026-533392', customer_name: 'AM King', project_name: null, status: 'completed' },
    ],
    error: null,
  };
}

beforeEach(reset);

// ── 1. The shape itself ─────────────────────────────────────────────────────

describe('a helper-only row is a placement, a skeleton row is not', () => {
  it('counts a helper alone as somebody, and nobody as nobody', () => {
    expect(placesSomeone({ operator_id: null, helper_id: HELPER })).toBe(true);
    expect(placesSomeone({ operator_id: OPERATOR, helper_id: null })).toBe(true);
    expect(placesSomeone({ operator_id: OPERATOR, helper_id: HELPER })).toBe(true);
    // The 23 production rows that place nobody — a date held open on the board.
    expect(placesSomeone({ operator_id: null, helper_id: null })).toBe(false);
  });

  it('tells a helper-only crew apart from every other shape', () => {
    expect(isHelperOnlyPlacement({ operator_id: null, helper_id: HELPER })).toBe(true);
    expect(isHelperOnlyPlacement({ operator_id: OPERATOR, helper_id: HELPER })).toBe(false);
    expect(isHelperOnlyPlacement({ operator_id: OPERATOR, helper_id: null })).toBe(false);
    expect(isHelperOnlyPlacement({ operator_id: null, helper_id: null })).toBe(false);
  });
});

// ── 2. The founder's actual ask ─────────────────────────────────────────────

describe("the helper's timecard shows the job", () => {
  it('resolves a helper-only board row onto that helper’s day', async () => {
    mockResults.job_daily_assignments = {
      data: [{ assignment_date: DAY, operator_id: null, helper_id: HELPER, job_order_id: JOB }],
      error: null,
    };
    // Nothing else names anything: no operator ticket, no helper log, and the
    // clock card carries no job tag. The board is the only record there is —
    // which is exactly the day the founder is describing.
    const out = await resolveTimecardDayJobs(
      [{ id: 'tc-1', user_id: HELPER, date: DAY, job_order_id: null }],
      TENANT
    );

    const day = out.get(personDayKey(HELPER, DAY))!;
    expect(day.unresolved).toBe(false);
    expect(day.jobs.map((j) => j.jobOrderId)).toEqual([JOB]);
    expect(day.jobs[0].jobNumber).toBe('JOB-2026-898480');
    // Stated as recorded fact, not inferred — the office placed him there.
    expect(day.jobs[0].source).toBe('day_ledger');
    expect(day.conflicts).toEqual([]);
  });

  it('still outranks the helper’s own filed log, exactly as an operator row does', async () => {
    mockResults.job_daily_assignments = {
      data: [{ assignment_date: DAY, operator_id: null, helper_id: HELPER, job_order_id: JOB }],
      error: null,
    };
    // The stale-completed-job shape: his phone still reaches the old job.
    mockResults.helper_work_logs = {
      data: [{ helper_id: HELPER, log_date: DAY, job_order_id: OTHER_JOB }],
      error: null,
    };

    const day = (await resolveTimecardDayJobs(
      [{ id: 'tc-1', user_id: HELPER, date: DAY, job_order_id: null }],
      TENANT
    )).get(personDayKey(HELPER, DAY))!;

    expect(day.jobs.map((j) => j.jobOrderId)).toEqual([JOB]);
    // Reported, never swallowed.
    expect(day.conflicts.map((j) => j.jobOrderId)).toEqual([OTHER_JOB]);
  });

  it('does not resolve a day off a row that places nobody', async () => {
    // The skeleton shape. It must remain silent — the board saying nothing is
    // what lets the lower rungs answer, and borrowing from it is the Aug 12 bug.
    mockResults.job_daily_assignments = {
      data: [{ assignment_date: DAY, operator_id: null, helper_id: null, job_order_id: JOB }],
      error: null,
    };

    const day = (await resolveTimecardDayJobs(
      [{ id: 'tc-1', user_id: HELPER, date: DAY, job_order_id: null }],
      TENANT
    )).get(personDayKey(HELPER, DAY))!;

    expect(day.jobs).toEqual([]);
    expect(day.unresolved).toBe(true);
  });

  it('reads BOTH seats of the ledger, so the helper is not filtered out at the query', async () => {
    mockResults.job_daily_assignments = {
      data: [{ assignment_date: DAY, operator_id: null, helper_id: HELPER, job_order_id: JOB }],
      error: null,
    };
    await resolveTimecardDayJobs([{ id: 'tc-1', user_id: HELPER, date: DAY, job_order_id: null }], TENANT);

    const ledgerCalls = mockCalls.job_daily_assignments ?? [];
    const or = ledgerCalls.find((c) => c.method === 'or');
    expect(or).toBeDefined();
    expect(String(or!.args[0])).toContain('helper_id.in.');
    // …and it is tenant-scoped. supabaseAdmin bypasses RLS; this is the only
    // thing keeping another company's job off a payroll document.
    expect(ledgerCalls.some((c) => c.method === 'eq' && c.args[0] === 'tenant_id' && c.args[1] === TENANT)).toBe(true);
  });
});

// ── 3. Nothing that resolved before resolves differently ────────────────────

describe('the days that already resolved are untouched', () => {
  it('an operator-only board day still lands on the board’s job', async () => {
    mockResults.job_daily_assignments = {
      data: [{ assignment_date: DAY, operator_id: OPERATOR, helper_id: null, job_order_id: JOB }],
      error: null,
    };
    const day = (await resolveTimecardDayJobs(
      [{ id: 'tc-1', user_id: OPERATOR, date: DAY, job_order_id: OTHER_JOB }],
      TENANT
    )).get(personDayKey(OPERATOR, DAY))!;

    expect(day.jobs.map((j) => j.jobOrderId)).toEqual([JOB]);
    expect(day.conflicts.map((j) => j.jobOrderId)).toEqual([OTHER_JOB]);
  });

  it('an operator-and-helper row still places both people', async () => {
    mockResults.job_daily_assignments = {
      data: [{ assignment_date: DAY, operator_id: OPERATOR, helper_id: HELPER, job_order_id: JOB }],
      error: null,
    };
    const out = await resolveTimecardDayJobs(
      [
        { id: 'tc-1', user_id: OPERATOR, date: DAY, job_order_id: null },
        { id: 'tc-2', user_id: HELPER, date: DAY, job_order_id: null },
      ],
      TENANT
    );
    expect(out.get(personDayKey(OPERATOR, DAY))!.jobs.map((j) => j.jobOrderId)).toEqual([JOB]);
    expect(out.get(personDayKey(HELPER, DAY))!.jobs.map((j) => j.jobOrderId)).toEqual([JOB]);
  });

  it('the ladder itself is unchanged — the board still outranks a filed log', () => {
    const res = resolveDayJobs([
      { jobId: OTHER_JOB, source: 'helper_log' },
      { jobId: JOB, source: 'day_ledger' },
    ]);
    expect(res.jobIds).toEqual([JOB]);
    expect(res.conflictJobIds).toEqual([OTHER_JOB]);
  });
});

// ── 4. The printed ticket ───────────────────────────────────────────────────

describe('the printed ticket shows the helper’s day', () => {
  it('prints a row for a helper the board placed here, with nobody else on the crew', () => {
    // The founder's standing rule (commit 7feae321): the ticket shows EVERY day
    // the crew was there, whether or not anyone filed anything. A helper-only day
    // is now one of those days — and it must print with no hours invented, since
    // seeding a day is not the same as clocking one.
    const days = buildTicketDays({
      range: ticketRange('day', DAY),
      timecards: [],
      logs: [],
      workItems: [],
      roles: new Map([[HELPER, 'helper' as const]]),
      names: new Map([[HELPER, 'Micah Rentz']]),
      scheduledPersonDays: new Set([`${HELPER}|${DAY}`]),
      todayYMD: DAY,
    });

    expect(days).toHaveLength(1);
    const person = days[0].people.find((p) => p.user_id === HELPER)!;
    expect(person).toBeDefined();
    expect(person.name).toBe('Micah Rentz');
    // Placed, not clocked: a seeded day never invents hours.
    expect(person.hours ?? null).toBeNull();
    expect(grandTotalHours(days)).toBe(0);
  });
});

// ── 5. Naming the lead ──────────────────────────────────────────────────────

describe('the off-platform lead’s name', () => {
  it('treats blank and absent as the same answer', () => {
    expect(normalizeOffPlatformLeadName('')).toBeNull();
    expect(normalizeOffPlatformLeadName('   ')).toBeNull();
    expect(normalizeOffPlatformLeadName(null)).toBeNull();
    expect(normalizeOffPlatformLeadName(undefined)).toBeNull();
    expect(normalizeOffPlatformLeadName(42)).toBeNull();
  });

  it('trims and collapses what the office typed', () => {
    expect(normalizeOffPlatformLeadName('  Nate   Richardson ')).toBe('Nate Richardson');
  });

  it('caps a paste at a length a board row can print', () => {
    const long = 'x'.repeat(OFF_PLATFORM_LEAD_MAX_LENGTH + 40);
    expect(normalizeOffPlatformLeadName(long)).toHaveLength(OFF_PLATFORM_LEAD_MAX_LENGTH);
  });

  it('never renders as a blank — an unnamed lead still says the crew has one', () => {
    // The literal strings, not a constant compared against itself — this is the
    // line the office reads off the board row.
    expect(describeOffPlatformLead('Nate')).toBe('Nate — not on Pontifex');
    expect(describeOffPlatformLead('   ')).toBe('Lead not on Pontifex');
    expect(describeOffPlatformLead(null)).toBe('Lead not on Pontifex');
  });

  it('survives only on a crew where a helper is alone', () => {
    // Stated once, in one function, because the write path needs this answer
    // twice — on the row it upserts and in what it reports back. Two copies of
    // a rule are two rules.
    const requested = 'Mike Sanchez';
    expect(resolveOffPlatformLead({ operatorId: null, helperId: HELPER, requested })).toBe('Mike Sanchez');
    // An operator leads the crew — a name beside them would print two leads.
    expect(resolveOffPlatformLead({ operatorId: OPERATOR, helperId: HELPER, requested })).toBeNull();
    expect(resolveOffPlatformLead({ operatorId: OPERATOR, helperId: null, requested })).toBeNull();
    // NOBODY is on the row: this is the skeleton shape. A lead left behind here
    // is inherited by whoever is assigned to the row next.
    expect(resolveOffPlatformLead({ operatorId: null, helperId: null, requested })).toBeNull();
  });

  it('leaves a stored name alone when the caller said nothing about a helper-only crew', () => {
    expect(
      resolveOffPlatformLead({ operatorId: null, helperId: HELPER, requested: undefined })
    ).toBeUndefined();
    // …but silence does NOT preserve a lead on a crew that no longer has one.
    expect(resolveOffPlatformLead({ operatorId: null, helperId: null, requested: undefined })).toBeNull();
    expect(resolveOffPlatformLead({ operatorId: OPERATOR, helperId: null, requested: undefined })).toBeNull();
  });

  it('is not "changed" by whitespace, or by a seat nobody spoke about', () => {
    expect(offPlatformLeadChanged('  Mike   Sanchez ', 'Mike Sanchez')).toBe(false);
    expect(offPlatformLeadChanged('', null)).toBe(false);
    expect(offPlatformLeadChanged(undefined, 'Mike Sanchez')).toBe(false);
    expect(offPlatformLeadChanged('Mike Sanchez', null)).toBe(true);
    expect(offPlatformLeadChanged(null, 'Mike Sanchez')).toBe(true);
  });
});

// ── 6. Shipping before the migration is applied ─────────────────────────────

describe('the column may not exist yet', () => {
  it('recognises both errors Postgres and PostgREST answer with', () => {
    expect(isMissingColumnError({ code: '42703', message: 'column "off_platform_lead_name" does not exist' })).toBe(true);
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'off_platform_lead_name' column of 'job_daily_assignments' in the schema cache" })).toBe(true);
    expect(isMissingColumnError({ message: "column job_daily_assignments.off_platform_lead_name does not exist" })).toBe(true);
  });

  it('does not mistake a real failure for a missing column', () => {
    // A duplicate-key race and a permission error must NOT be retried as though
    // the column were absent — that would swallow a genuine write failure.
    expect(isMissingColumnError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
    expect(isMissingColumnError({ code: '42501', message: 'permission denied for table job_daily_assignments' })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
    expect(isMissingColumnError({ message: 'some other column does not exist' })).toBe(false);
  });

  it('insists it is THIS column, so a typo elsewhere is not swallowed', () => {
    // `42703` and `PGRST204` are also what a mis-spelled column name answers.
    // Read as "the migration isn't applied", the code would drop into a fallback
    // that fails the same way — and the fallback IS the whole per-day overlay.
    expect(isMissingColumnError({ code: '42703', message: 'column "helper_di" does not exist' })).toBe(false);
    expect(
      isMissingColumnError({
        code: 'PGRST204',
        message: "Could not find the 'operatr_id' column of 'job_daily_assignments' in the schema cache",
      })
    ).toBe(false);
    // A client that drops the message leaves nothing to judge but the code.
    expect(isMissingColumnError({ code: '42703' })).toBe(true);
    expect(isMissingColumnError({ code: 'PGRST204', message: '' })).toBe(true);
  });
});
