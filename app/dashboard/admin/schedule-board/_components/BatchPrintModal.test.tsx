/**
 * Printing a dozen tickets is a LOOP, and a loop is where one bad token turns
 * into a dozen of everything: a dozen refresh attempts against the service that
 * is already struggling, a dozen rows in error_logs, and one error box
 * repeating the same sentence twelve times to someone at a printer at 6:45am.
 *
 * One cause, one message, said once.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BatchPrintModal from './BatchPrintModal';
import { supabase } from '@/lib/supabase';
import { reportClientFailure } from '@/lib/report-error';

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn(), refreshSession: jest.fn() } },
}));
jest.mock('@/lib/report-error', () => ({ reportClientFailure: jest.fn() }));
jest.mock('@/lib/auth', () => ({ getCurrentUser: () => ({ role: 'admin' }) }));

const auth = (supabase as unknown as {
  auth: { getSession: jest.Mock; refreshSession: jest.Mock };
}).auth;
const reported = reportClientFailure as jest.Mock;

/** The modal's own concurrency cap — the ceiling on anything the loop can do. */
const CONCURRENT_PRINTS = 3;

const JOBS = Array.from({ length: 12 }, (_, i) => ({
  id: `job-${i}`,
  job_number: `JOB-2026-00${i}`,
  customer_name: 'Patriot',
  job_type: 'Wall Saw',
}));

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

beforeEach(() => {
  jest.clearAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: { access_token: 'good.tok.en' } } });
  auth.refreshSession.mockResolvedValue({ data: { session: { access_token: 'fresh.tok.en' } }, error: null });
  (global.fetch as jest.Mock).mockResolvedValue(fakeRes(200));
  window.open = jest.fn(() => ({}) as Window);
  URL.createObjectURL = jest.fn(() => 'blob:x');
  URL.revokeObjectURL = jest.fn();
});

function print(onClose: () => void = () => {}) {
  render(<BatchPrintModal jobs={JOBS} onClose={onClose} />);
  fireEvent.click(screen.getByText(/Print Selected/i));
}

describe('BatchPrintModal — a dead session mid-batch', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockResolvedValue(fakeRes(401, { error: 'Unauthorized' }));
  });

  it('stops the whole batch instead of failing twelve times', async () => {
    print();

    await waitFor(() => expect(screen.getByText(/sign in again/i)).toBeInTheDocument());

    // Only the workers already in flight when the session died can have tried.
    // Nothing beyond the concurrency cap — the remaining nine jobs were never
    // attempted, because none of them was going to print either.
    expect(reported.mock.calls.length).toBeLessThanOrEqual(CONCURRENT_PRINTS);
    expect(reported.mock.calls.length).toBeGreaterThan(0);
    expect(auth.refreshSession.mock.calls.length).toBeLessThanOrEqual(CONCURRENT_PRINTS);
  });

  it('shows the sentence ONCE, not once per ticket', async () => {
    print();
    await waitFor(() => expect(screen.getByText(/sign in again/i)).toBeInTheDocument());
    // getByText throws if the same message rendered more than once, and the
    // message must not have job numbers stapled to it.
    expect(screen.queryByText(/JOB-2026-000:/)).not.toBeInTheDocument();
  });

  it('reports every failure as a session problem, with the role', async () => {
    print();
    await waitFor(() => expect(reported).toHaveBeenCalled());
    for (const [payload] of reported.mock.calls) {
      expect(payload).toMatchObject({
        type: 'print_failure',
        errorClass: 'SessionExpiredError',
        role: 'admin',
        surface: 'schedule-board:batch-print',
      });
    }
  });
});

describe('BatchPrintModal — the sign-in service is down', () => {
  it('does not tell the office to sign in again', async () => {
    // Re-authenticating hits the service that is already failing.
    (global.fetch as jest.Mock).mockResolvedValue(
      fakeRes(503, {
        code: 'auth_service_unavailable',
        error: 'We could not reach the sign-in service. Your login is fine — please try again in a moment.',
      })
    );

    print();

    await waitFor(() => expect(screen.getByText(/your login is fine/i)).toBeInTheDocument());
    expect(screen.queryByText(/sign in again/i)).not.toBeInTheDocument();
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
});

describe('BatchPrintModal — one bad ticket among good ones', () => {
  it('keeps printing the rest and names only the one that failed', async () => {
    // A per-job failure is NOT a reason to stop: the other eleven are fine.
    (global.fetch as jest.Mock).mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('job-4') ? fakeRes(500, { error: 'No scheduled date' }) : fakeRes(200)
      )
    );

    print();

    await waitFor(() => expect(screen.getByText(/Generated 11 of 12/)).toBeInTheDocument());
    expect(screen.getByText(/No scheduled date/)).toBeInTheDocument();
    expect(window.open).toHaveBeenCalledTimes(11);
    expect(reported).toHaveBeenCalledTimes(1);
  });
});

describe('BatchPrintModal — the happy path still works', () => {
  it('opens every selected ticket, logs nothing, and closes itself', async () => {
    const onClose = jest.fn();
    print(onClose);
    await waitFor(() => expect(window.open).toHaveBeenCalledTimes(12));
    expect(reported).not.toHaveBeenCalled();
    // Waiting for the self-close also drains the 500ms timer the modal sets, so
    // the suite does not leave one dangling behind it.
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
