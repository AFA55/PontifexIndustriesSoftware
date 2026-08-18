/**
 * What a print button does when it cannot print.
 *
 * The incident these cover: an office admin with correct permissions could
 * print from the job page and not from the schedule board, and after days of
 * her saying so there was not one row anywhere describing it.
 */

import { fetchPrintPdf, describePrintError, isAuthPrintFailure, PrintFailure } from './print-failure';
import { SessionExpiredError, AuthServiceUnavailableError } from './authed-fetch';
import { supabase } from './supabase';
import { reportClientFailure } from './report-error';

jest.mock('./supabase', () => ({
  supabase: { auth: { getSession: jest.fn(), refreshSession: jest.fn() } },
}));
jest.mock('./report-error', () => ({ reportClientFailure: jest.fn() }));
jest.mock('./auth', () => ({ getCurrentUser: () => ({ role: 'admin' }) }));

const auth = (supabase as unknown as {
  auth: { getSession: jest.Mock; refreshSession: jest.Mock };
}).auth;

const reported = reportClientFailure as jest.Mock;

function fakeRes(status: number, body?: unknown): Response {
  const r: Record<string, unknown> = {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    blob: async () => new Blob(['%PDF-1.4']),
  };
  r.clone = () => r;
  return r as unknown as Response;
}

function sessionWith(token: string | null) {
  return { data: { session: token === null ? null : { access_token: token } }, error: null };
}

const ENDPOINT = '/api/job-orders/56e1c6ae/dispatch-pdf';

beforeEach(() => {
  jest.clearAllMocks();
  auth.getSession.mockResolvedValue(sessionWith('good.tok.en'));
  auth.refreshSession.mockResolvedValue(sessionWith('fresh.tok.en'));
  (global.fetch as jest.Mock).mockResolvedValue(fakeRes(200));
});

describe('describePrintError', () => {
  it('gives a dead session and a dead auth service OPPOSITE advice', () => {
    // Telling someone to sign in again while the sign-in service is down sends
    // them to a page that also will not work.
    const expired = describePrintError(new SessionExpiredError());
    const outage = describePrintError(new AuthServiceUnavailableError());

    expect(expired.needsLogin).toBe(true);
    expect(expired.message).toMatch(/sign in again/i);
    expect(expired.errorClass).toBe('SessionExpiredError');

    expect(outage.needsLogin).toBe(false);
    expect(outage.message).toMatch(/your login is fine/i);
    expect(outage.message).not.toMatch(/sign in again/i);
    expect(outage.errorClass).toBe('AuthServiceUnavailableError');
  });

  it('does not dress an ordinary failure up as a login problem', () => {
    const d = describePrintError(new TypeError('Failed to fetch'));
    expect(d.errorClass).toBe('NetworkError');
    expect(d.needsLogin).toBe(false);
  });
});

