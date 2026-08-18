/**
 * The two things this route must not get wrong.
 *
 * 1. IT MUST ENFORCE THE WHOLE RULE, NOT THE ROLE HALF.
 *    The affordance rule lives in lib/office-completion.ts and every button on
 *    every surface is drawn from it. The route used to check only
 *    `office_completed_at`, so a POST that never went through a button — a
 *    retried request, a stale tab, curl — could land on a job the crew had
 *    properly signed off, and the unconditional `work_completed_at: now` in the
 *    update OVERWROTE the crew's real completion timestamp with the current
 *    time. JOB-2026-895358 in production (signed 22:09:17, completed 22:09:20)
 *    is exactly that shape. Nothing in the UI offered it; the route allowed it.
 *
 * 2. REOPEN MUST PUT THE JOB BACK WHERE IT CAME FROM.
 *    Reopen hardcoded `in_progress`. The founder's print-only tickets sit at
 *    `scheduled` and no crew ever touched them, so an undo invented work that
 *    never happened — and the job silently left the billing queue, flipped the
 *    customer portal to "In Progress", and (when assigned) re-entered the
 *    nightly clock-out reminder population. The close already writes
 *    `previous_status` into the audit row; the undo reads it back.
 */

import { POST, DELETE } from './route';

// next/server's NextResponse.json needs a real fetch-API Response, which jsdom
// does not have. The route only ever uses `.json(body, { status })`.
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(),
}));
jest.mock('@/lib/get-tenant-id', () => ({
  getTenantId: jest.fn(async () => 'tenant-1'),
}));
jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

import { requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

type Call = [string, ...unknown[]];

/**
 * A chainable stand-in for the PostgREST builder: every method returns itself
 * and records the call, and awaiting it (or calling maybeSingle) resolves the
 * canned result. Queue one result per `from()` in the order the route makes
 * them.
 */
function makeSupabase(results: Array<{ data?: unknown; error?: unknown }>) {
  const calls: Call[] = [];
  let i = 0;
  (supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => {
    calls.push(['from', table]);
    const result = results[i++] ?? { data: null, error: null };
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
              calls.push([prop as string, ...args]);
              return Promise.resolve(result);
            };
          }
          return (...args: unknown[]) => {
            calls.push([prop as string, ...args]);
            return proxy;
          };
        },
      }
    ) as Record<string | symbol, unknown>;
    return proxy;
  });
  return calls;
}

const req = (body?: unknown) =>
  ({ json: async () => body ?? {} }) as unknown as Parameters<typeof POST>[0];
const ctx = { params: Promise.resolve({ id: 'job-1' }) };

const asAdmin = () =>
  (requireAuth as jest.Mock).mockResolvedValue({
    authorized: true,
    userId: 'user-1',
    userEmail: 'office@patriot.test',
    role: 'admin',
  });

/** What the route asked the DB to write, if it wrote anything. */
const updatePayload = (calls: Call[]) =>
  calls.find((c) => c[0] === 'update')?.[1] as Record<string, unknown> | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  asAdmin();
});

