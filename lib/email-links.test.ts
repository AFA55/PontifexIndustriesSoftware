/**
 * Email template link-integrity tests for generateInviteEmail() and
 * generatePasswordResetEmail() from lib/email.ts.
 *
 * Written after the production incident where `NEXT_PUBLIC_APP_URL` carried
 * two trailing spaces — every emailed setup link was whitespace-corrupted, so
 * clients didn't render it as a hyperlink and the copied URL hit the wrong
 * site. These tests assert that whatever URL is passed into the templates
 * comes out as a clean, whitespace-free, parseable `<a href>`.
 *
 * Both generators are now async (react-email render) — every call is awaited.
 */

import { generateInviteEmail, generatePasswordResetEmail } from './email';

/** Extract every <a href="..."> value from the HTML (simple regex, no DOM lib). */
function extractHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const re = /<a\s[^>]*href="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    hrefs.push(match[1]);
  }
  return hrefs;
}

/** Decode the HTML entities the templates' escapeHtml() can introduce. */
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Realistic token: newToken() = randomBytes(32).toString('base64url') = 43 chars.
const TOKEN = 'k7fQ2zX9mP4rT1wY8sLbV3nJ6hD5gC0aE_uIoZqRx-N';
const SETUP_URL = `https://www.pontifexindustries.com/setup-account?token=${TOKEN}`;

const REALISTIC_OPTS = {
  inviteeName: 'Jane Operator',
  inviterName: 'Andres Altamirano',
  tenantName: 'Patriot Concrete Cutting',
  roleLabel: 'Operator',
  companyCode: 'PATRIOT',
  setupUrl: SETUP_URL,
};

describe('generateInviteEmail link integrity', () => {
  it('renders a CTA <a> whose href equals the setupUrl passed in', async () => {
    const html = await generateInviteEmail(REALISTIC_OPTS);
    const hrefs = extractHrefs(html).map(decodeEntities);

    expect(hrefs.length).toBeGreaterThanOrEqual(1);
    expect(hrefs).toContain(SETUP_URL);
  });

  it('renders the raw fallback link as an <a> with the SAME href as the CTA', async () => {
    const html = await generateInviteEmail(REALISTIC_OPTS);
    const setupHrefs = extractHrefs(html)
      .map(decodeEntities)
      .filter((href) => href === SETUP_URL);

    // CTA button + "Button not working?" fallback = at least two anchors.
    expect(setupHrefs.length).toBeGreaterThanOrEqual(2);
  });

  it('shows the full URL as visible text in the fallback (copyable)', async () => {
    const html = await generateInviteEmail(REALISTIC_OPTS);
    // The fallback anchor's inner text is the URL itself: <a href="...">URL</a>
    const re = /<a\s[^>]*href="([^"]*)"[^>]*>\s*([^<]*?)\s*<\/a>/g;
    let match: RegExpExecArray | null;
    let found = false;
    while ((match = re.exec(html)) !== null) {
      if (decodeEntities(match[2]) === SETUP_URL) found = true;
    }
    expect(found).toBe(true);
  });

  it('hrefs contain no whitespace, newlines, or double spaces', async () => {
    const html = await generateInviteEmail(REALISTIC_OPTS);
    for (const href of extractHrefs(html)) {
      expect(href).not.toMatch(/\s/); // covers spaces, \n, \t — and thus '  '
      expect(decodeEntities(href)).not.toMatch(/\s/);
    }
  });

  it('every href parses with new URL()', async () => {
    const html = await generateInviteEmail(REALISTIC_OPTS);
    for (const href of extractHrefs(html).map(decodeEntities)) {
      expect(() => new URL(href)).not.toThrow();
    }
  });

  it('a 43-char base64url token survives the template intact', async () => {
    expect(TOKEN).toHaveLength(43);
    const html = await generateInviteEmail(REALISTIC_OPTS);
    const setupHref = extractHrefs(html)
      .map(decodeEntities)
      .find((href) => href.includes('/setup-account'));

    expect(setupHref).toBeDefined();
    expect(new URL(setupHref as string).searchParams.get('token')).toBe(TOKEN);
  });

  it('survives a setupUrl with an extra query param (&amp; entity decodes back)', async () => {
    const urlWithParam = `${SETUP_URL}&source=invite`;
    const html = await generateInviteEmail({ ...REALISTIC_OPTS, setupUrl: urlWithParam });
    const hrefs = extractHrefs(html).map(decodeEntities);

    expect(hrefs).toContain(urlWithParam);
  });

  it('never contains the literal strings "undefined" or "null" with realistic opts', async () => {
    const html = await generateInviteEmail(REALISTIC_OPTS);
    expect(html).not.toMatch(/\bundefined\b/);
    expect(html).not.toMatch(/\bnull\b/);
  });

  it('never contains "undefined"/"null" when optional companyCode is omitted', async () => {
    const { companyCode: _omitted, ...optsWithoutCode } = REALISTIC_OPTS;
    const html = await generateInviteEmail(optsWithoutCode);
    expect(html).not.toMatch(/\bundefined\b/);
    expect(html).not.toMatch(/\bnull\b/);
  });
});

describe('generatePasswordResetEmail link integrity', () => {
  const RESET_LINK = `https://www.pontifexindustries.com/reset-password?token=${TOKEN}`;

  it('renders a CTA <a> whose href equals the resetLink passed in', async () => {
    const html = await generatePasswordResetEmail('Jane Operator', RESET_LINK);
    const hrefs = extractHrefs(html).map(decodeEntities);

    expect(hrefs.length).toBeGreaterThanOrEqual(1);
    expect(hrefs).toContain(RESET_LINK);
  });

  it('hrefs contain no whitespace, newlines, or double spaces', async () => {
    const html = await generatePasswordResetEmail('Jane Operator', RESET_LINK);
    for (const href of extractHrefs(html)) {
      expect(href).not.toMatch(/\s/);
      expect(decodeEntities(href)).not.toMatch(/\s/);
    }
  });

  it('every href parses with new URL() and the token survives intact', async () => {
    const html = await generatePasswordResetEmail('Jane Operator', RESET_LINK);
    const hrefs = extractHrefs(html).map(decodeEntities);

    for (const href of hrefs) {
      expect(() => new URL(href)).not.toThrow();
    }
    const resetHref = hrefs.find((href) => href.includes('/reset-password'));
    expect(resetHref).toBeDefined();
    expect(new URL(resetHref as string).searchParams.get('token')).toBe(TOKEN);
  });

  it('never contains the literal strings "undefined" or "null" with realistic args', async () => {
    const html = await generatePasswordResetEmail('Jane Operator', RESET_LINK);
    expect(html).not.toMatch(/\bundefined\b/);
    expect(html).not.toMatch(/\bnull\b/);
  });
});
