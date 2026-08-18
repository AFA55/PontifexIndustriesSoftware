/**
 * The terminal choice, exercised the way a gloved thumb exercises it.
 *
 * These lock the two behaviours the founder actually reported: a one-day job
 * must not change shape on one tap, and an office-scheduled multi-day job must
 * stay frictionless. Plus the third thing nobody noticed was broken — "Job
 * Complete" is the path that reaches the customer signature, so it has to keep
 * reaching it.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DayCloseoutChoice from './DayCloseoutChoice';
import { planDayCloseout } from '@/lib/day-closeout';

const oneDayJob = planDayCloseout({
  today: '2026-08-17',
  scheduledDate: '2026-08-17',
  scheduledEndDate: '2026-08-17',
});

const bookedMultiDayMidSpan = planDayCloseout({
  today: '2026-08-17',
  scheduledDate: '2026-08-17',
  scheduledEndDate: '2026-08-19',
});

function setup(plan = oneDayJob, overrides: Partial<React.ComponentProps<typeof DayCloseoutChoice>> = {}) {
  const onContinue = jest.fn();
  const onSignOnSite = jest.fn();
  const onSendLink = jest.fn();
  render(
    <DayCloseoutChoice
      plan={plan}
      onContinue={onContinue}
      onSignOnSite={onSignOnSite}
      onSendLink={onSendLink}
      {...overrides}
    />
  );
  return { onContinue, onSignOnSite, onSendLink, user: userEvent.setup() };
}

describe('a job the office booked for ONE day', () => {
  it('asks before turning it into a multi-day job', async () => {
    const { onContinue, user } = setup(oneDayJob);

    expect(screen.queryByTestId('closeout-confirm')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('closeout-continue'));

    // Nothing submitted yet — the question comes first.
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByTestId('closeout-confirm')).toBeInTheDocument();
    expect(screen.getByText(/booked for one day/i)).toBeInTheDocument();
  });

  it('submits as CONFIRMED once the crew says they are coming back', async () => {
    const { onContinue, user } = setup(oneDayJob);

    await user.click(screen.getByTestId('closeout-continue'));
    await user.click(screen.getByTestId('closeout-confirm-yes'));

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId('closeout-confirm')).not.toBeInTheDocument();
  });

  it('backing out of the question submits nothing at all', async () => {
    const { onContinue, user } = setup(oneDayJob);

    await user.click(screen.getByTestId('closeout-continue'));
    await user.click(screen.getByTestId('closeout-confirm-no'));

    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.queryByTestId('closeout-confirm')).not.toBeInTheDocument();
  });

  it('leads with finishing, and says what "Done for Today" costs on the control itself', () => {
    setup(oneDayJob);
    expect(screen.getByTestId('closeout-continue')).toHaveTextContent(/leaves the job open/i);
    expect(screen.getByTestId('closeout-sign-on-site')).toHaveTextContent(/closes? the job out/i);
  });
});

describe('a job the office genuinely scheduled as multi-day', () => {
  it('does NOT ask — Done for Today is the expected action and stays frictionless', async () => {
    const { onContinue, user } = setup(bookedMultiDayMidSpan);

    await user.click(screen.getByTestId('closeout-continue'));

    expect(screen.queryByTestId('closeout-confirm')).not.toBeInTheDocument();
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledWith(false);
  });

  it('shows the crew the span the office actually booked', () => {
    setup(bookedMultiDayMidSpan);
    expect(screen.getByTestId('closeout-continue')).toHaveTextContent(/booked this job through/i);
  });
});

describe('the completion paths', () => {
  it('"Complete Job — Customer Signs Here" reaches the signature step', async () => {
    const { onSignOnSite, onContinue, user } = setup(oneDayJob);

    await user.click(screen.getByTestId('closeout-sign-on-site'));

    expect(onSignOnSite).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
    // No confirmation stands between the crew and finishing a job.
    expect(screen.queryByTestId('closeout-confirm')).not.toBeInTheDocument();
  });

  it('reaches the signature step on a multi-day job too', async () => {
    const { onSignOnSite, user } = setup(bookedMultiDayMidSpan);
    await user.click(screen.getByTestId('closeout-sign-on-site'));
    expect(onSignOnSite).toHaveBeenCalledTimes(1);
  });

  it('the remote path opens the send-link panel', async () => {
    const { onSendLink, user } = setup(oneDayJob);
    await user.click(screen.getByTestId('closeout-send-link'));
    expect(onSendLink).toHaveBeenCalledTimes(1);
  });
});

describe('the server’s backstop', () => {
  it('a 409 forces the same question open, in the server’s words', async () => {
    const onDismiss = jest.fn();
    const { onContinue, user } = setup(bookedMultiDayMidSpan, {
      serverConfirmMessage: 'This job was booked for one day.',
      onServerConfirmDismissed: onDismiss,
    });

    expect(screen.getByTestId('closeout-confirm')).toBeInTheDocument();
    expect(screen.getByText('This job was booked for one day.')).toBeInTheDocument();

    await user.click(screen.getByTestId('closeout-confirm-yes'));
    expect(onDismiss).toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalledWith(true);
  });

  it('the server’s copy owns the whole modal — no title from one situation over a body from another', () => {
    setup(bookedMultiDayMidSpan, {
      serverConfirmCopy: {
        title: 'This job was booked for one day.',
        body: 'Coming back tomorrow turns it into a multi-day job.',
        confirmLabel: 'Yes — we are coming back tomorrow',
        cancelLabel: 'No — take me back',
      },
    });

    const modal = screen.getByTestId('closeout-confirm');
    expect(modal).toHaveTextContent('This job was booked for one day.');
    expect(modal).toHaveTextContent('Coming back tomorrow turns it into a multi-day job.');
    // The client plan's own wording (mid-span multi-day) must not leak in.
    expect(modal).not.toHaveTextContent(/booked through/i);
  });
});

describe('while the booked span is still unknown', () => {
  // The plan is built from nulls before the schedule fetch lands, which reads
  // as "booked for one day". Showing that warning on a genuine 8-day job is how
  // crews learn to click through the warning that matters.
  const unknownBooking = planDayCloseout({ today: '2026-08-17' });

  it('asks nothing and lets the SERVER decide, submitting unconfirmed', async () => {
    const { onContinue, user } = setup(unknownBooking, { planPending: true });

    await user.click(screen.getByTestId('closeout-continue'));

    expect(screen.queryByTestId('closeout-confirm')).not.toBeInTheDocument();
    expect(onContinue).toHaveBeenCalledWith(false);
  });

  it('once the dates ARE known, the question is back', async () => {
    const { onContinue, user } = setup(unknownBooking, { planPending: false });

    await user.click(screen.getByTestId('closeout-continue'));

    expect(screen.getByTestId('closeout-confirm')).toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();
  });
});

describe('feedback between the tap and the response', () => {
  it('the continue button spins while submitting, on the secondary treatment too', () => {
    // It used to spin only when "Done for Today" was primary — i.e. never in the
    // case that goes through the modal, so on LTE the modal vanished and nothing
    // happened for seconds. That reads as a dropped tap and gets tapped again.
    const { container } = render(
      <DayCloseoutChoice
        plan={oneDayJob}
        submitting
        onContinue={jest.fn()}
        onSignOnSite={jest.fn()}
        onSendLink={jest.fn()}
      />
    );
    expect(screen.getByTestId('closeout-continue')).toBeDisabled();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('Escape backs out of the question — it was not the only exit anymore', async () => {
    const { onContinue, user } = setup(oneDayJob);

    await user.click(screen.getByTestId('closeout-continue'));
    expect(screen.getByTestId('closeout-confirm')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByTestId('closeout-confirm')).not.toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();
  });
});

describe('gates that block every terminal action', () => {
  it('an unanswered out-of-town question disables all three, and taps do nothing', async () => {
    const { onContinue, onSignOnSite, onSendLink, user } = setup(oneDayJob, { disabled: true });

    expect(screen.getByTestId('closeout-continue')).toBeDisabled();
    expect(screen.getByTestId('closeout-sign-on-site')).toBeDisabled();
    expect(screen.getByTestId('closeout-send-link')).toBeDisabled();

    await user.click(screen.getByTestId('closeout-continue'));
    expect(onContinue).not.toHaveBeenCalled();
    expect(onSignOnSite).not.toHaveBeenCalled();
    expect(onSendLink).not.toHaveBeenCalled();
    expect(screen.queryByTestId('closeout-confirm')).not.toBeInTheDocument();
  });
});
