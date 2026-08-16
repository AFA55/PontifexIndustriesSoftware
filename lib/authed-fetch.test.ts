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
} from './authed-fetch';

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
