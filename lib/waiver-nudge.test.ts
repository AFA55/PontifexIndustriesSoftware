import {
  WAIVER_NUDGE_WINDOW_MS,
  WAIVER_STATE_LABEL,
  canNudgeWaiver,
  currentDailyAssignments,
  isWaiverChaseClosed,
  resolveWaiverNudgeRecipients,
  waiverNudgeDedupKey,
  waiverNudgeSummary,
  waiverRowState,
} from './waiver-nudge';
import { manualWaiverChaseStep, waiverChaseStep, ASSUMED_TRAVEL_MINUTES } from './waiver-chase';

const MIN = 60 * 1000;

describe('isWaiverChaseClosed', () => {
  it('treats completed and cancelled as closed', () => {
    expect(isWaiverChaseClosed('completed')).toBe(true);
    expect(isWaiverChaseClosed('cancelled')).toBe(true);
    expect(isWaiverChaseClosed('COMPLETED')).toBe(true);
  });

  it('treats every live status as still chaseable', () => {
    for (const s of ['scheduled', 'assigned', 'in_route', 'on_site', 'in_progress', 'pending_completion']) {
      expect(isWaiverChaseClosed(s)).toBe(false);
    }
  });

  it('does not close on a missing status', () => {
    expect(isWaiverChaseClosed(null)).toBe(false);
    expect(isWaiverChaseClosed(undefined)).toBe(false);
  });
});

describe('waiverRowState', () => {
  it('is signed whenever the signature exists, closed job or not', () => {
    expect(waiverRowState({ signed: true, jobStatus: 'completed' })).toBe('signed');
    expect(waiverRowState({ signed: true, jobStatus: 'in_progress' })).toBe('signed');
  });

  it('reads NOT SIGNED — not Outstanding — once the job is complete', () => {
    const state = waiverRowState({ signed: false, jobStatus: 'completed' });
    expect(state).toBe('not_signed_closed');
    expect(WAIVER_STATE_LABEL[state]).toBe('Not signed');
  });

  it('stays Outstanding while the job is live', () => {
    const state = waiverRowState({ signed: false, jobStatus: 'in_progress' });
    expect(state).toBe('outstanding');
    expect(WAIVER_STATE_LABEL[state]).toBe('Outstanding');
  });
});

describe('canNudgeWaiver', () => {
  it('allows the nudge only on a live job with a required, unsigned waiver', () => {
    expect(canNudgeWaiver({ requireWaiver: true, signed: false, jobStatus: 'in_progress' })).toBe(true);
    expect(canNudgeWaiver({ requireWaiver: true, signed: false, jobStatus: 'scheduled' })).toBe(true);
  });

  it('refuses once the job is closed — chasing it is pointless', () => {
    expect(canNudgeWaiver({ requireWaiver: true, signed: false, jobStatus: 'completed' })).toBe(false);
    expect(canNudgeWaiver({ requireWaiver: true, signed: false, jobStatus: 'cancelled' })).toBe(false);
  });

  it('refuses when signed or when no waiver is required', () => {
    expect(canNudgeWaiver({ requireWaiver: true, signed: true, jobStatus: 'in_progress' })).toBe(false);
    expect(canNudgeWaiver({ requireWaiver: false, signed: false, jobStatus: 'in_progress' })).toBe(false);
    expect(canNudgeWaiver({ requireWaiver: null, signed: null, jobStatus: 'in_progress' })).toBe(false);
  });
});

describe('waiverNudgeDedupKey', () => {
  const t0 = Date.UTC(2026, 7, 15, 14, 5, 0);

  it('is stable for repeated presses inside the same hour', () => {
    expect(waiverNudgeDedupKey('job-1', t0)).toBe(waiverNudgeDedupKey('job-1', t0 + 50 * MIN));
  });

  it('changes once the window rolls over', () => {
    expect(waiverNudgeDedupKey('job-1', t0)).not.toBe(
      waiverNudgeDedupKey('job-1', t0 + WAIVER_NUDGE_WINDOW_MS)
    );
  });

  it('never collides across jobs in the same window', () => {
    expect(waiverNudgeDedupKey('job-1', t0)).not.toBe(waiverNudgeDedupKey('job-2', t0));
  });
});

describe('resolveWaiverNudgeRecipients', () => {
  it('reads the job-level slots', () => {
    expect(
      resolveWaiverNudgeRecipients({ assigned_to: 'lead', helper_assigned_to: 'helper' })
    ).toEqual(['lead', 'helper']);
  });

  it('includes job_crew members added through the "+" path', () => {
    expect(
      resolveWaiverNudgeRecipients(
        { assigned_to: 'lead', helper_assigned_to: null },
        [{ user_id: 'extra-op' }, { user_id: 'extra-helper' }]
      )
    ).toEqual(['lead', 'extra-op', 'extra-helper']);
  });

  it('finds a crew that exists ONLY on the per-day board (Javier, Aug 15)', () => {
    // Both slots null, no job_crew — the exact shape that made a real job
    // dispatch to nobody. This must not resolve to an empty list.
    expect(
      resolveWaiverNudgeRecipients(
        { assigned_to: null, helper_assigned_to: null },
        [],
        [{ operator_id: 'javier', helper_id: 'ledger-helper' }]
      )
    ).toEqual(['javier', 'ledger-helper']);
  });

  it('de-duplicates a person who appears in more than one path', () => {
    expect(
      resolveWaiverNudgeRecipients(
        { assigned_to: 'lead', helper_assigned_to: 'helper' },
        [{ user_id: 'lead' }],
        [{ operator_id: 'lead', helper_id: 'helper' }, { operator_id: 'day2-op', helper_id: null }]
      )
    ).toEqual(['lead', 'helper', 'day2-op']);
  });

  it('drops empty ids rather than passing null into a query', () => {
    expect(
      resolveWaiverNudgeRecipients(
        { assigned_to: null, helper_assigned_to: undefined },
        [{ user_id: null }, { user_id: '' }],
        [{ operator_id: null, helper_id: null }]
      )
    ).toEqual([]);
  });

  it('survives a missing job row', () => {
    expect(resolveWaiverNudgeRecipients(null)).toEqual([]);
  });
});