describe('fetchPrintPdf — the ticket prints', () => {
  it('returns the blob and reports nothing', async () => {
    const result = await fetchPrintPdf(ENDPOINT, { surface: 'schedule-board:card' });
    expect(result.ok).toBe(true);
    expect(reported).not.toHaveBeenCalled();
  });

  it('still prints when the stored token was malformed', async () => {
    // The whole point of the Aug 15 fix, now reaching the board's buttons too.
    auth.getSession.mockResolvedValue(sessionWith('undefined'));
    const result = await fetchPrintPdf(ENDPOINT, { surface: 'schedule-board:card' });
    expect(result.ok).toBe(true);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('still prints when the first attempt 401s and the refresh works', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(fakeRes(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(fakeRes(200));

    const result = await fetchPrintPdf(ENDPOINT, { surface: 'schedule-board:card' });

    expect(result.ok).toBe(true);
    expect(reported).not.toHaveBeenCalled(); // a recovered print is not a failure
  });
});

describe('fetchPrintPdf — the session is genuinely dead', () => {
  it('asks for a sign-in, and says so as a SessionExpiredError', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(fakeRes(401, { error: 'Unauthorized' }));

    const result = (await fetchPrintPdf(ENDPOINT, {
      surface: 'schedule-board:card',
      role: 'admin',
    })) as PrintFailure;

    expect(result.ok).toBe(false);
    expect(result.errorClass).toBe('SessionExpiredError');
    expect(result.needsLogin).toBe(true);
    expect(result.message).toMatch(/sign in again/i);
    expect(isAuthPrintFailure(result)).toBe(true);
  });
});

describe('fetchPrintPdf — the sign-in service is unreachable', () => {
  it('does NOT send the user to a login page', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      fakeRes(503, {
        code: 'auth_service_unavailable',
        error: 'We could not reach the sign-in service. Your login is fine — please try again in a moment.',
      })
    );

    const result = (await fetchPrintPdf(ENDPOINT, { surface: 'schedule-board:card' })) as PrintFailure;

    expect(result.errorClass).toBe('AuthServiceUnavailableError');
    expect(result.needsLogin).toBe(false);
    expect(result.message).toMatch(/try again in a moment/i);
    expect(isAuthPrintFailure(result)).toBe(true);
    // Never refresh against the service that is already failing.
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
});

describe('fetchPrintPdf — the ticket itself failed', () => {
  it('keeps the server’s own words and does not call it an auth problem', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      fakeRes(500, { error: 'Job order has no scheduled date' })
    );

    const result = (await fetchPrintPdf(ENDPOINT, { surface: 'schedule-board:card' })) as PrintFailure;

    expect(result.errorClass).toBe('HttpError');
    expect(result.status).toBe(500);
    expect(result.message).toBe('Job order has no scheduled date');
    expect(result.needsLogin).toBe(false);
    // A per-job failure must NOT stop a batch — the other tickets are fine.
    expect(isAuthPrintFailure(result)).toBe(false);
  });

  it('survives a non-JSON body', async () => {
    const r = fakeRes(502);
    (r as unknown as { json: () => Promise<unknown> }).json = async () => {
      throw new Error('not json');
    };
    (global.fetch as jest.Mock).mockResolvedValue(r);

    const result = (await fetchPrintPdf(ENDPOINT, { surface: 'x' })) as PrintFailure;
    expect(result.message).toBe('Could not generate the ticket.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The second half of the incident: it has to be FINDABLE afterwards.
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchPrintPdf — what lands in error_logs', () => {
  it('records endpoint, status, role and error class for an HTTP failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(fakeRes(500, { error: 'render failed' }));

    await fetchPrintPdf(ENDPOINT, { surface: 'schedule-board:card', role: 'admin' });

    expect(reported).toHaveBeenCalledTimes(1);
    expect(reported.mock.calls[0][0]).toMatchObject({
      type: 'print_failure',
      endpoint: ENDPOINT,
      status: 500,
      errorClass: 'HttpError',
      role: 'admin',
      surface: 'schedule-board:card',
    });
  });

  it('records an auth failure too — that is the one nobody could find', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(fakeRes(401, {}));

    await fetchPrintPdf(ENDPOINT, { surface: 'schedule-board:job-detail', role: 'admin' });

    expect(reported).toHaveBeenCalledTimes(1);
    expect(reported.mock.calls[0][0]).toMatchObject({
      type: 'print_failure',
      errorClass: 'SessionExpiredError',
      status: null,
      role: 'admin',
    });
  });

  it('falls back to the signed-in role when the call site does not know it', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(fakeRes(500, {}));
    await fetchPrintPdf(ENDPOINT, { surface: 'schedule-board:batch-print' });
    expect(reported.mock.calls[0][0].role).toBe('admin');
  });

  it('never puts a token, or any part of one, in the report', async () => {
    auth.getSession.mockResolvedValue(sessionWith('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.s3cr3tsignature'));
    (global.fetch as jest.Mock).mockResolvedValue(fakeRes(500, { error: 'render failed' }));

    await fetchPrintPdf(ENDPOINT, { surface: 'schedule-board:card', role: 'admin' });

    const payload = JSON.stringify(reported.mock.calls[0][0]);
    expect(payload).not.toContain('eyJhbGci');
    expect(payload).not.toContain('s3cr3tsignature');
    expect(payload).not.toMatch(/bearer/i);
    expect(payload).not.toMatch(/access_token/i);
  });

  it('reports once per failed ticket — not once per retry', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(fakeRes(401, {}));
    await fetchPrintPdf(ENDPOINT, { surface: 'schedule-board:card' });
    // authedFetch tried twice internally; the user experienced one failure.
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(reported).toHaveBeenCalledTimes(1);
  });
});
