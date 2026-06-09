/**
 * Tests for getResendApiKey() — the defensive sanitizer that fixed the
 * production outage where the Vercel env var value was `RESEND_API_KEY=re_xxx`
 * (the variable NAME glued onto the front of the value), which Resend rejected
 * and silently 502'd every outbound email.
 */

const ORIGINAL = process.env.RESEND_API_KEY;

// Re-import fresh each time so the module-level read can't cache anything;
// getResendApiKey reads process.env at call time, so a single import is fine.
import { getResendApiKey, isEmailConfigured } from './email';

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = ORIGINAL;
});

describe('getResendApiKey', () => {
  it('passes a clean key through untouched', () => {
    process.env.RESEND_API_KEY = 're_CBnAbCdEfGhIjKlMnOpQrStUvWxYz1234';
    expect(getResendApiKey()).toBe('re_CBnAbCdEfGhIjKlMnOpQrStUvWxYz1234');
  });

  it('strips a self-referential `RESEND_API_KEY=` prefix (the prod bug)', () => {
    process.env.RESEND_API_KEY = 'RESEND_API_KEY=re_CBnAbCdEfGhIjKlMnOpQrStUvWxYz1234';
    expect(getResendApiKey()).toBe('re_CBnAbCdEfGhIjKlMnOpQrStUvWxYz1234');
  });

  it('strips surrounding quotes', () => {
    process.env.RESEND_API_KEY = '"re_CBnAbCdEfGhIjKlMnOpQrStUvWxYz1234"';
    expect(getResendApiKey()).toBe('re_CBnAbCdEfGhIjKlMnOpQrStUvWxYz1234');
  });

  it('trims whitespace and newlines', () => {
    process.env.RESEND_API_KEY = '  re_CBnAbCdEfGhIjKlMnOpQrStUvWxYz1234\n';
    expect(getResendApiKey()).toBe('re_CBnAbCdEfGhIjKlMnOpQrStUvWxYz1234');
  });

  it('recovers a key embedded after an arbitrary prefix', () => {
    process.env.RESEND_API_KEY = 'export RESEND_API_KEY=re_CBnAbCdEfGhIjKlMnOpQrStUvWxYz1234';
    expect(getResendApiKey()).toBe('re_CBnAbCdEfGhIjKlMnOpQrStUvWxYz1234');
  });

  it('returns empty string when unset', () => {
    delete process.env.RESEND_API_KEY;
    expect(getResendApiKey()).toBe('');
  });
});

describe('isEmailConfigured', () => {
  it('is true for a usable (sanitized) key', () => {
    process.env.RESEND_API_KEY = 'RESEND_API_KEY=re_CBnAbCdEfGhIjKlMnOpQrStUvWxYz1234';
    expect(isEmailConfigured()).toBe(true);
  });

  it('is false when unset', () => {
    delete process.env.RESEND_API_KEY;
    expect(isEmailConfigured()).toBe(false);
  });

  it('is false for a non-Resend garbage value', () => {
    process.env.RESEND_API_KEY = 'not-a-key';
    expect(isEmailConfigured()).toBe(false);
  });
});
