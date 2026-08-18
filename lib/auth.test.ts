/**
 * The stale-cache guard, and the storage it actually has to look in.
 *
 * `lib/supabase.ts` routes the Supabase session through `rememberAwareStorage`,
 * which writes to sessionStorage unless "Remember me" was ticked — and the flag
 * defaults to OFF. So sessionStorage is where MOST sessions live, and every
 * `sb-*-auth-token` sweep in lib/auth.ts used to look only in localStorage:
 * the guard scanned an empty set, found nothing to disagree with, and returned
 * the cached profile unvalidated. These tests pin the sessionStorage case
 * first, because that is the one that was broken in production.
 */

const AMANDA = '56e1c6ae-fa46-4058-9b85-a34c400d2d10';
const SOMEONE_ELSE = '11111111-2222-3333-4444-555555555555';
const TOKEN_KEY = 'sb-klatddoyncxidgqtcjnu-auth-token';

const cachedProfile = (id: string) =>
  JSON.stringify({ id, name: 'Amanda McClelland', email: 'office@example.com', role: 'admin' });

const storedSession = (id: string) =>
  JSON.stringify({ access_token: 'header.payload.signature', user: { id } });

const signOutMock = jest.fn().mockResolvedValue({ error: null });

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut: (...args: unknown[]) => signOutMock(...args) } },
}));

jest.mock('@/lib/biometric', () => ({
  hasEnrolledBiometric: jest.fn().mockResolvedValue(false),
  disableBiometric: jest.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCurrentUser, logout } = require('./auth') as typeof import('./auth');

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  signOutMock.mockClear();
  signOutMock.mockResolvedValue({ error: null });
});

describe('getCurrentUser — stale cache guard', () => {
  it('fires when the live session is in sessionStorage (remember-me OFF)', () => {
    // The reachable production scenario: two people share an office machine.
    // `supabase-user` is in localStorage and therefore SHARED across tabs; the
    // session is per-tab in sessionStorage. Without this check the tab renders
    // the cached person's name, role and nav beside the live user's session.
    localStorage.setItem('supabase-user', cachedProfile(SOMEONE_ELSE));
    sessionStorage.setItem(TOKEN_KEY, storedSession(AMANDA));

    expect(getCurrentUser()).toBeNull();
    // …but the blob STAYS. It belongs to whichever tab wrote it last, and that
    // tab's session is per-tab in sessionStorage. Deleting it from here logs out
    // the OTHER person: his getCurrentUser() would return null, his page guard
    // would bounce him to /login, and auto-resume reads the blob we just erased,
    // so he retypes his password. Returning null is the whole display fix.
    expect(localStorage.getItem('supabase-user')).not.toBeNull();
  });

  it('returns the cached user when the sessionStorage session agrees', () => {
    localStorage.setItem('supabase-user', cachedProfile(AMANDA));
    sessionStorage.setItem(TOKEN_KEY, storedSession(AMANDA));

    expect(getCurrentUser()?.id).toBe(AMANDA);
    expect(localStorage.getItem('supabase-user')).not.toBeNull();
  });

  it('still fires when the session is in localStorage (remember-me ON)', () => {
    localStorage.setItem('supabase-user', cachedProfile(SOMEONE_ELSE));
    localStorage.setItem(TOKEN_KEY, storedSession(AMANDA));

    expect(getCurrentUser()).toBeNull();
  });

  it('catches a mismatch in EITHER store when both hold a session', () => {
    // A leftover from a remember-me-on era sitting beside a current per-tab
    // session. Disagreement in either one is enough to distrust the cache.
    localStorage.setItem('supabase-user', cachedProfile(AMANDA));
    sessionStorage.setItem(TOKEN_KEY, storedSession(AMANDA));
    localStorage.setItem(TOKEN_KEY, storedSession(SOMEONE_ELSE));

    expect(getCurrentUser()).toBeNull();
  });

  it('fails closed when a session blob cannot be parsed', () => {
    localStorage.setItem('supabase-user', cachedProfile(AMANDA));
    sessionStorage.setItem(TOKEN_KEY, '{not json');

    expect(getCurrentUser()).toBeNull();
    expect(localStorage.getItem('supabase-user')).toBeNull();
  });

  it('ignores keys that are not a Supabase session', () => {
    localStorage.setItem('supabase-user', cachedProfile(AMANDA));
    sessionStorage.setItem('sb-something-else', '{not json');
    sessionStorage.setItem('branding-abc', '{not json');

    expect(getCurrentUser()?.id).toBe(AMANDA);
  });

  it('returns null when there is no cached profile at all', () => {
    sessionStorage.setItem(TOKEN_KEY, storedSession(AMANDA));
    expect(getCurrentUser()).toBeNull();
  });
});

describe('logout', () => {
  it('clears the session from sessionStorage, not just localStorage', async () => {
    localStorage.setItem('supabase-user', cachedProfile(AMANDA));
    sessionStorage.setItem(TOKEN_KEY, storedSession(AMANDA));

    await logout();

    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem('supabase-user')).toBeNull();
  });

  it('still clears the local session when signOut fails on the network', async () => {
    // The defect: signOut's error was swallowed and the only teardown swept
    // localStorage, so a failed round trip left a LIVE sessionStorage session
    // on the machine of someone who pressed Log out.
    signOutMock.mockRejectedValue(new Error('Failed to fetch'));
    localStorage.setItem('supabase-user', cachedProfile(AMANDA));
    sessionStorage.setItem(TOKEN_KEY, storedSession(AMANDA));

    await expect(logout()).resolves.toBeUndefined();

    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem('supabase-user')).toBeNull();
  });

  it('preserves the deliberately-kept keys', async () => {
    localStorage.setItem('pontifex.rememberMe', 'true');
    localStorage.setItem('pontifex.lastCompany', '{"tenantId":"t1","name":"Patriot"}');
    sessionStorage.setItem(TOKEN_KEY, storedSession(AMANDA));

    await logout();

    expect(localStorage.getItem('pontifex.rememberMe')).toBe('true');
    expect(localStorage.getItem('pontifex.lastCompany')).not.toBeNull();
  });
});
