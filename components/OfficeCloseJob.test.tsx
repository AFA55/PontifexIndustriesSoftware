/**
 * The control that gets the founder's stuck jobs off the schedule.
 *
 * It now renders on five surfaces, so the two things that must not drift are
 * pinned here rather than trusted to each host:
 *
 *   1. THE REASON IS MANDATORY. The office is asserting that a job finished
 *      which the app never saw finish; a close with no explanation is
 *      indistinguishable from a job that was lost. The submit stays disabled
 *      until somebody has actually typed (or picked) something.
 *   2. IT HIDES ON A JOB THE OPERATOR CLOSED HIMSELF. A second "mark complete"
 *      on a properly-signed job is a false affordance.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OfficeCloseJob from './OfficeCloseJob';

const fetchMock = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'test-token' } } }),
    },
  },
}));

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  global.fetch = fetchMock as unknown as typeof fetch;
});

const CLOSED_AT = '2026-08-17T14:00:00Z';

describe('a job nobody ever closed', () => {
  it('offers the close, and refuses to send one without a reason', async () => {
    const user = userEvent.setup();
    render(<OfficeCloseJob jobId="job-1" jobNumber="JOB-2026-793440" customerName="BWC" />);

    await user.click(screen.getByRole('button', { name: /mark complete \(office\)/i }));

    const submit = screen.getByRole('button', { name: /close the job/i });
    expect(submit).toBeDisabled();

    // Whitespace is not a reason.
    await user.type(screen.getByRole('textbox'), '   ');
    expect(submit).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('carries the founder\'s print-only preset straight into the reason', async () => {
    const user = userEvent.setup();
    const onChanged = jest.fn();
    render(<OfficeCloseJob jobId="job-1" jobNumber="JOB-2026-793440" onChanged={onChanged} />);

    await user.click(screen.getByRole('button', { name: /mark complete \(office\)/i }));
    await user.click(
      screen.getByRole('button', { name: /print-only ticket/i })
    );

    const submit = screen.getByRole('button', { name: /close the job/i });
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/jobs/job-1/office-complete');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).reason).toMatch(/print-only/i);
    expect(onChanged).toHaveBeenCalled();
  });

  it('surfaces a refusal instead of pretending the job closed', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Only office staff, an operations manager or a supervisor can close a job this way.' }),
    });
    const user = userEvent.setup();
    const onChanged = jest.fn();
    render(<OfficeCloseJob jobId="job-1" onChanged={onChanged} />);

    await user.click(screen.getByRole('button', { name: /mark complete \(office\)/i }));
    await user.type(screen.getByRole('textbox'), 'Finished on site');
    await user.click(screen.getByRole('button', { name: /close the job/i }));

    expect(await screen.findByText(/only office staff/i)).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('a job the operator signed off himself', () => {
  it('draws nothing at all — his close is the real one', () => {
    const { container } = render(
      <OfficeCloseJob jobId="job-2" operatorCompletedAt={CLOSED_AT} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('a job the office already closed', () => {
  it('shows who said what, and the way back out', async () => {
    const user = userEvent.setup();
    render(
      <OfficeCloseJob
        jobId="job-3"
        officeCompletedAt={CLOSED_AT}
        officeCompletedReason="Ticket was entered for printing only; no crew was dispatched"
      />
    );

    expect(screen.getByText(/closed by the office/i)).toBeInTheDocument();
    expect(screen.getByText(/printing only/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reopen this job/i }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/jobs/job-3/office-complete');
    expect(init.method).toBe('DELETE');
  });
});