describe('POST — closing a job from the office', () => {
  it('closes a job nobody ever closed', async () => {
    const calls = makeSupabase([
      { data: { id: 'job-1', job_number: 'JOB-2026-793440', status: 'scheduled', assigned_to: null, tenant_id: 'tenant-1', office_completed_at: null, completion_signed_at: null } },
      { error: null }, // update
      { error: null }, // audit insert
    ]);

    const res = await POST(req({ reason: 'Print-only ticket — no crew dispatched' }), ctx);
    expect(res.status).toBe(200);

    const payload = updatePayload(calls);
    expect(payload?.status).toBe('completed');
    expect(payload?.office_completion_reason).toBe('Print-only ticket — no crew dispatched');
    expect(payload?.office_completed_by).toBe('user-1');
  });

  it('reads completion_signed_at — the column the gate depends on', async () => {
    const calls = makeSupabase([
      { data: { id: 'job-1', status: 'scheduled', office_completed_at: null, completion_signed_at: null } },
      { error: null },
      { error: null },
    ]);
    await POST(req({ reason: 'Finished on site' }), ctx);

    const select = calls.find((c) => c[0] === 'select')?.[1] as string;
    expect(select).toContain('completion_signed_at');
  });

  it('REFUSES a job the crew already signed off, and writes nothing', async () => {
    // JOB-2026-895358: signed 22:09:17, work_completed_at 22:09:20. The old
    // route would have stamped both office fields AND overwritten
    // work_completed_at with "now".
    const calls = makeSupabase([
      {
        data: {
          id: 'job-1',
          job_number: 'JOB-2026-895358',
          status: 'completed',
          office_completed_at: null,
          completion_signed_at: '2026-08-17T22:09:17.895Z',
        },
      },
    ]);

    const res = await POST(req({ reason: 'Finished on site' }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/crew already closed/i);
    expect(updatePayload(calls)).toBeUndefined();
  });

  it('REFUSES a job already closed by the office', async () => {
    const calls = makeSupabase([
      {
        data: {
          id: 'job-1',
          status: 'completed',
          office_completed_at: '2026-08-17T14:00:00Z',
          completion_signed_at: null,
        },
      },
    ]);

    const res = await POST(req({ reason: 'again' }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already been closed by the office/i);
    expect(updatePayload(calls)).toBeUndefined();
  });

  it('REFUSES a job that is finished or cancelled some other way', async () => {
    const calls = makeSupabase([
      { data: { id: 'job-1', status: 'cancelled', office_completed_at: null, completion_signed_at: null } },
    ]);

    const res = await POST(req({ reason: 'clean up' }), ctx);
    expect(res.status).toBe(409);
    expect(updatePayload(calls)).toBeUndefined();
  });

  it('refuses a role the buttons never offer it to', async () => {
    (requireAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      userId: 'op-1',
      role: 'operator',
    });
    const calls = makeSupabase([]);

    const res = await POST(req({ reason: 'done' }), ctx);
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('still requires a reason', async () => {
    makeSupabase([]);
    const res = await POST(req({ reason: '   ' }), ctx);
    expect(res.status).toBe(400);
  });
});

describe('DELETE — undoing an office close', () => {
  it('restores the status the job was in before the close', async () => {
    const calls = makeSupabase([
      { data: { changes: { reason: 'print only', previous_status: 'scheduled' } } },
      { data: [{ id: 'job-1' }], error: null },
    ]);

    const res = await DELETE(req(), ctx);
    expect(res.status).toBe(200);
    expect(updatePayload(calls)?.status).toBe('scheduled');
    expect(updatePayload(calls)?.office_completed_at).toBeNull();
  });

  it('restores on_hold — a parked ticket must go back to Pending Jobs', async () => {
    const calls = makeSupabase([
      { data: { changes: { previous_status: 'on_hold' } } },
      { data: [{ id: 'job-1' }], error: null },
    ]);

    await DELETE(req(), ctx);
    expect(updatePayload(calls)?.status).toBe('on_hold');
  });

  it('falls back to in_progress when no audit row survives', async () => {
    const calls = makeSupabase([
      { data: null },
      { data: [{ id: 'job-1' }], error: null },
    ]);

    await DELETE(req(), ctx);
    expect(updatePayload(calls)?.status).toBe('in_progress');
  });

  it('falls back to in_progress when the audit row carried no previous_status', async () => {
    const calls = makeSupabase([
      { data: { changes: { reason: 'closed before we recorded status' } } },
      { data: [{ id: 'job-1' }], error: null },
    ]);

    await DELETE(req(), ctx);
    expect(updatePayload(calls)?.status).toBe('in_progress');
  });

  it('reads the LATEST office_completed row, newest first', async () => {
    const calls = makeSupabase([
      { data: { changes: { previous_status: 'assigned' } } },
      { data: [{ id: 'job-1' }], error: null },
    ]);

    await DELETE(req(), ctx);
    expect(calls).toContainEqual(['from', 'job_orders_history']);
    expect(calls).toContainEqual(['eq', 'change_type', 'office_completed']);
    expect(calls).toContainEqual(['order', 'changed_at', { ascending: false }]);
  });

  it('404s when the job was not closed by the office', async () => {
    makeSupabase([
      { data: null },
      { data: [], error: null },
    ]);

    const res = await DELETE(req(), ctx);
    expect(res.status).toBe(404);
  });
});
