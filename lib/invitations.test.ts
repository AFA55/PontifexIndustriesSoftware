/**
 * Tests for resolveOrigin() + buildSetupUrl() — the URL pipeline behind every
 * emailed setup/reset link.
 *
 * Written after the production incident where `NEXT_PUBLIC_APP_URL` contained
 * an OLD dead project URL with TWO TRAILING SPACES. The spaces leaked into the
 * setup link, so the email clients didn't render it as a hyperlink and the
 * copied URL pointed at the wrong site. These tests define the contract:
 *
 *   1. env value is trimmed (the incident) and trailing slashes stripped
 *   2. unset/empty/garbage env → fall through to the request origin
 *   3. garbage/null request origin too → final hardcoded prod fallback
 *   4. buildSetupUrl output is exactly `<origin>/setup-account?token=<token>`,
 *      whitespace-free, and parseable by `new URL()`
 */

import { resolveOrigin, buildSetupUrl } from './invitations';

const PROD_FALLBACK = 'https://www.pontifexindustries.com';

const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

beforeEach(() => {
  // Start every test from a known-clean slate (next/jest loads .env files,
  // so the var may be set in the test process).
  delete process.env.NEXT_PUBLIC_APP_URL;
});

afterEach(() => {
  if (ORIGINAL_APP_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
});

describe('resolveOrigin', () => {
  describe('env value sanitization', () => {
    it('passes a clean env origin through untouched', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://www.pontifexindustries.com';
      expect(resolveOrigin()).toBe('https://www.pontifexindustries.com');
    });

    it('trims trailing spaces from the env value (THE incident)', () => {
      // Exact shape of the production incident: dead URL + two trailing spaces.
      process.env.NEXT_PUBLIC_APP_URL = 'https://pontifex-platform-old.vercel.app  ';
      expect(resolveOrigin()).toBe('https://pontifex-platform-old.vercel.app');
    });

    it('trims leading and trailing whitespace including newlines', () => {
      process.env.NEXT_PUBLIC_APP_URL = ' \thttps://www.pontifexindustries.com \n';
      expect(resolveOrigin()).toBe('https://www.pontifexindustries.com');
    });

    it('strips a trailing slash', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://www.pontifexindustries.com/';
      expect(resolveOrigin()).toBe('https://www.pontifexindustries.com');
    });

    it('strips multiple trailing slashes', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://www.pontifexindustries.com//';
      expect(resolveOrigin()).toBe('https://www.pontifexindustries.com');
    });

    it('handles trailing spaces AND a trailing slash together', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://www.pontifexindustries.com/  ';
      expect(resolveOrigin()).toBe('https://www.pontifexindustries.com');
    });

    it('never returns a value containing whitespace, regardless of env shape', () => {
      const dirtyValues = [
        'https://www.pontifexindustries.com  ',
        '  https://www.pontifexindustries.com',
        'https://www.pontifexindustries.com\n',
        'not a url',
        '   ',
      ];
      for (const dirty of dirtyValues) {
        process.env.NEXT_PUBLIC_APP_URL = dirty;
        expect(resolveOrigin('https://preview.vercel.app')).not.toMatch(/\s/);
      }
    });
  });

  describe('fallthrough to request origin', () => {
    it('falls back to a valid requestOrigin when env is unset', () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      expect(resolveOrigin('https://preview.vercel.app')).toBe('https://preview.vercel.app');
    });

    it('falls back to requestOrigin when env is an empty string', () => {
      process.env.NEXT_PUBLIC_APP_URL = '';
      expect(resolveOrigin('https://preview.vercel.app')).toBe('https://preview.vercel.app');
    });

    it('falls back to requestOrigin when env is whitespace-only', () => {
      process.env.NEXT_PUBLIC_APP_URL = '   ';
      expect(resolveOrigin('https://preview.vercel.app')).toBe('https://preview.vercel.app');
    });

    it('skips a garbage (non-URL) env value and uses requestOrigin', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'not a url';
      expect(resolveOrigin('https://preview.vercel.app')).toBe('https://preview.vercel.app');
    });

    it('prefers a valid env value over the requestOrigin', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://www.pontifexindustries.com';
      expect(resolveOrigin('https://preview.vercel.app')).toBe(
        'https://www.pontifexindustries.com'
      );
    });
  });

  describe('final production fallback', () => {
    it('returns the prod origin when env is unset and requestOrigin is null', () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      expect(resolveOrigin(null)).toBe(PROD_FALLBACK);
    });

    it('returns the prod origin when env is unset and requestOrigin is omitted', () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      expect(resolveOrigin()).toBe(PROD_FALLBACK);
    });

    it('returns the prod origin when BOTH env and requestOrigin are garbage', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'not a url';
      expect(resolveOrigin('also not a url')).toBe(PROD_FALLBACK);
    });

    it('returns the prod origin when env is whitespace and requestOrigin is empty', () => {
      process.env.NEXT_PUBLIC_APP_URL = '   ';
      expect(resolveOrigin('')).toBe(PROD_FALLBACK);
    });

    it('always returns a parseable URL no matter how broken the inputs are', () => {
      const cases: Array<[string | undefined, string | null | undefined]> = [
        [undefined, undefined],
        [undefined, null],
        ['', ''],
        ['   ', 'garbage'],
        ['not a url', null],
        ['https://pontifex-platform-old.vercel.app  ', undefined],
      ];
      for (const [env, reqOrigin] of cases) {
        if (env === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
        else process.env.NEXT_PUBLIC_APP_URL = env;
        const origin = resolveOrigin(reqOrigin);
        expect(() => new URL(origin)).not.toThrow();
      }
    });
  });
});

describe('buildSetupUrl', () => {
  // Realistic token: newToken() = randomBytes(32).toString('base64url') = 43 chars.
  const TOKEN = 'k7fQ2zX9mP4rT1wY8sLbV3nJ6hD5gC0aE_uIoZqRx-N';

  it('uses a realistic 43-char base64url token', () => {
    expect(TOKEN).toHaveLength(43);
    expect(TOKEN).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces exactly <origin>/setup-account?token=<token>', () => {
    expect(buildSetupUrl('https://www.pontifexindustries.com', TOKEN)).toBe(
      `https://www.pontifexindustries.com/setup-account?token=${TOKEN}`
    );
  });

  it('contains no whitespace anywhere', () => {
    const url = buildSetupUrl('https://www.pontifexindustries.com', TOKEN);
    expect(url).not.toMatch(/\s/);
  });

  it('is parseable by new URL() with the token intact', () => {
    const url = new URL(buildSetupUrl('https://www.pontifexindustries.com', TOKEN));
    expect(url.origin).toBe('https://www.pontifexindustries.com');
    expect(url.pathname).toBe('/setup-account');
    expect(url.searchParams.get('token')).toBe(TOKEN);
  });

  it('end-to-end: resolveOrigin(dirty env) + buildSetupUrl yields a clean, parseable link', () => {
    // The full incident path: dirty env var → origin → emailed setup link.
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.pontifexindustries.com  ';
    const url = buildSetupUrl(resolveOrigin(null), TOKEN);

    expect(url).toBe(`https://www.pontifexindustries.com/setup-account?token=${TOKEN}`);
    expect(url).not.toMatch(/\s/);
    expect(url).not.toContain('%20');
    expect(() => new URL(url)).not.toThrow();
    expect(new URL(url).searchParams.get('token')).toBe(TOKEN);
  });
});
