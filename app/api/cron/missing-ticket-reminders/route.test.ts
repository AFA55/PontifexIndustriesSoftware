/**
 * THE ONE CREW SHAPE THAT WAS NEVER CHASED.
 *
 * This sweep asks whoever was placed on a job yesterday, and clocked in, and
 * filed nothing, to finish their paperwork. It found seven unsubmitted tickets in
 * its first live week.
 *
 * It selected placements with `.not('operator_id', 'is', null)` — every row with
 * a lead. A crew placed with a HELPER AND NO OPERATOR (founder, Aug 20: crews
 * sometimes run under a sub who is not on Pontifex) has no lead by definition, so
 * the sweep dropped it at the query. That is the one shape with nobody to fall
 * back on: the Assign modal promises the helper gets the ticket and their day
 * lands on the job, every other path keeps that promise, and this was the single
 * place it would not have been kept.
 *
 * What must NOT change: a helper on a crew that HAS a lead is still never asked.
 * The lead completes the ticket and the helper is blocked from day-complete by
 * design, so chasing them is asking for something they cannot do.
 */
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));
jest.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: jest.fn() } }));
jest.mock('@/lib/send-reminder', () => ({ sendReminderOnce: jest.fn(async () => true) }));

import { GET } from './route';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendReminderOnce } from '@/lib/send-reminder';

type Result = { data?: unknown; error?: unknown };
type Seen = { table: string; method: string; args: unknown[] };

function mockTables(queues: Record<string, Result[]>): Seen[] {
  const seen: Seen[] = [];
  const cursors: Record<string, number> = {};
  (supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => {
    const i = cursors[table] ?? 0;
    cursors[table] = i + 1;
    const result = queues[table]?.[i] ?? { data: [], error: null };
    const proxy: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') {
            return (res: (v: unknown) => unknown, rej: (v: unknown) => unknown) =>
              Promise.resolve(result).then(res, rej);
          }
          if (prop === 'maybeSingle' || prop === 'single') {
            return (...args: unknown[]) => {
              seen.push({ table, method: prop as string, args });
              return Promise.resolve(result);
            };
          }
          return (...args: unknown[]) => {
            seen.push({ table, method: prop as string, args });
            return proxy;
          };
        },
      }
    ) as Record<string | symbol, unknown>;
    return proxy;
  });
  return seen;
}

// `?force=1` runs the sweep regardless of the wall clock — the dedup key still
// applies, so it can never double-send.
const req = {
  url: 'https://x/api/cron/missing-ticket-reminders?force=1',
  headers: { get: () => 'Bearer test-secret' },
} as unknown as Parameters<typeof GET>[0];

/** Yesterday, tenant-local — the newest date the window covers. */
function yesterdayYMD(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const AXEL = 'axel-valverde';
const NATE = 'conrade-nate';
const JOB = 'job-1';

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret';
  (supabaseAdmin.from as jest.Mock).mockReset();
  (sendReminderOnce as jest.Mock).mockClear().mockResolvedValue(true);
});

function tables(over: Record<string, Result[]>) {
  const day = yesterdayYMD();
  return mockTables({
    tenants: [{ data: [{ id: 'tenant-1', timezone: 'America/New_York' }] }],
    timecards: [{ data: [{ user_id: AXEL, date: day, clock_in_time: `${day}T11:00:00Z` }] }],
    daily_job_logs: [{ data: [] }],
    helper_work_logs: [{ data: [] }],
    job_orders: [
      { data: [{ id: JOB, job_number: 'JOB-2026-521763', customer_name: 'BWC Contracting', status: 'in_progress' }] },
    ],
    profiles: [{ data: [{ id: AXEL, phone: null, phone_number: '+15551234567' }] }],
    ...over,
  });
}

