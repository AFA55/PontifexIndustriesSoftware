/**
 * THE FOLDER THAT WOULD HAVE CAUGHT LEIFENG.
 *
 * A parked job's failure mode is silence: JOB-2026-400368 sat ten days and
 * appeared nowhere, and on the day this shipped production held five more, the
 * oldest twenty-three days. So the things worth pinning here are the things
 * whose absence is invisible — the age chip, its escalating colour, the reason,
 * and the fact that a control the office can actually press is at least 44px
 * tall, because these get pressed on a phone in a truck.
 *
 * The real production rows and the parked/not-parked predicate are pinned in
 * `lib/parked-board.test.ts`; this file is about what reaches the screen.
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ParkedFolder from './ParkedFolder';
import type { JobCardData } from './JobCard';

/**
 * RESTART DATES ARE RELATIVE TO TODAY, NOT TYPED INTO THE FILE.
 *
 * These were `'2026-08-21'` / `'2026-08-24'`, and on 2026-08-22 the suite began
 * failing with no code change: the restart modal refuses a start date in the
 * past (a backwards restart silently reattributes already-billed hours to a
 * scope that did not exist that day — the HIGH finding this modal's guard came
 * from), so yesterday's literal disabled the submit and `onRestart` was never
 * called.
 *
 * Second date fixture in this codebase to rot overnight. A test that fails by
 * calendar rather than by defect trains people to ignore a red suite, which is
 * the one thing a guard like this cannot survive.
 */
const ymd = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};
const RESTART_ON = ymd(0);
const RESTART_THROUGH = ymd(3);
const BEFORE_RESTART = ymd(-2);

const base: JobCardData = {
  id: 'x',
  job_number: 'JOB-2026-000000',
  customer_name: 'Someone',
  job_type: 'Slab Sawing',
  location: '',
  address: '',
  equipment_needed: [],
  description: null,
  scheduled_date: '2026-08-10',
  end_date: null,
  arrival_time: null,
  is_will_call: false,
  difficulty_rating: null,
  notes_count: 0,
  change_requests_count: 0,
  helper_names: [],
  po_number: null,
};

/** Pinnacle Contracting — the oldest thing in production, 23 days on Aug 20. */
const PINNACLE: JobCardData = {
  ...base,
  id: 'pinnacle',
  job_number: 'JOB-2026-815303',
  customer_name: 'Pinnacle Contracting',
  on_hold: true,
  on_hold_placed_at: '2026-07-28T12:05:41.409Z',
  on_hold_released_at: null,
  on_hold_reason: "Moved to Pending — contractor hasn't set a firm date",
  total_days_worked: 1,
  days_parked: 23,
};

/** Yellowstone — parked yesterday, before anyone got a day on it. */
const YELLOWSTONE: JobCardData = {
  ...base,
  id: 'yellowstone',
  job_number: 'JOB-2026-630612',
  customer_name: 'Yellowstone Landscape',
  project_name: '5 Cutler Way, Greenville, SC',
  on_hold: true,
  on_hold_placed_at: '2026-08-20T01:15:43.886Z',
  on_hold_released_at: null,
  on_hold_reason: 'Parked — contractor hasn’t set a new date',
  total_days_worked: 0,
  days_parked: 1,
};

const noop = async () => true;

function cardFor(jobNumber: string): HTMLElement {
  const numberEl = screen.getByText(jobNumber);
  const card = numberEl.closest('div.rounded-xl');
  if (!card) throw new Error(`no card for ${jobNumber}`);
  return card as HTMLElement;
}

