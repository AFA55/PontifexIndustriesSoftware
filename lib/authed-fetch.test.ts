/**
 * The rules that keep a printed ticket from dying on a bad token.
 * See lib/authed-fetch.ts for the auth-log evidence behind these.
 */

import {
  looksLikeJwt,
  isReplayable,
  SessionExpiredError,
  isSessionExpired,
  AuthServiceUnavailableError,
  isAuthServiceUnavailable,
  authedFetch,
  authedFetchQuiet,
} from './authed-fetch';
import { supabase } from './supabase';

jest.mock('./supabase', () => ({
  supabase: { auth: { getSession: jest.fn(), refreshSession: jest.fn() } },
}));

const auth = (supabase as unknown as {
  auth: { getSession: jest.Mock; refreshSession: jest.Mock };
}).auth;

/** A Response stand-in — jsdom has no real one, and we only read four things. */
function fakeRes(status: number, body?: unknown): Response {
  const r: Record<string, unknown> = {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    blob: async () => new Blob(['%PDF']),
  };
  r.clone = () => r;
  return r as unknown as Response;
}

function sessionWith(token: string | null) {
  return { data: { session: token === null ? null : { access_token: token } }, error: null };
}

/** The bearer actually put on the wire for the Nth fetch call (1-based). */
function sentBearer(call: number): string | null {
  const init = (global.fetch as jest.Mock).mock.calls[call - 1][1] as RequestInit;
  return new Headers(init.headers).get('authorization');
}

/** Every bearer sent, so a test can assert a bad one NEVER left the browser. */
function allBearers(): string[] {
  return (global.fetch as jest.Mock).mock.calls.map(
    ([, init]) => new Headers((init as RequestInit).headers).get('authorization') || ''
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  auth.getSession.mockResolvedValue(sessionWith('good.tok.en'));
  auth.refreshSession.mockResolvedValue(sessionWith('fresh.tok.en'));
  (global.fetch as jest.Mock).mockResolvedValue(fakeRes(200, { success: true }));
});

describe('AuthServiceUnavailableError', () => {
  it('is never confused with an expired session', () => {
    // These must stay distinct: one means "sign in again", the other means
    // "your login is fine, our dependency is down". Conflating them is what
    // told a whole company to re-authenticate during a Supabase blip — and
    // re-authenticating hits the same service that is failing.
    const service = new AuthServiceUnavailableError();
    const expired = new SessionExpiredError();
    expect(isAuthServiceUnavailable(service)).toBe(true);
    expect(isSessionExpired(service)).toBe(false);
    expect(isAuthServiceUnavailable(expired)).toBe(false);
  });

  it('tells the user the problem is not theirs', () => {
    expect(new AuthServiceUnavailableError().message).toMatch(/your login is fine/i);
    expect(new AuthServiceUnavailableError().message).not.toMatch(/sign in again/i);
  });

  it('does not swallow ordinary errors', () => {
    expect(isAuthServiceUnavailable(new Error('API error 500'))).toBe(false);
    expect(isAuthServiceUnavailable(null)).toBe(false);
  });
});

describe('looksLikeJwt', () => {
  it('accepts a three-segment token', () => {
    expect(looksLikeJwt('header.payload.signature')).toBe(true);
  });

  it('rejects the exact class GoTrue complained about: wrong segment count', () => {
    // "token is malformed: token contains an invalid number of segments"
    expect(looksLikeJwt('undefined')).toBe(false);
    expect(looksLikeJwt('null')).toBe(false);
    expect(looksLikeJwt('a.b')).toBe(false);
    expect(looksLikeJwt('a.b.c.d')).toBe(false);
  });

  it('rejects a token with an empty segment (a truncated or spliced value)', () => {
    expect(looksLikeJwt('header..signature')).toBe(false);
    expect(looksLikeJwt('.payload.signature')).toBe(false);
    expect(looksLikeJwt('header.payload.')).toBe(false);
  });

  it('rejects nothing-at-all without throwing', () => {
    expect(looksLikeJwt(null)).toBe(false);
    expect(looksLikeJwt(undefined)).toBe(false);
    expect(looksLikeJwt('')).toBe(false);
  });

  it('does not try to judge whether a well-formed token is REAL', () => {
    // Shape only. The server is the sole authority on validity — a check that
    // guessed at expiry here would start refusing tokens the server accepts.
    expect(looksLikeJwt('not.a.jwt')).toBe(true);
  });
});

