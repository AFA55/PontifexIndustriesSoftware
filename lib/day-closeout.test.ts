/**
 * The rule that stops a one-day job turning into a multi-day job on one tap.
 *
 * Every case below is a real shape from production between Aug 14 and Aug 17
 * 2026, when five of six day-closeouts left their job un-advanced.
 */

import {
  planDayCloseout,
  continueConfirmCopy,
  continueConfirmMessage,
  continueNextDayJobUpdate,
  finalCompletionJobUpdate,
  formatBookedThrough,
  CONTINUE_CONFIRMATION_REQUIRED,
} from './day-closeout';

describe('planDayCloseout — when the crew must be asked', () => {
  it('ASKS on a job the office booked for a single day', () => {
    // JOB-2026-160762 (Keontre, Aug 14): booked one day, closed with "Done for
    // Today", became multi-day, overran end_date and dropped off his list.
    const plan = planDayCloseout({
      today: '2026-08-14',
      scheduledDate: '2026-08-14',
      scheduledEndDate: '2026-08-14',
    });

    expect(plan.officeBookedMultiDay).toBe(false);
    expect(plan.withinBookedSpan).toBe(false);
    expect(plan.requiresContinueConfirmation).toBe(true);
    expect(plan.primaryAction).toBe('finish');
    expect(plan.confirm).not.toBeNull();
    expect(plan.confirm!.title).toContain('booked for one day');
  });

  it('ASKS when the office booked no end date at all (start day only)', () => {
    const plan = planDayCloseout({
      today: '2026-08-17',
      scheduledDate: '2026-08-17',
      scheduledEndDate: null,
    });

    expect(plan.officeBookedMultiDay).toBe(false);
    expect(plan.requiresContinueConfirmation).toBe(true);
    expect(plan.primaryAction).toBe('finish');
  });

  it('does NOT ask on an office-scheduled multi-day job mid-span', () => {
    // Booked Mon-Wed, it is Monday night. Coming back IS the expected action
    // and must stay frictionless.
    const plan = planDayCloseout({
      today: '2026-08-17',
      scheduledDate: '2026-08-17',
      scheduledEndDate: '2026-08-19',
    });

    expect(plan.officeBookedMultiDay).toBe(true);
    expect(plan.withinBookedSpan).toBe(true);
    expect(plan.requiresContinueConfirmation).toBe(false);
    expect(plan.primaryAction).toBe('continue');
    expect(plan.confirm).toBeNull();
  });

  it('does NOT ask on the middle day of a booked span', () => {
    const plan = planDayCloseout({
      today: '2026-08-18',
      scheduledDate: '2026-08-17',
      scheduledEndDate: '2026-08-19',
    });

    expect(plan.requiresContinueConfirmation).toBe(false);
    expect(plan.primaryAction).toBe('continue');
  });

  it('ASKS on the LAST booked day of a multi-day job — that is an overrun', () => {
    const plan = planDayCloseout({
      today: '2026-08-19',
      scheduledDate: '2026-08-17',
      scheduledEndDate: '2026-08-19',
    });

    expect(plan.officeBookedMultiDay).toBe(true);
    expect(plan.withinBookedSpan).toBe(false);
    expect(plan.requiresContinueConfirmation).toBe(true);
    expect(plan.primaryAction).toBe('finish');
    // Different mistake, different sentence.
    expect(plan.confirm!.title).toContain('booked through');
    expect(plan.confirm!.title).not.toContain('one day');
  });

  it('ASKS on a job that has ALREADY overrun its booked span', () => {
    const plan = planDayCloseout({
      today: '2026-08-25',
      scheduledDate: '2026-08-17',
      scheduledEndDate: '2026-08-19',
    });

    expect(plan.requiresContinueConfirmation).toBe(true);
    expect(plan.primaryAction).toBe('finish');
  });

  it('ASKS when the dates are unknown — confirming is the safe direction', () => {
    const plan = planDayCloseout({
      today: '2026-08-17',
      scheduledDate: null,
      scheduledEndDate: null,
    });

    expect(plan.requiresContinueConfirmation).toBe(true);
    expect(plan.primaryAction).toBe('finish');
    expect(plan.bookedEndDate).toBeNull();
  });

  it('ignores garbage dates rather than guessing at them', () => {
    const plan = planDayCloseout({
      today: '2026-08-17',
      scheduledDate: 'tomorrow' as unknown as string,
      scheduledEndDate: '08/19/2026',
    });

    expect(plan.officeBookedMultiDay).toBe(false);
    expect(plan.requiresContinueConfirmation).toBe(true);
  });

  it('never trusts is_multi_day — it is not even an input', () => {
    // The flag is the thing the bug corrupts. A job wrongly flagged multi-day
    // but booked for one day must still be asked, so one wrong tap cannot
    // authorise the next one.
    const plan = planDayCloseout({
      today: '2026-08-17',
      scheduledDate: '2026-08-17',
      scheduledEndDate: '2026-08-17',
    });
    expect(plan.requiresContinueConfirmation).toBe(true);
  });
});