describe('ParkedFolder', () => {
  it('says how long each job has been sitting', () => {
    render(<ParkedFolder parkedJobs={[PINNACLE, YELLOWSTONE]} canRestart onRestart={noop} />);
    expect(screen.getByText('23 days parked')).toBeInTheDocument();
    expect(screen.getByText('1 day parked')).toBeInTheDocument();
  });

  it('shouts louder about 23 days than about 1', () => {
    render(<ParkedFolder parkedJobs={[PINNACLE, YELLOWSTONE]} canRestart onRestart={noop} />);
    expect(screen.getByText('23 days parked').className).toContain('bg-red-600');
    expect(screen.getByText('1 day parked').className).toContain('bg-gray-100');
  });

  it('prints the reason, the project and what the job already cost', () => {
    render(<ParkedFolder parkedJobs={[PINNACLE, YELLOWSTONE]} canRestart onRestart={noop} />);
    expect(screen.getByText(/contractor hasn't set a firm date/)).toBeInTheDocument();
    expect(screen.getByText('5 Cutler Way, Greenville, SC')).toBeInTheDocument();
    expect(screen.getByText('1 day worked so far')).toBeInTheDocument();
    // Yellowstone has zero proven days — say nothing rather than "0 days worked".
    expect(screen.queryByText(/0 days worked/)).not.toBeInTheDocument();
  });

  it('renders NOTHING rather than "NaN days" before the migration lands', () => {
    // A row from `schedule_board_view` as it is today: no on_hold columns at all.
    const legacy = { ...base, id: 'legacy', job_number: 'JOB-2026-111111' };
    render(<ParkedFolder parkedJobs={[legacy]} canRestart onRestart={noop} />);
    expect(screen.getByText('JOB-2026-111111')).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.queryByText(/parked$/)).not.toBeInTheDocument();
  });

  it('tells the office the folder is empty instead of showing a blank panel', () => {
    render(<ParkedFolder parkedJobs={[]} canRestart onRestart={noop} />);
    expect(screen.getByText('Nothing parked')).toBeInTheDocument();
    expect(screen.getByText('0 jobs')).toBeInTheDocument();
  });

  // ── Tap targets. Operators and office staff press these on a phone. ───────
  it('gives every control at least 44px of height', () => {
    render(<ParkedFolder parkedJobs={[PINNACLE]} canRestart onRestart={noop} />);
    const card = cardFor('JOB-2026-815303');
    const restart = within(card).getByRole('button', { name: /restart/i });
    const view = within(card).getByRole('link', { name: /view JOB-2026-815303/i });
    expect(restart.className).toContain('min-h-[44px]');
    expect(view.className).toContain('min-h-[44px]');
    expect(view.className).toContain('min-w-[44px]');
  });

  // ── Role gating: only the roles that can already park a job. ──────────────
  it('hides Restart from anyone who cannot use it, and still lets them look', () => {
    render(<ParkedFolder parkedJobs={[PINNACLE]} canRestart={false} onRestart={noop} />);
    expect(screen.queryByRole('button', { name: /restart/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view JOB-2026-815303/i })).toBeInTheDocument();
  });

  // ── Restart ──────────────────────────────────────────────────────────────
  it('will not submit a restart with no scope', () => {
    const onRestart = jest.fn(async () => true);
    render(<ParkedFolder parkedJobs={[PINNACLE]} canRestart onRestart={onRestart} />);
    fireEvent.click(within(cardFor('JOB-2026-815303')).getByRole('button', { name: /restart/i }));

    const submit = screen.getByRole('button', { name: /restart job/i });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(onRestart).not.toHaveBeenCalled();
  });

  it('sends bare YYYY-MM-DD dates and the new scope, and keeps the job number', async () => {
    const onRestart = jest.fn(async () => true);
    render(<ParkedFolder parkedJobs={[PINNACLE]} canRestart onRestart={onRestart} />);
    fireEvent.click(within(cardFor('JOB-2026-815303')).getByRole('button', { name: /restart/i }));

    fireEvent.change(screen.getByLabelText(/back on it/i), { target: { value: RESTART_ON } });
    fireEvent.change(screen.getByLabelText(/through/i), { target: { value: RESTART_THROUGH } });
    fireEvent.change(screen.getByLabelText(/what are they doing this time/i), {
      target: { value: '  Core drill 12 penetrations through the north wall.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /restart job/i }));

    await waitFor(() => expect(onRestart).toHaveBeenCalledTimes(1));
    const [job, payload] = onRestart.mock.calls[0] as unknown as [JobCardData, any];
    expect(job.job_number).toBe('JOB-2026-815303'); // same contract, same number
    expect(payload).toEqual({
      scheduled_date: RESTART_ON,
      end_date: RESTART_THROUGH,
      scope_text: 'Core drill 12 penetrations through the north wall.',
    });
  });

  it('refuses an end date that falls before the start', () => {
    const onRestart = jest.fn(async () => true);
    render(<ParkedFolder parkedJobs={[PINNACLE]} canRestart onRestart={onRestart} />);
    fireEvent.click(within(cardFor('JOB-2026-815303')).getByRole('button', { name: /restart/i }));

    fireEvent.change(screen.getByLabelText(/back on it/i), { target: { value: RESTART_ON } });
    fireEvent.change(screen.getByLabelText(/what are they doing this time/i), {
      target: { value: 'Core drill.' },
    });
    fireEvent.change(screen.getByLabelText(/through/i), { target: { value: BEFORE_RESTART } });

    expect(screen.getByText(/end date is before the start date/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restart job/i })).toBeDisabled();
  });

  it('keeps the modal open when the restart fails, so the typing is not lost', async () => {
    const onRestart = jest.fn(async () => false);
    render(<ParkedFolder parkedJobs={[PINNACLE]} canRestart onRestart={onRestart} />);
    fireEvent.click(within(cardFor('JOB-2026-815303')).getByRole('button', { name: /restart/i }));

    fireEvent.change(screen.getByLabelText(/what are they doing this time/i), {
      target: { value: 'Core drill.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /restart job/i }));

    await waitFor(() => expect(onRestart).toHaveBeenCalled());
    expect(screen.getByLabelText(/what are they doing this time/i)).toHaveValue('Core drill.');
  });
});