describe('isReplayable', () => {
  it('treats a bodyless request as retryable', () => {
    expect(isReplayable(undefined)).toBe(true);
    expect(isReplayable(null)).toBe(true);
  });

  it('treats a JSON string body as retryable', () => {
    expect(isReplayable(JSON.stringify({ a: 1 }))).toBe(true);
  });

  it('treats a stream as one-shot', () => {
    // A consumed stream cannot be sent twice; retrying would send an empty body
    // and look like a successful no-op, which is worse than the 401.
    const stream = { getReader() {} };
    expect(isReplayable(stream as unknown as BodyInit)).toBe(false);
  });
});

describe('SessionExpiredError', () => {
  it('is recognisable across a module boundary', () => {
    expect(isSessionExpired(new SessionExpiredError())).toBe(true);
  });

  it('does not swallow ordinary failures', () => {
    // A 404 or a 500 must stay itself — disguising one as a login problem sends
    // the office to re-authenticate over a bug that has nothing to do with auth.
    expect(isSessionExpired(new Error('API error 500'))).toBe(false);
    expect(isSessionExpired(null)).toBe(false);
  });

  it('carries a sentence a non-technical user can act on', () => {
    expect(new SessionExpiredError().message).toMatch(/sign in again/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The four situations that actually took the office's print button away.
// ─────────────────────────────────────────────────────────────────────────────

describe('authedFetch — a MALFORMED token (the observed failure)', () => {
  it('never puts the bad value on the wire; it refreshes first', async () => {
    // The exact shape GoTrue rejected: "token contains an invalid number of
    // segments". Sending it buys a guaranteed 401 that then gets reported to
    // the user as "your session expired" — which is not what happened.
    auth.getSession.mockResolvedValue(sessionWith('undefined'));

    const res = await authedFetch('/api/job-orders/1/dispatch-pdf');

    expect(res.status).toBe(200);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(sentBearer(1)).toBe('Bearer fresh.tok.en');
    expect(allBearers().join(' ')).not.toContain('undefined');
  });

  it('gives up honestly when the refresh cannot produce a JWT either', async () => {
    auth.getSession.mockResolvedValue(sessionWith('a.b'));
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'no' } });

    await expect(authedFetch('/api/x')).rejects.toBeInstanceOf(SessionExpiredError);
    // Nothing was sent — we knew before the round trip.
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('authedFetch — 401 then a successful refresh', () => {
  it('retries once with the new token and returns the good response', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(fakeRes(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(fakeRes(200, { success: true }));

    const res = await authedFetch('/api/job-orders/1/dispatch-pdf');

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(sentBearer(1)).toBe('Bearer good.tok.en');
    expect(sentBearer(2)).toBe('Bearer fresh.tok.en');
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('does not retry a body it cannot send twice', async () => {
    // A consumed stream replays as an empty body, which would look like a
    // successful no-op — worse than the 401 it was hiding.
    (global.fetch as jest.Mock).mockResolvedValueOnce(fakeRes(401, {}));
    const stream = { getReader() {} } as unknown as BodyInit;

    await expect(authedFetch('/api/x', { method: 'POST', body: stream })).rejects.toBeInstanceOf(
      SessionExpiredError
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
});

describe('authedFetch — 401 and the session really is dead', () => {
  it('throws SessionExpiredError after exactly one refresh attempt', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(fakeRes(401, { error: 'Unauthorized' }));

    await expect(authedFetch('/api/x')).rejects.toBeInstanceOf(SessionExpiredError);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2); // original + one retry, no more
  });

  it('says sign in again — and does NOT say the service is down', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(fakeRes(401, {}));
    await authedFetch('/api/x').catch((e) => {
      expect(isSessionExpired(e)).toBe(true);
      expect(isAuthServiceUnavailable(e)).toBe(false);
      expect((e as Error).message).toMatch(/sign in again/i);
    });
    expect.assertions(3);
  });
});

describe('authedFetch — the sign-in service itself is down', () => {
  it('throws AuthServiceUnavailableError and refreshes NOTHING', async () => {
    // Refreshing calls the same service that is already failing. Doing it turns
    // one struggling dependency into two requests per caller.
    (global.fetch as jest.Mock).mockResolvedValue(
      fakeRes(503, {
        code: 'auth_service_unavailable',
        error: 'We could not reach the sign-in service. Your login is fine — please try again in a moment.',
      })
    );

    const err = await authedFetch('/api/x').catch((e) => e);

    expect(isAuthServiceUnavailable(err)).toBe(true);
    expect(isSessionExpired(err)).toBe(false);
    expect((err as Error).message).toMatch(/your login is fine/i);
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('leaves an ordinary 503 alone', async () => {
    // Not every 503 is an auth outage. A PDF renderer falling over is a 503
    // the caller needs to read, not a login story.
    (global.fetch as jest.Mock).mockResolvedValue(fakeRes(503, { error: 'PDF service busy' }));
    const res = await authedFetch('/api/x');
    expect(res.status).toBe(503);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// authedFetchQuiet — same recovery, always a Response (the schedule board).
// ─────────────────────────────────────────────────────────────────────────────

describe('authedFetchQuiet', () => {
  it('refreshes a malformed token before sending anything', async () => {
    auth.getSession.mockResolvedValue(sessionWith('null'));
    const res = await authedFetchQuiet('/api/admin/schedule-board?date=2026-08-18');
    expect(res.status).toBe(200);
    expect(sentBearer(1)).toBe('Bearer fresh.tok.en');
    expect(allBearers().join(' ')).not.toContain('null');
  });

  it('retries a 401 once with a fresh token', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(fakeRes(401, {}))
      .mockResolvedValueOnce(fakeRes(200, { success: true }));

    const res = await authedFetchQuiet('/api/admin/schedule-board');
    expect(res.status).toBe(200);
    expect(sentBearer(2)).toBe('Bearer fresh.tok.en');
  });

  it('hands back the server 401 instead of throwing when the session is dead', async () => {
    // Sixty call sites on the board read `res.ok`. Throwing at them mid-outage
    // is how a one-line fix becomes a regression hunt.
    (global.fetch as jest.Mock).mockResolvedValue(fakeRes(401, { error: 'Unauthorized' }));
    const res = await authedFetchQuiet('/api/admin/schedule-board');
    expect(res.status).toBe(401);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('spends at most ONE forced refresh when there is no usable session at all', async () => {
    auth.getSession.mockResolvedValue(sessionWith(null));
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'no' } });
    (global.fetch as jest.Mock).mockResolvedValue(fakeRes(401, { error: 'Unauthorized' }));

    const res = await authedFetchQuiet('/api/admin/schedule-board');

    expect(res.status).toBe(401);
    // The refresh already failed once; asking again would just fail again.
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('never throws on a 503 auth outage — it returns it', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      fakeRes(503, { code: 'auth_service_unavailable', error: 'down' })
    );
    const res = await authedFetchQuiet('/api/admin/schedule-board');
    expect(res.status).toBe(503);
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
});

describe('the Authorization header when there is nothing to send', () => {
  it('omits the header entirely rather than sending a bare "Bearer "', async () => {
    // `Bearer ` with nothing after it is a request CLAIMING a credential it does
    // not have. The server trims it to empty and 401s cleanly either way, so
    // this is about honesty in the network log, not behaviour: a reader chasing
    // an auth outage should be able to see at a glance which calls actually
    // carried a token.
    auth.getSession.mockResolvedValue(sessionWith(null));
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'no' } });
    (global.fetch as jest.Mock).mockResolvedValue(fakeRes(401, { error: 'Unauthorized' }));

    await authedFetchQuiet('/api/admin/schedule-board');

    expect(sentBearer(1)).toBeNull();
    expect(allBearers().join(' ')).not.toContain('Bearer ');
  });

  it('leaves a caller-supplied Authorization alone when we have no token of our own', async () => {
    // Replacing a credential somebody chose deliberately is not ours to do —
    // the same rule lib/api-client.ts already follows.
    auth.getSession.mockResolvedValue(sessionWith(null));
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'no' } });
    (global.fetch as jest.Mock).mockResolvedValue(fakeRes(200, {}));

    await authedFetchQuiet('/api/x', { headers: { Authorization: 'Bearer caller.supplied.token' } });

    expect(sentBearer(1)).toBe('Bearer caller.supplied.token');
  });
});