describe('currentDailyAssignments', () => {
  const TODAY = '2026-08-15';

  it("uses today's row on a multi-day job, not everyone who ever held a day", () => {
    const rows = [
      { assignment_date: '2026-08-13', operator_id: 'monday-op', helper_id: null },
      { assignment_date: TODAY, operator_id: 'today-op', helper_id: 'today-helper' },
      { assignment_date: '2026-08-17', operator_id: 'later-op', helper_id: null },
    ];
    expect(currentDailyAssignments(rows, TODAY)).toEqual([rows[1]]);
    expect(resolveWaiverNudgeRecipients(null, [], currentDailyAssignments(rows, TODAY)))
      .toEqual(['today-op', 'today-helper']);
  });

  it('uses the nearest UPCOMING day when the job has not started', () => {
    const rows = [
      { assignment_date: '2026-08-20', operator_id: 'far', helper_id: null },
      { assignment_date: '2026-08-16', operator_id: 'tomorrow', helper_id: null },
    ];
    expect(currentDailyAssignments(rows, TODAY)).toEqual([rows[1]]);
  });

  it('falls back to the most recent day when the whole ledger is in the past', () => {
    const rows = [
      { assignment_date: '2026-08-10', operator_id: 'old', helper_id: null },
      { assignment_date: '2026-08-14', operator_id: 'yesterday', helper_id: null },
    ];
    expect(currentDailyAssignments(rows, TODAY)).toEqual([rows[1]]);
  });

  it('keeps undated rows rather than silently dropping a real assignment', () => {
    const rows = [
      { assignment_date: null, operator_id: 'undated', helper_id: null },
      { assignment_date: TODAY, operator_id: 'today-op', helper_id: null },
    ];
    expect(currentDailyAssignments(rows, TODAY)).toEqual([rows[1], rows[0]]);
  });

  it('compares bare date strings, so a UTC-midnight parse can never shift the day', () => {
    // '2026-08-15' must match today exactly; a `new Date()` round-trip in a US
    // timezone would land this on the 14th and pick the wrong crew.
    const rows = [{ assignment_date: '2026-08-15', operator_id: 'right-crew', helper_id: null }];
    expect(currentDailyAssignments(rows, '2026-08-15')).toEqual(rows);
    expect(currentDailyAssignments(rows, '2026-08-14')).toEqual(rows); // nearest upcoming
  });

  it('survives an empty or missing ledger', () => {
    expect(currentDailyAssignments([], TODAY)).toEqual([]);
    expect(currentDailyAssignments(null, TODAY)).toEqual([]);
    expect(currentDailyAssignments(undefined, TODAY)).toEqual([]);
  });
});

describe('waiverNudgeSummary', () => {
  it('says who was reminded', () => {
    expect(waiverNudgeSummary({ notified: 2, alreadyNotified: 0, names: ['Javier', 'Ana'] }))
      .toBe('Reminder sent to 2 crew members (Javier, Ana).');
  });

  it('singularises one recipient', () => {
    expect(waiverNudgeSummary({ notified: 1, alreadyNotified: 0, names: ['Javier'] }))
      .toBe('Reminder sent to 1 crew member (Javier).');
  });

  it('says plainly when the hour is already spent, rather than nothing', () => {
    expect(waiverNudgeSummary({ notified: 0, alreadyNotified: 2 }))
      .toMatch(/Already reminded within the last hour/);
  });

  it('says when there was nobody to remind', () => {
    expect(waiverNudgeSummary({ notified: 0, alreadyNotified: 0 }))
      .toMatch(/Nobody is assigned/);
  });
});

describe('manualWaiverChaseStep', () => {
  const now = Date.UTC(2026, 7, 15, 14, 0, 0);

  it('reuses the cron wording exactly when a step is already due', () => {
    const inRouteAt = new Date(now - (ASSUMED_TRAVEL_MINUTES + 50) * MIN).toISOString();
    const auto = waiverChaseStep({ nowMs: now, inRouteAt });
    const manual = manualWaiverChaseStep({ nowMs: now, inRouteAt });
    expect(auto).not.toBeNull();
    expect(manual).toBe(auto);
    expect(manual.key).toBe('followup');
  });

  it('never answers a deliberate press with silence', () => {
    // Crew has not left yet: the cron correctly declines, the button must not.
    expect(waiverChaseStep({ nowMs: now, inRouteAt: null })).toBeNull();
    const manual = manualWaiverChaseStep({ nowMs: now, inRouteAt: null });
    expect(manual.key).toBe('due');
    expect(manual.message('Acme')).toContain('Acme');
    expect(manual.message('Acme')).toContain('Have contractor sign understandings prior to working');
  });

  it('falls back to the first step while the crew is still driving', () => {
    const inRouteAt = new Date(now - 5 * MIN).toISOString();
    expect(waiverChaseStep({ nowMs: now, inRouteAt })).toBeNull();
    expect(manualWaiverChaseStep({ nowMs: now, inRouteAt }).key).toBe('due');
  });
});