describe('confirmation copy', () => {
  it('names the consequence in the crew’s terms, not the schema’s', () => {
    const copy = continueConfirmCopy({ officeBookedMultiDay: false, bookedEndDate: '2026-08-17' });
    expect(copy.body).toContain('multi-day job');
    expect(copy.body).toContain('bill it');
    expect(copy.body).not.toContain('is_multi_day');
    expect(copy.confirmLabel).toMatch(/coming back tomorrow/i);
    expect(copy.cancelLabel).toMatch(/take me back/i);
  });

  it('folds into one sentence for the API refusal', () => {
    const copy = continueConfirmCopy({ officeBookedMultiDay: false, bookedEndDate: null });
    expect(continueConfirmMessage(copy)).toBe(`${copy.title} ${copy.body}`);
  });

  it('formats the booked-through reassurance from a bare YMD without shifting the day', () => {
    // parseYMDLocal, never new Date('YYYY-MM-DD') — the recurring off-by-one.
    expect(formatBookedThrough('2026-08-19')).toContain('Aug 19');
    expect(formatBookedThrough(null)).toContain('comes back to your list tomorrow');
  });

  it('exposes a stable error code for the client to branch on', () => {
    expect(CONTINUE_CONFIRMATION_REQUIRED).toBe('continue_next_day_confirmation_required');
  });
});

describe('what each branch actually writes to job_orders', () => {
  it('"Done for Today" flags multi-day, reopens as scheduled, clears the day’s timestamps', () => {
    expect(continueNextDayJobUpdate()).toEqual({
      is_multi_day: true,
      status: 'scheduled',
      route_started_at: null,
      work_started_at: null,
      route_start_latitude: null,
      route_start_longitude: null,
      work_start_latitude: null,
      work_start_longitude: null,
    });
  });

  it('"Job Complete" completes the job and derives is_multi_day from days logged', () => {
    expect(
      finalCompletionJobUpdate({
        nowIso: '2026-08-17T20:54:00.000Z',
        totalHours: 7.256,
        distinctDays: 1,
        signerName: 'D. Schadt',
      })
    ).toEqual({
      status: 'completed',
      work_completed_at: '2026-08-17T20:54:00.000Z',
      total_hours_worked: 7.26,
      is_multi_day: false,
      completion_signer_name: 'D. Schadt',
    });
  });

  it('"Job Complete" CORRECTS a wrongly-converted one-day job back to false', () => {
    const update = finalCompletionJobUpdate({
      nowIso: '2026-08-17T20:54:00.000Z',
      totalHours: 4,
      distinctDays: 1,
      signerName: 'Someone',
    });
    expect(update.is_multi_day).toBe(false);
  });

  it('"Job Complete" keeps multi-day true when more than one day was really logged', () => {
    const update = finalCompletionJobUpdate({
      nowIso: '2026-08-17T20:54:00.000Z',
      totalHours: 22.5,
      distinctDays: 3,
      signerName: 'Someone',
    });
    expect(update.is_multi_day).toBe(true);
  });

  it('the two branches disagree about status — that is the whole point', () => {
    expect(continueNextDayJobUpdate().status).toBe('scheduled');
    expect(
      finalCompletionJobUpdate({ nowIso: 'x', totalHours: 0, distinctDays: 1, signerName: '' }).status
    ).toBe('completed');
  });
});