it('chases the helper on a crew that has no operator — nobody else is going to', async () => {
  const day = yesterdayYMD();
  tables({
    job_daily_assignments: [
      { data: [{ job_order_id: JOB, operator_id: null, helper_id: AXEL, assignment_date: day }] },
    ],
  });

  const body = (await (await GET(req)).json()) as { remindersSent: number };

  expect(body.remindersSent).toBe(1);
  const [, payload] = (sendReminderOnce as jest.Mock).mock.calls[0];
  expect(payload.userId).toBe(AXEL);
  // Asked for the thing a helper actually files. "Your ticket" points at a form
  // they do not have — they see the helper view and file a work log.
  expect(payload.title).toMatch(/work log/i);
  expect(payload.message).toContain('BWC Contracting');
  expect(payload.actionUrl).toBe(`/dashboard/my-jobs/${JOB}`);
});

it('stays silent once that helper has filed a real work log', async () => {
  const day = yesterdayYMD();
  tables({
    job_daily_assignments: [
      { data: [{ job_order_id: JOB, operator_id: null, helper_id: AXEL, assignment_date: day }] },
    ],
    helper_work_logs: [
      {
        data: [
          {
            job_order_id: JOB,
            helper_id: AXEL,
            log_date: day,
            completed_at: `${day}T21:00:00Z`,
            work_description: 'Cut and hauled',
          },
        ],
      },
    ],
  });

  const body = (await (await GET(req)).json()) as { remindersSent: number };
  expect(body.remindersSent).toBe(0);
});

it('a bare "start" row does NOT count as filed — it is created the moment they press start', async () => {
  const day = yesterdayYMD();
  tables({
    job_daily_assignments: [
      { data: [{ job_order_id: JOB, operator_id: null, helper_id: AXEL, assignment_date: day }] },
    ],
    helper_work_logs: [
      { data: [{ job_order_id: JOB, helper_id: AXEL, log_date: day, completed_at: null, work_description: '' }] },
    ],
  });

  const body = (await (await GET(req)).json()) as { remindersSent: number };
  expect(body.remindersSent).toBe(1);
});

it('never chases the helper on a crew that HAS a lead — the lead files the ticket', async () => {
  const day = yesterdayYMD();
  tables({
    job_daily_assignments: [
      { data: [{ job_order_id: JOB, operator_id: NATE, helper_id: AXEL, assignment_date: day }] },
    ],
    // Only the helper clocked in; the lead did not, so nothing is owed at all.
    timecards: [{ data: [{ user_id: AXEL, date: day, clock_in_time: `${day}T11:00:00Z` }] }],
  });

  const body = (await (await GET(req)).json()) as { remindersSent: number };
  expect(body.remindersSent).toBe(0);
});

it('a row that places nobody owes nothing — it is a date held open on the board', async () => {
  const day = yesterdayYMD();
  tables({
    job_daily_assignments: [
      { data: [{ job_order_id: JOB, operator_id: null, helper_id: null, assignment_date: day }] },
    ],
  });

  const body = (await (await GET(req)).json()) as { remindersSent: number };
  expect(body.remindersSent).toBe(0);
});

it('still chases a lead operator exactly as before, with the ticket wording', async () => {
  const day = yesterdayYMD();
  tables({
    job_daily_assignments: [
      { data: [{ job_order_id: JOB, operator_id: NATE, helper_id: null, assignment_date: day }] },
    ],
    timecards: [{ data: [{ user_id: NATE, date: day, clock_in_time: `${day}T11:00:00Z` }] }],
    profiles: [{ data: [{ id: NATE, phone: null, phone_number: '+15551234567' }] }],
  });

  const body = (await (await GET(req)).json()) as { remindersSent: number };
  expect(body.remindersSent).toBe(1);
  const [, payload] = (sendReminderOnce as jest.Mock).mock.calls[0];
  expect(payload.userId).toBe(NATE);
  expect(payload.title).toMatch(/ticket/i);
  expect(payload.actionUrl).toContain('/work-performed?date=');
});
