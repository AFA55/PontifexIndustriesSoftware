/**
 * THE GATE HAS TO REMOVE THE BUTTON, NOT DECORATE IT.
 *
 * These controls were gated with the `hidden` ATTRIBUTE, which does nothing
 * here. Tailwind 3.4's preflight emits
 *
 *     [hidden]:where(:not([hidden="until-found"])) { display: none }
 *
 * at specificity (0,1,0). Every one of these buttons also carries `flex` or
 * `inline-flex` — also (0,1,0) — and `@tailwind utilities` is emitted AFTER
 * `@tailwind base` in app/globals.css. Equal specificity, later rule wins:
 * `display: flex`. The button renders, in full, and clicking it now earns a
 * hard 403 from `requireCardLevel`.
 *
 * That is the platform's signature defect pointed the other way: instead of a
 * control that looks like it worked and did nothing, a control that looks
 * available and is refused. So the test asserts ABSENCE FROM THE DOM, which no
 * amount of CSS can talk its way out of.
 *
 * Latent today only because Amanda is the sole active `admin`. The second one
 * makes it real.
 */

import { render, screen, waitFor } from '@testing-library/react';
import AdminTimecardsPage from './page';

const push = jest.fn();
// The router object must be STABLE across renders: the page's auth guard lists
// it in a dependency array and calls setUser() inside, so a fresh object per
// render is an infinite loop in the test rather than a finding about the page.
const routerStub = { push, replace: push, refresh: jest.fn(), back: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => routerStub,
  useSearchParams: () => new URLSearchParams(),
}));

const mockUseMyCardPermissions = jest.fn();
jest.mock('@/lib/use-card-permissions', () => ({
  useMyCardPermissions: () => mockUseMyCardPermissions(),
}));

jest.mock('@/lib/auth', () => ({
  getCurrentUser: () => ({ id: 'amanda', role: 'admin', full_name: 'Amanda McClelland' }),
  isAdmin: () => true,
}));

jest.mock('@/lib/feature-flags', () => ({
  useFeatureFlags: () => ({ flags: {}, loading: false }),
}));

jest.mock('@/components/ModuleGuard', () => ({
  useModuleGate: () => ({ allowed: true, loading: false }),
}));

const selectChain = {
  select: () => selectChain,
  eq: () => selectChain,
  order: () => selectChain,
  limit: () => selectChain,
  maybeSingle: async () => ({ data: null, error: null }),
  single: async () => ({ data: null, error: null }),
  then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r),
};

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'a.b.c' } }, error: null }),
    },
    from: () => selectChain,
  },
}));

/** The page renders one cell per day and reads `.status` off each. */
const DAILY_HOURS = Object.fromEntries(
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => [
    d,
    { hours: d === 'Sat' || d === 'Sun' ? 0 : 8, status: 'pending', entryCount: 1 },
  ])
);

/**
 * One member with pending work — every gated control has something to act on,
 * so nothing can be absent merely because there was nothing to do.
 */
const TEAM_SUMMARY = {
  success: true,
  data: {
    subsistenceRate: 0,
    totals: {
      totalPayrollHours: 40, totalRegularHours: 40, totalOvertimeHours: 0,
      totalBreakMinutes: 0, activeClockins: 1, pendingApprovals: 14,
      lateArrivalsThisWeek: 0,
    },
    teamMembers: [{
      userId: 'op-1',
      fullName: 'Javier Ruiz',
      email: 'javier@patriot.test',
      role: 'operator',
      avatarUrl: null,
      dailyHours: DAILY_HOURS,
      weeklyTotal: 40, regularHours: 40, overtimeHours: 0, breakMinutesTotal: 0,
      pendingCount: 3, approvedCount: 0, totalEntries: 5,
      isClockedIn: false, hasNoEntries: false, status: 'has_pending',
      subsistenceNights: 0, subsistencePay: 0,
    }],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  (global.fetch as jest.Mock) = jest.fn(async (url: string) => {
    if (String(url).includes('team-summary')) {
      return { ok: true, status: 200, json: async () => TEAM_SUMMARY } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { requests: [] } }),
    } as unknown as Response;
  });
});

