/**
 * A failure has to be findable afterwards — and a credential must never be the
 * price of finding it. A bearer token written into `error_logs` is a bearer
 * token in every backup, export and screenshot of the health dashboard.
 */

import { redactTokens, scrubUrl, reportClientFailure, reportClientError } from './report-error';

const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NmUxYzZhZSIsInJvbGUiOiJhZG1pbiJ9.Zm9vYmFyc2lnbmF0dXJlMTIz';

describe('redactTokens', () => {
  it('removes a JWT wherever it appears', () => {
    expect(redactTokens(`Authorization was ${JWT} apparently`)).not.toContain('eyJhbGci');
    expect(redactTokens(`x ${JWT} y`)).toContain('[redacted-token]');
  });

  it('removes a bearer header echoed back by a server', () => {
    expect(redactTokens('sent header Bearer abc123def')).toBe('sent header Bearer [redacted]');
  });

  it('leaves an ordinary message alone', () => {
    const msg = 'Job order has no scheduled date';
    expect(redactTokens(msg)).toBe(msg);
  });

  it('does not choke on empty input', () => {
    expect(redactTokens('')).toBe('');
  });
});

describe('scrubUrl', () => {
  it('drops the fragment entirely', () => {
    // Supabase hands back `#access_token=…` on some auth flows, and the
    // fragment has never told us anything useful about a failure.
    expect(scrubUrl(`https://app.example.com/dashboard#access_token=${JWT}&type=recovery`)).toBe(
      'https://app.example.com/dashboard'
    );
  });

  it('redacts a sensitive query value but keeps the page identifiable', () => {
    const out = scrubUrl('https://app.example.com/setup-account?token=abc123&mode=week');
    expect(out).toContain('/setup-account');
    expect(out).toContain('mode=week');
    expect(out).not.toContain('abc123');
  });

  it('redacts a token-shaped value even under an innocent-looking key', () => {
    const out = scrubUrl(`https://app.example.com/x?t=${JWT}`);
    expect(out).not.toContain('eyJhbGci');
  });

  it('keeps a plain board URL exactly as useful as it was', () => {
    const out = scrubUrl('https://app.example.com/dashboard/admin/schedule-board?date=2026-08-18');
    expect(out).toContain('date=2026-08-18');
  });
});

describe('reportClientFailure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it('posts the row that makes "I can’t print" answerable with a query', () => {
    reportClientFailure({
      type: 'print_failure',
      endpoint: '/api/job-orders/abc/dispatch-pdf',
      status: 401,
      errorClass: 'SessionExpiredError',
      message: 'Your session has expired. Please sign in again.',
      role: 'admin',
      surface: 'schedule-board:card',
    });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/log-error');
    const body = JSON.parse((init as RequestInit).body as string);
    // `url` is what the route writes into error_logs.endpoint — the API route
    // is the findable thing, and the page rides along in extra.
    expect(body.url).toBe('/api/job-orders/abc/dispatch-pdf');
    expect(body.type).toBe('print_failure');
    expect(body.extra).toMatchObject({
      status: 401,
      role: 'admin',
      errorClass: 'SessionExpiredError',
      surface: 'schedule-board:card',
    });
  });

  it('uses keepalive so a report survives the tab that produced it', () => {
    reportClientFailure({
      type: 'print_failure',
      endpoint: '/api/x',
      errorClass: 'HttpError',
      message: 'boom',
    });
    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(init.keepalive).toBe(true);
  });

  it('redacts a credential that somehow reached it', () => {
    reportClientFailure({
      type: 'print_failure',
      endpoint: `/api/x?token=${JWT}`,
      errorClass: 'HttpError',
      message: `upstream said Bearer ${JWT}`,
    });
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as string;
    expect(body).not.toContain('eyJhbGci');
  });

  it('never throws, whatever fetch does — a reporter that fails inside a failure is two bugs', () => {
    (global.fetch as jest.Mock).mockImplementation(() => {
      throw new Error('network gone');
    });
    expect(() =>
      reportClientFailure({
        type: 'print_failure',
        endpoint: '/api/x',
        errorClass: 'NetworkError',
        message: 'boom',
      })
    ).not.toThrow();
  });
});

/**
 * The boundary reporter is the OTHER path into `error_logs`, and until now the
 * only one that sent raw strings. `reportClientFailure` redacted everything
 * while `reportClientError` posted `error.message`, `error.stack` and
 * `componentStack` untouched — and those are exactly the strings that carry a
 * credential by accident: a failed fetch echoes the request it failed on, and a
 * stack frame carries the URL of the module that threw.
 *
 * One reporter that redacts and one that does not is the same as neither.
 */
describe('reportClientError — the boundary path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  const sent = () => JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);

  it('redacts a token echoed in the error MESSAGE', () => {
    reportClientError({
      error: new Error(`GET /api/x failed with Bearer ${JWT}`),
      boundary: 'dashboard',
    });

    const body = sent();
    expect(body.error).not.toContain('eyJhbGci');
    expect(body.error).toContain('[redacted');
  });

  it('redacts a token carried in the STACK', () => {
    const err = new Error('boom');
    err.stack = `Error: boom\n    at fetchThing (https://app.example.com/x.js?access_token=${JWT}:1:1)`;

    reportClientError({ error: err, boundary: 'dashboard' });

    const body = sent();
    expect(body.stack).not.toContain('eyJhbGci');
  });

  it('redacts a token carried in the React COMPONENT STACK', () => {
    reportClientError({
      error: new Error('boom'),
      boundary: 'dashboard',
      componentStack: `\n    in Thing (created by Page ${JWT})`,
    });

    const body = sent();
    expect(body.componentStack).not.toContain('eyJhbGci');
  });

  it('leaves an ordinary crash completely readable — redaction must not cost detail', () => {
    const err = new Error('Cannot read properties of undefined (reading "status")');
    err.stack = 'Error: ...\n    at getDayCellClasses (app/dashboard/admin/timecards/page.tsx:132:12)';

    reportClientError({ error: err, boundary: 'dashboard', componentStack: '\n    in TimecardsPage' });

    const body = sent();
    expect(body.error).toBe('Cannot read properties of undefined (reading "status")');
    expect(body.stack).toContain('getDayCellClasses');
    expect(body.componentStack).toContain('TimecardsPage');
  });
});
