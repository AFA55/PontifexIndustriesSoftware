import {
  currentPathForNext,
  loginHrefForPath,
  resolveLoginTarget,
  safeNextPath,
  withNext,
} from './login-redirect';

describe('safeNextPath', () => {
  it('accepts a plain app path and keeps its query string', () => {
    // The work ticket's day/week selection lives in the query — losing it would
    // return her to the ticket but not to the SHEET she was printing.
    expect(safeNextPath('/dashboard/admin/jobs/abc/work-ticket?mode=week&date=2026-08-18')).toBe(
      '/dashboard/admin/jobs/abc/work-ticket?mode=week&date=2026-08-18'
    );
    expect(safeNextPath('/dashboard/admin/jobs/abc/print')).toBe('/dashboard/admin/jobs/abc/print');
  });

  it('rejects anything that names another host', () => {
    // Each of these is a credential-phishing redirect if trusted.
    expect(safeNextPath('https://evil.example/login')).toBeNull();
    expect(safeNextPath('//evil.example/login')).toBeNull();
    expect(safeNextPath('/\\evil.example/login')).toBeNull();
    expect(safeNextPath('http://evil.example')).toBeNull();
    expect(safeNextPath('javascript:alert(1)')).toBeNull();
  });

  it('rejects a payload that only BECOMES a host after URL normalisation', () => {
    // These start with a single '/' and pass a naive input check, but URL
    // resolution collapses the '..' segments and yields '//evil.example' —
    // a protocol-relative URL. new URL('//evil.example', 'https://ours.com')
    // has origin https://evil.example, so navigating it leaves our site.
    expect(safeNextPath('/..//evil.example')).toBeNull();
    expect(safeNextPath('/x/../../..//evil.example')).toBeNull();
    expect(safeNextPath('/./\\/evil.example')).toBeNull();
  });

  it('rejects a relative path with no leading slash', () => {
    expect(safeNextPath('dashboard/admin')).toBeNull();
    expect(safeNextPath('')).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });

  it('rejects control characters smuggled into the path', () => {
    expect(safeNextPath('/dashboard\nSet-Cookie: x=1')).toBeNull();
    expect(safeNextPath('/dash\u0000board')).toBeNull();
  });

  it('refuses to point back at a login page, which would loop', () => {
    expect(safeNextPath('/login?tenant_id=abc')).toBeNull();
    expect(safeNextPath('/company-login')).toBeNull();
    // The router reaches the same page for these, so they loop the same way.
    // `/login/` in particular has no tenant_id and bounces to /company-login.
    expect(safeNextPath('/login/')).toBeNull();
    expect(safeNextPath('/Login')).toBeNull();
    expect(safeNextPath('/Company-Login/')).toBeNull();
  });
});

describe('withNext', () => {
  it('adds next with the right separator', () => {
    expect(withNext('/company-login', '/dashboard/admin')).toBe(
      '/company-login?next=%2Fdashboard%2Fadmin'
    );
    expect(withNext('/login?tenant_id=t1', '/dashboard/admin')).toBe(
      '/login?tenant_id=t1&next=%2Fdashboard%2Fadmin'
    );
  });

  it('leaves the base untouched when next is missing or unsafe', () => {
    expect(withNext('/login?tenant_id=t1', null)).toBe('/login?tenant_id=t1');
    expect(withNext('/login?tenant_id=t1', '//evil.example')).toBe('/login?tenant_id=t1');
  });

  it('encodes a query string so it survives as ONE parameter', () => {
    const href = withNext('/company-login', '/x/work-ticket?mode=week&date=2026-08-18');
    // Unencoded, the `&date=` would be parsed as a sibling param of `next`
    // and the date would be silently dropped on the way back.
    expect(href).not.toContain('&date=');
    const parsed = new URL(href, 'https://app.invalid');
    expect(parsed.searchParams.get('next')).toBe('/x/work-ticket?mode=week&date=2026-08-18');
  });
});

describe('loginHrefForPath', () => {
  it('goes to /company-login carrying the destination', () => {
    // NOT /login: /login without a tenant_id redirects to /company-login, which
    // is exactly how the old "Sign in again" button lost the destination.
    expect(loginHrefForPath('/dashboard/admin/jobs/a/work-ticket')).toBe(
      '/company-login?next=%2Fdashboard%2Fadmin%2Fjobs%2Fa%2Fwork-ticket'
    );
  });

  it('falls back to a bare /company-login when there is nothing safe to carry', () => {
    expect(loginHrefForPath(null)).toBe('/company-login');
    expect(loginHrefForPath('https://evil.example')).toBe('/company-login');
  });
});

describe('resolveLoginTarget', () => {
  it('prefers a safe next over the role landing page', () => {
    expect(resolveLoginTarget('/dashboard/admin', '/dashboard/admin/jobs/a/print')).toBe(
      '/dashboard/admin/jobs/a/print'
    );
  });

  it('falls back to the role landing page when next is absent or unsafe', () => {
    expect(resolveLoginTarget('/dashboard/admin', null)).toBe('/dashboard/admin');
    expect(resolveLoginTarget('/dashboard', '//evil.example/x')).toBe('/dashboard');
    // A `next` pointing at a login page would loop the user back to sign-in.
    expect(resolveLoginTarget('/dashboard/admin', '/login')).toBe('/dashboard/admin');
  });
});

describe('currentPathForNext', () => {
  it('returns path + query for the current location', () => {
    window.history.replaceState(null, '', '/dashboard/admin/jobs/a/work-ticket?mode=day');
    expect(currentPathForNext()).toBe('/dashboard/admin/jobs/a/work-ticket?mode=day');
  });
});