function renderWith(permissions: Record<string, string> | null) {
  mockUseMyCardPermissions.mockReturnValue({
    permissions,
    role: 'admin',
    loading: false,
    error: false,
    reload: jest.fn(),
  });
  return render(<AdminTimecardsPage />);
}

/** Every payroll control on this page, by the words the office would look for. */
const PAYROLL_CONTROLS = [
  /Approve All Pending/i,
  /No-Show/i,
];

describe('timecards page — an admin WITHOUT timecards:full', () => {
  it('is offered no payroll control at all — not hidden, ABSENT', async () => {
    // No override row → the `admin` role preset applies, which is
    // `timecards: 'view'`. She may read payroll; she may not sign it off.
    renderWith(null);

    await waitFor(() => expect(screen.getAllByText(/Javier Ruiz/).length).toBeGreaterThan(0));

    // queryAllByText, not queryByText: several of these render twice (desktop
    // table + mobile card), and a "found multiple elements" throw would hide
    // the very thing being asserted.
    for (const control of PAYROLL_CONTROLS) {
      expect(screen.queryAllByText(control)).toHaveLength(0);
    }
    // Approving one person's week is offered from the row; it must be gone too.
    expect(screen.queryAllByText(/^Approve$/)).toHaveLength(0);
  });

  it('still gets the read-only page — the gate removes actions, not access', async () => {
    renderWith(null);

    await waitFor(() => expect(screen.getAllByText(/Javier Ruiz/).length).toBeGreaterThan(0));
    // Export is not a payroll decision; a view-level admin keeps it.
    expect(screen.getAllByText(/Export Week PDF/i).length).toBeGreaterThan(0);
    expect(push).not.toHaveBeenCalledWith('/dashboard');
  });
});

describe('timecards page — the same admin WITH the per-user grant', () => {
  it('gets the controls back, which is the whole point of the override', async () => {
    // The row Team Management writes for Amanda. Her ROLE still says 'view';
    // only the per-user override moves her, which is the layer that used to be
    // read from nowhere.
    renderWith({ timecards: 'full' });

    await waitFor(() => expect(screen.getAllByText(/Javier Ruiz/).length).toBeGreaterThan(0));

    expect(screen.getAllByText(/Approve All Pending \(14\)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/No-Show/i).length).toBeGreaterThan(0);
  });

  it('a grant on a DIFFERENT card does not open this one', async () => {
    renderWith({ billing: 'full' });

    await waitFor(() => expect(screen.getAllByText(/Javier Ruiz/).length).toBeGreaterThan(0));
    expect(screen.queryAllByText(/Approve All Pending/i)).toHaveLength(0);
  });

  it('an override BELOW full is not enough', async () => {
    renderWith({ timecards: 'view' });

    await waitFor(() => expect(screen.getAllByText(/Javier Ruiz/).length).toBeGreaterThan(0));
    expect(screen.queryAllByText(/Approve All Pending/i)).toHaveLength(0);
  });
});

describe('timecards page — permissions could not be read', () => {
  it('says so, instead of quietly removing the buttons', async () => {
    mockUseMyCardPermissions.mockReturnValue({
      permissions: null,
      role: 'admin',
      loading: false,
      error: true,
      reload: jest.fn(),
    });
    render(<AdminTimecardsPage />);

    await waitFor(() => expect(screen.getAllByText(/Javier Ruiz/).length).toBeGreaterThan(0));

    // Fail closed AND explain. A page that looks completely normal with the
    // payroll controls missing is the failure this banner exists to prevent.
    expect(screen.getAllByText(/could not load your permissions/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Try again/i).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Approve All Pending/i)).toHaveLength(0);
  });

  it('does not eject the user from the page over a failed read', async () => {
    mockUseMyCardPermissions.mockReturnValue({
      permissions: null, role: 'admin', loading: false, error: true, reload: jest.fn(),
    });
    render(<AdminTimecardsPage />);

    await waitFor(() => expect(screen.getAllByText(/Javier Ruiz/).length).toBeGreaterThan(0));
    expect(push).not.toHaveBeenCalledWith('/dashboard');
  });
});
