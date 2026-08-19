/**
 * THE FOOTNOTE IS A SENTENCE THE OFFICE ACTS ON.
 *
 * A blank Total in the hours column always meant one thing on paper — "‡
 * Scheduled on this job; no clock card was recorded" — and on about ten
 * production person-days that sentence was false. A card tagged to ANOTHER job
 * is skipped by attribution, and a day the board split between two jobs is
 * dropped; neither leaves a trace, so both printed as an absence. The founder
 * reads this sheet to answer "who was where and when", and "no clock card was
 * recorded" reads as "this man did not clock in" — it sends payroll chasing a
 * card that exists (Aiden 8/04: 9.89 hrs, tagged QA-2026-942182).
 *
 * These assert the RENDERED WORDS, not the flags. lib/work-ticket.test.ts
 * already covers which flag gets set; what this file protects is that the
 * printed sentence is true in all three states, and that the split case — the
 * one where a card definitely exists — says so in its own line.
 */

import { Suspense } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import WorkTicketPage from './page';
import type { TicketDay } from '@/lib/work-ticket';

jest.mock('@/lib/branding-context', () => ({
  useBranding: () => ({
    branding: {
      company_name: 'Patriot Concrete Cutting',
      primary_color: '#DC2626',
      logo_url: null,
      company_address: null,
      company_city: null,
      company_state: null,
      company_zip: null,
      support_phone: null,
      pdf_footer_text: null,
    },
  }),
}));

jest.mock('@/lib/report-error', () => ({ reportClientFailure: jest.fn() }));

const authedFetch = jest.fn();
jest.mock('@/lib/authed-fetch', () => ({
  authedFetch: (...args: unknown[]) => authedFetch(...args),
}));

const CONRADE = '81377aa2-4383-444f-a061-94036068c046';
const AIDEN = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

/** One person-day row, blank unless the test says otherwise. */
function row(over: Record<string, unknown> = {}) {
  return {
    user_id: CONRADE,
    name: 'Conrade Fair',
    role: 'lead',
    clock_in: null,
    clock_out: null,
    lunch_minutes: null,
    hours: null,
    work_items: [],
    logged_work: [],
    log_note: null,
    helper_note: null,
    ...over,
  };
}

function payload(days: TicketDay[], hours = 0) {
  return {
    job: {
      id: 'job-1',
      job_number: 'JOB-2026-521763',
      status: 'scheduled',
      customer_name: 'Pratt',
      contact_name: null,
      contact_phone: null,
      address: null,
      location: null,
      description: null,
      po_number: null,
      job_site_number: null,
      project_name: null,
      scheduled_date: '2026-08-05',
      end_date: null,
      lead_name: 'Conrade Fair',
      helper_name: null,
      signature_url: null,
      signer_name: null,
      signed_at: null,
      waiver_required: false,
      waiver_signed: false,
      waiver_signed_at: null,
      waiver_signer_name: null,
      completion_signed: false,
      parent_job: null,
      sibling_jobs: [],
    },
    mode: 'job',
    anchor_date: '2026-08-06',
    range: { from: '2026-08-05', to: '2026-08-07' },
    dates_worked: ['2026-08-05', '2026-08-06', '2026-08-07'],
    days,
    totals: { hours, standby_hours: 0, subsistence_nights: 0 },
    standby: [],
    standby_rate: 150,
    standby_minimum_hours: 2,
  };
}

async function renderTicket(days: TicketDay[], hours = 0) {
  authedFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: payload(days, hours) }),
  });
  // The page reads its route params with React 19's `use()`, which SUSPENDS
  // until the promise settles — without a boundary the render commits nothing
  // and every assertion below fails against an empty body.
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <WorkTicketPage params={Promise.resolve({ id: 'job-1' })} />
      </Suspense>
    );
  });
  // getAllBy — the job number prints twice on the sheet by design (the boxed
  // JOB ID and the "Job No." field, which falls back to it).
  await waitFor(() => expect(screen.getAllByText('JOB-2026-521763').length).toBeGreaterThan(0));
}

beforeEach(() => {
  authedFetch.mockReset();
  window.history.replaceState(null, '', '/dashboard/admin/jobs/job-1/work-ticket');
});

describe('work ticket — why a Total is blank', () => {
  it('never claims a card was not recorded — only that no hours could be tied here', async () => {
    await renderTicket([
      {
        date: '2026-08-04',
        total_hours: 0,
        // Aiden's real 8/04 shape: a 9.89-hour card exists, tagged to
        // QA-2026-942182, so nothing could be tied to THIS job.
        people: [row({ user_id: AIDEN, name: 'Aiden Rowe', role: 'operator', scheduled_only: true })],
      } as unknown as TicketDay,
    ]);

    expect(
      screen.getByText(/Scheduled on this job; no hours could be tied to it\./)
    ).toBeInTheDocument();
    expect(screen.queryByText(/no clock card was recorded/i)).not.toBeInTheDocument();
  });

  it('gives a SPLIT day its own mark and footnote', async () => {
    await renderTicket([
      {
        date: '2026-08-06',
        total_hours: 0,
        // Conrade, 8/06: 8.58 untagged hours, board had him on two jobs.
        people: [row({ hours_split: true })],
      } as unknown as TicketDay,
    ]);

    expect(screen.getByText(/Hours split across jobs that day/)).toBeInTheDocument();
    // getAllBy — the mark's own <span> and the empty Total cell wrapping it
    // both normalise to '§'.
    expect(screen.getAllByText('§').length).toBeGreaterThan(0);
    // The split row is NOT also described as unscheduled/unclocked.
    expect(screen.queryByText(/no hours could be tied to it/)).not.toBeInTheDocument();
  });

  it('prints neither footnote on an ordinary day', async () => {
    await renderTicket(
      [
        {
          date: '2026-08-07',
          total_hours: 11.18,
          people: [
            row({
              hours: 11.18,
              clock_in: '2026-08-07T11:00:00.000Z',
              clock_out: '2026-08-07T22:00:00.000Z',
            }),
          ],
        } as unknown as TicketDay,
      ],
      11.18
    );

    expect(screen.queryByText(/no hours could be tied to it/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hours split across jobs/)).not.toBeInTheDocument();
    expect(screen.queryByText(/carried no job tag/)).not.toBeInTheDocument();
  });

  it('marks the GRAND TOTAL when part of it was inferred — that is the invoiced figure', async () => {
    await renderTicket(
      [
        {
          date: '2026-08-05',
          total_hours: 10.5,
          people: [row({ hours: 10.5, hours_attributed: true })],
        } as unknown as TicketDay,
      ],
      10.5
    );

    const totalRow = screen.getByText(/Total time/).closest('tr');
    expect(totalRow?.textContent).toContain('10.50');
    expect(totalRow?.textContent).toContain('†');
    expect(
      screen.getByText(/Hours matched to this job from the schedule/)
    ).toBeInTheDocument();
  });
});
