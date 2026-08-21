import {
  isParked,
  daysParked,
  planRestart,
  releaseParkedJobFields,
  phaseForDate,
  numberJobDays,
  byDate,
  phaseGaps,
  scopeHistory,
  schedulingDatesMoving,
  formatDayHeading,
  sortPhases,
  type JobPhase,
} from './job-phases';

/**
 * The Leifeng shape, which is the whole reason this feature exists.
 *
 * JOB-2026-400368. Proven work Aug 10, Aug 11, Aug 13 (verified against the
 * production `job_workday_evidence` view — three dates, and `total_days_worked`
 * reads 3 to match). Parked Aug 11. Restarts Friday Aug 21 under a new scope.
 */
const LEIFENG_PHASES: JobPhase[] = [
  {
    id: 'p1',
    job_order_id: 'leifeng',
    phase_number: 1,
    started_on: '2026-08-10',
    scope_text:
      'Saw cut and remove exterior slab at 6 areas. Cut and remove to dumpsters on site.',
    parked_on: '2026-08-11',
    park_reason: 'Contractor pushed us off — site not ready',
  },
  {
    id: 'p2',
    job_order_id: 'leifeng',
    phase_number: 2,
    started_on: '2026-08-21',
    scope_text: 'Core drill 12 penetrations through the north wall.',
    parked_on: null,
    park_reason: null,
  },
];

/** Aug 13 is proven work; the restart adds Aug 21. */
const LEIFENG_DATES = ['2026-08-10', '2026-08-11', '2026-08-13', '2026-08-21'];

describe('isParked — the flag and the timestamps can disagree', () => {
  it('is parked when placed on hold and never released', () => {
    expect(
      isParked({ on_hold: true, on_hold_placed_at: '2026-08-11T14:00:00Z' })
    ).toBe(true);
  });

  it('is NOT parked once released after the placement', () => {
    expect(
      isParked({
        on_hold: true,
        on_hold_placed_at: '2026-08-14T20:18:01Z',
        on_hold_released_at: '2026-08-20T12:02:01Z',
      })
    ).toBe(false);
  });

  it('reads ClemTenn correctly — released by hand, boolean left behind', () => {
    // JOB-2026-974669, verified in production: on_hold = true AND
    // on_hold_released_at set. Reading the boolean alone would show a live job
    // as parked forever.
    const clemTenn = {
      on_hold: true,
      on_hold_placed_at: '2026-08-14T20:18:01.568068+00:00',
      on_hold_released_at: '2026-08-20T12:02:01.493567+00:00',
      on_hold_reason: 'Parked — contractor hasn’t set a new date',
    };
    expect(isParked(clemTenn)).toBe(false);
  });

  it('is parked again when re-parked after a release — park/restart repeats', () => {
    expect(
      isParked({
        on_hold: true,
        on_hold_released_at: '2026-08-20T12:00:00Z',
        on_hold_placed_at: '2026-08-25T09:00:00Z', // parked a SECOND time
      })
    ).toBe(true);
  });

  it('is not parked when it never was', () => {
    expect(isParked({ on_hold: false })).toBe(false);
    expect(isParked({})).toBe(false);
    expect(isParked(null)).toBe(false);
    expect(isParked(undefined)).toBe(false);
  });
});

describe('daysParked — the number nobody could see', () => {
  it('counts the ten days Leifeng sat', () => {
    const job = { on_hold: true, on_hold_placed_at: '2026-08-11T18:00:00Z' };
    expect(daysParked(job, '2026-08-21')).toBe(10);
  });

  it('returns null for a job that is not parked', () => {
    expect(daysParked({ on_hold: false }, '2026-08-21')).toBeNull();
    expect(
      daysParked(
        {
          on_hold: true,
          on_hold_placed_at: '2026-08-14T20:18:01Z',
          on_hold_released_at: '2026-08-20T12:02:01Z',
        },
        '2026-08-21'
      )
    ).toBeNull();
  });

  it('is 0 on the day it was parked, never negative', () => {
    const job = { on_hold: true, on_hold_placed_at: '2026-08-21T09:00:00Z' };
    expect(daysParked(job, '2026-08-21')).toBe(0);
    expect(daysParked(job, '2026-08-20')).toBe(0);
  });
});

describe('phaseForDate', () => {
  it('puts the pre-park days in phase 1 and the restart in phase 2', () => {
    expect(phaseForDate(LEIFENG_PHASES, '2026-08-10')?.phase_number).toBe(1);
    expect(phaseForDate(LEIFENG_PHASES, '2026-08-13')?.phase_number).toBe(1);
    expect(phaseForDate(LEIFENG_PHASES, '2026-08-21')?.phase_number).toBe(2);
  });

  it('a date before phase 1 still belongs to phase 1 — no holes', () => {
    expect(phaseForDate(LEIFENG_PHASES, '2026-08-01')?.phase_number).toBe(1);
  });

  it('returns null only when there are no phases', () => {
    expect(phaseForDate([], '2026-08-21')).toBeNull();
  });

  it('sorts phases the caller passed in any order', () => {
    const reversed = [LEIFENG_PHASES[1], LEIFENG_PHASES[0]];
    expect(sortPhases(reversed).map((p) => p.phase_number)).toEqual([1, 2]);
    expect(phaseForDate(reversed, '2026-08-21')?.phase_number).toBe(2);
  });
});

describe('numberJobDays — two numbers, both true', () => {
  it("Leifeng's Friday is Day 1 of the phase and day 4 of the job", () => {
    const n = byDate(numberJobDays(LEIFENG_PHASES, LEIFENG_DATES));

    expect(n.get('2026-08-10')).toEqual({
      date: '2026-08-10',
      phaseDay: 1,
      lifetimeDay: 1,
      phaseNumber: 1,
    });
    expect(n.get('2026-08-11')).toEqual({
      date: '2026-08-11',
      phaseDay: 2,
      lifetimeDay: 2,
      phaseNumber: 1,
    });
    expect(n.get('2026-08-13')).toEqual({
      date: '2026-08-13',
      phaseDay: 3,
      lifetimeDay: 3,
      phaseNumber: 1,
    });

    // The founder's sentence, as data: day one of getting back on it, and the
    // fourth day we've been on this job.
    expect(n.get('2026-08-21')).toEqual({
      date: '2026-08-21',
      phaseDay: 1,
      lifetimeDay: 4,
      phaseNumber: 2,
    });
  });

  it('the lifetime count keeps accumulating — it does NOT reset', () => {
    const days = numberJobDays(LEIFENG_PHASES, LEIFENG_DATES);
    expect(days.map((d) => d.lifetimeDay)).toEqual([1, 2, 3, 4]);
    // total_days_worked, which counts the same proven dates, agrees.
    expect(days[days.length - 1].lifetimeDay).toBe(LEIFENG_DATES.length);
  });

  it('a third phase restarts at 1 again while the lifetime runs on', () => {
    const phases = [
      ...LEIFENG_PHASES,
      {
        id: 'p3',
        job_order_id: 'leifeng',
        phase_number: 3,
        started_on: '2026-09-14',
        scope_text: 'Patch and grout.',
        parked_on: null,
        park_reason: null,
      },
    ];
    const n = byDate(
      numberJobDays(phases, [...LEIFENG_DATES, '2026-09-14', '2026-09-15'])
    );
    expect(n.get('2026-09-14')).toMatchObject({ phaseDay: 1, lifetimeDay: 5 });
    expect(n.get('2026-09-15')).toMatchObject({ phaseDay: 2, lifetimeDay: 6 });
  });

  it('tolerates unsorted and duplicated dates', () => {
    const days = numberJobDays(LEIFENG_PHASES, [
      '2026-08-21',
      '2026-08-10',
      '2026-08-13',
      '2026-08-11',
      '2026-08-10',
    ]);
    expect(days.map((d) => d.date)).toEqual(LEIFENG_DATES);
    expect(days.map((d) => d.phaseDay)).toEqual([1, 2, 3, 1]);
  });

  // ── The safety property that lets this ship without a backfill ────────────
  it('NO PHASE ROWS means phaseDay === lifetimeDay, exactly as before', () => {
    const days = numberJobDays([], LEIFENG_DATES);
    expect(days.map((d) => d.phaseDay)).toEqual([1, 2, 3, 4]);
    expect(days.map((d) => d.lifetimeDay)).toEqual([1, 2, 3, 4]);
    expect(days.every((d) => d.phaseDay === d.lifetimeDay)).toBe(true);
    expect(days.every((d) => d.phaseNumber === 1)).toBe(true);
  });

  it('a single phase behaves identically to no phases', () => {
    const one = [LEIFENG_PHASES[0]];
    expect(numberJobDays(one, LEIFENG_DATES)).toEqual(
      numberJobDays([], LEIFENG_DATES)
    );
  });

  it('handles an empty job', () => {
    expect(numberJobDays(LEIFENG_PHASES, [])).toEqual([]);
  });
});

describe('phaseGaps — the break must be visible', () => {
  it('shows the gap between the last day worked and the restart', () => {
    const numbering = numberJobDays(LEIFENG_PHASES, LEIFENG_DATES);
    const gaps = phaseGaps(LEIFENG_PHASES, numbering);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toEqual({
      lastWorkedOn: '2026-08-13',
      resumedOn: '2026-08-21',
      days: 8,
      phaseNumber: 2,
      parkReason: 'Contractor pushed us off — site not ready',
    });
  });

  it('reports no gap when a phase has no proven work — nothing invented', () => {
    // Phase 2 scheduled but not yet worked: the ticket must not manufacture a
    // pause out of a plan.
    const numbering = numberJobDays(LEIFENG_PHASES, [
      '2026-08-10',
      '2026-08-11',
      '2026-08-13',
    ]);
    expect(phaseGaps(LEIFENG_PHASES, numbering)).toEqual([]);
  });

  it('a never-parked job has no gaps', () => {
    expect(phaseGaps([], numberJobDays([], LEIFENG_DATES))).toEqual([]);
  });
});

describe('scopeHistory — nothing typed is ever lost', () => {
  const job = {
    description:
      'Saw cut and remove exterior slab at 6 areas. Cut and remove to dumpsters on site.',
  };

  it('the newest scope is the one in force', () => {
    // What `currentScope()` used to assert, held where the value is actually
    // read: the last history entry is the current one, and it is the new scope.
    const history = scopeHistory(job, LEIFENG_PHASES);
    const current = history[history.length - 1];
    expect(current.isCurrent).toBe(true);
    expect(current.scopeText).toBe('Core drill 12 penetrations through the north wall.');
  });

  it('the OLD scope stays readable as history', () => {
    const history = scopeHistory(job, LEIFENG_PHASES);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      phaseNumber: 1,
      scopeText:
        'Saw cut and remove exterior slab at 6 areas. Cut and remove to dumpsters on site.',
      isCurrent: false,
    });
    expect(history[1]).toMatchObject({
      phaseNumber: 2,
      scopeText: 'Core drill 12 penetrations through the north wall.',
      isCurrent: true,
    });
  });

  it('falls back to job.description when a job was never parked', () => {
    const history = scopeHistory(job, []);
    expect(history).toHaveLength(1);
    expect(history[0].scopeText).toBe(job.description);
    expect(history[0].isCurrent).toBe(true);
  });

  it('skips a phase that recorded no scope text', () => {
    const phases = [
      { ...LEIFENG_PHASES[0] },
      { ...LEIFENG_PHASES[1], scope_text: '   ' },
    ];
    const history = scopeHistory(job, phases);
    expect(history).toHaveLength(1);
    expect(history[0].scopeText).toBe(LEIFENG_PHASES[0].scope_text);
  });

  it('returns an empty history for a job with no scope anywhere', () => {
    expect(scopeHistory({ description: null }, [])).toEqual([]);
  });
});

describe('formatDayHeading — a reader must never wonder', () => {
  it('carries both numbers once a job has been restarted', () => {
    const n = byDate(numberJobDays(LEIFENG_PHASES, LEIFENG_DATES));
    expect(formatDayHeading(n.get('2026-08-21')!, 2)).toBe(
      'Day 1 — day 4 on the job'
    );
  });

  it('leaves an unparked job reading exactly as it always has', () => {
    const n = byDate(numberJobDays([], LEIFENG_DATES));
    expect(formatDayHeading(n.get('2026-08-21')!, 1)).toBe('Day 4');
    expect(formatDayHeading(n.get('2026-08-10')!, 1)).toBe('Day 1');
  });

  it('does not add the second clause where the two numbers agree', () => {
    const n = byDate(numberJobDays(LEIFENG_PHASES, LEIFENG_DATES));
    // Phase 1's days are unambiguous — Day 2 is the second day either way.
    expect(formatDayHeading(n.get('2026-08-11')!, 2)).toBe('Day 2');
  });
});

describe('planRestart — the first restart must rescue the old scope', () => {
  const OLD_SCOPE =
    'Saw cut and remove exterior slab at 6 areas. Cut and remove to dumpsters on site.';
  const NEW_SCOPE = 'Core drill 12 penetrations through the north wall.';

  it("reconstructs phase 1 from the job's own description before overwriting it", () => {
    // Leifeng's real shape: never restarted, so no phase rows exist, and the
    // original scope lives only on job_orders.description — which the restart
    // is about to replace. This is the last moment it exists.
    const plan = planRestart({
      phases: [],
      restartOn: '2026-08-21',
      newScopeText: NEW_SCOPE,
      previousScopeText: OLD_SCOPE,
      firstWorkedOn: '2026-08-10',
      scheduledDate: '2026-08-10',
      parkedOn: '2026-08-11',
    });

    expect(plan.insert).toEqual([
      {
        phase_number: 1,
        started_on: '2026-08-10',
        scope_text: OLD_SCOPE,
        parked_on: '2026-08-11',
      },
      {
        phase_number: 2,
        started_on: '2026-08-21',
        scope_text: NEW_SCOPE,
        parked_on: null,
      },
    ]);
    expect(plan.newPhaseNumber).toBe(2);
    // Nothing to close: phase 1 did not exist until this moment, so it is
    // stamped on insert instead.
    expect(plan.closePhase).toBeNull();
  });

  it('dates phase 1 from the first PROVEN work day, not the scheduled date', () => {
    const plan = planRestart({
      phases: [],
      restartOn: '2026-08-21',
      newScopeText: NEW_SCOPE,
      previousScopeText: OLD_SCOPE,
      firstWorkedOn: '2026-08-10',
      scheduledDate: '2026-08-03', // scheduled a week before anyone turned up
    });
    expect(plan.insert[0].started_on).toBe('2026-08-10');
  });

  it('falls back to the scheduled date, then the restart date, without ever nulling', () => {
    const noEvidence = planRestart({
      phases: [],
      restartOn: '2026-08-21',
      newScopeText: NEW_SCOPE,
      previousScopeText: OLD_SCOPE,
      firstWorkedOn: null,
      scheduledDate: '2026-08-10',
    });
    expect(noEvidence.insert[0].started_on).toBe('2026-08-10');

    const nothingAtAll = planRestart({
      phases: [],
      restartOn: '2026-08-21',
      newScopeText: NEW_SCOPE,
      previousScopeText: OLD_SCOPE,
    });
    // A null here would break day numbering for the whole job.
    expect(nothingAtAll.insert[0].started_on).toBe('2026-08-21');
  });

  it('a SECOND restart adds one phase and closes the previous one', () => {
    const plan = planRestart({
      phases: LEIFENG_PHASES,
      restartOn: '2026-09-14',
      newScopeText: 'Patch and grout.',
      previousScopeText: NEW_SCOPE,
      parkedOn: '2026-08-29',
    });

    expect(plan.insert).toEqual([
      {
        phase_number: 3,
        started_on: '2026-09-14',
        scope_text: 'Patch and grout.',
        parked_on: null,
      },
    ]);
    expect(plan.closePhase).toEqual({ phase_number: 2, parked_on: '2026-08-29' });
    expect(plan.newPhaseNumber).toBe(3);
  });

  it('the whole cycle keeps one job number and lands the founder’s numbers', () => {
    // Park → restart → the ticket reads Day 1 / day 4, and total_days_worked
    // (which counts the same proven dates) still reads 4.
    const plan = planRestart({
      phases: [],
      restartOn: '2026-08-21',
      newScopeText: NEW_SCOPE,
      previousScopeText: OLD_SCOPE,
      firstWorkedOn: '2026-08-10',
      parkedOn: '2026-08-11',
    });

    const phases: JobPhase[] = plan.insert.map((p, i) => ({
      id: `p${i}`,
      job_order_id: 'leifeng',
      phase_number: p.phase_number,
      started_on: p.started_on,
      scope_text: p.scope_text,
      parked_on: p.parked_on,
      park_reason: null,
    }));

    const n = byDate(numberJobDays(phases, LEIFENG_DATES));
    expect(n.get('2026-08-21')).toMatchObject({ phaseDay: 1, lifetimeDay: 4 });
    expect(formatDayHeading(n.get('2026-08-21')!, 2)).toBe('Day 1 — day 4 on the job');

    // Both scopes survive, new one current.
    const history = scopeHistory({ description: NEW_SCOPE }, phases);
    expect(history.map((h) => h.scopeText)).toEqual([OLD_SCOPE, NEW_SCOPE]);
    expect(history[1].isCurrent).toBe(true);

    // And the pause is visible.
    expect(phaseGaps(phases, numberJobDays(phases, LEIFENG_DATES))[0]).toMatchObject({
      lastWorkedOn: '2026-08-13',
      resumedOn: '2026-08-21',
      days: 8,
    });
  });
});

describe('releaseParkedJobFields — the ClemTenn bug', () => {
  const PARKED = {
    status: 'on_hold',
    on_hold: true,
    on_hold_placed_at: '2026-08-14T20:18:01Z',
    on_hold_released_at: null,
  };

  it('releases and assigns when a crew is placed', () => {
    expect(
      releaseParkedJobFields({
        job: PARKED,
        operatorId: 'conrade',
        nowIso: '2026-08-20T12:00:00Z',
      })
    ).toEqual({
      on_hold: false,
      on_hold_released_at: '2026-08-20T12:00:00Z',
      status: 'assigned',
      assigned_at: '2026-08-20T12:00:00Z',
    });
  });

  it('releases to scheduled when nobody is on it but it GOT A DATE', () => {
    expect(
      releaseParkedJobFields({
        job: PARKED,
        scheduling: true,
        nowIso: '2026-08-20T12:00:00Z',
      })
    ).toEqual({
      on_hold: false,
      on_hold_released_at: '2026-08-20T12:00:00Z',
      status: 'scheduled',
    });
  });

  // ── THE FEATURE BUILT TO STOP JOBS VANISHING MUST NOT MAKE ONE VANISH ────
  //
  // JOB-2026-396494 is parked since Aug 17 with an operator on it and a
  // scheduled_date now in the past. The dispatcher pulls that operator off —
  // he is needed elsewhere while the job waits. If that write un-parks the
  // job, it drops out of the Parked column and files itself under a stale past
  // date the board's `lte(scheduled_date, today).or(end_date…)` filter will not
  // surface either. Invisible again: the exact ten-day Leifeng failure, caused
  // by the feature built to end it. Four of the six on_hold jobs in production
  // carry an operator, so this is reachable on four rows today.
  describe('unassigning a parked job leaves it PARKED', () => {
    it('writes nothing when nobody is left on it and no date is moving', () => {
      expect(
        releaseParkedJobFields({
          job: PARKED,
          operatorId: null,
          helperId: null,
          nowIso: '2026-08-20T12:00:00Z',
        })
      ).toEqual({});
    });

    it('writes nothing when the crew arguments are simply omitted', () => {
      // The old signature released on this call, which is how five write paths
      // inherited the bug at once.
      expect(releaseParkedJobFields({ job: PARKED })).toEqual({});
    });

    it('still releases when a HELPER is left on it', () => {
      // Someone is on the job after this write, so it is not sitting.
      const fields = releaseParkedJobFields({
        job: PARKED,
        operatorId: null,
        helperId: 'axel',
        nowIso: '2026-08-20T12:00:00Z',
      });
      expect(fields.on_hold).toBe(false);
      expect(fields.status).toBe('assigned');
    });

    it('releases when the same write also moves the date', () => {
      const fields = releaseParkedJobFields({
        job: PARKED,
        operatorId: null,
        helperId: null,
        scheduling: true,
        nowIso: '2026-08-20T12:00:00Z',
      });
      expect(fields.on_hold).toBe(false);
      expect(fields.on_hold_released_at).toBe('2026-08-20T12:00:00Z');
    });
  });

  it('is a no-op on a job that is not parked — safe to spread unconditionally', () => {
    expect(releaseParkedJobFields({ job: { on_hold: false } })).toEqual({});
    expect(releaseParkedJobFields({ job: null })).toEqual({});
    // Already released: the boolean is stale, not authoritative.
    expect(
      releaseParkedJobFields({
        job: {
          on_hold: true,
          on_hold_placed_at: '2026-08-14T20:18:01Z',
          on_hold_released_at: '2026-08-20T12:02:01Z',
        },
      })
    ).toEqual({});
  });

  it('never downgrades a job that is already live', () => {
    // Parked mid-flight then resumed: it keeps the status it earned. Pushing a
    // working crew back to 'scheduled' is how they lose their place.
    const live = { ...PARKED, status: 'in_progress' };
    const fields = releaseParkedJobFields({ job: live, operatorId: 'conrade' });
    expect(fields.on_hold).toBe(false);
    expect(fields.status).toBeUndefined();
    expect(fields.assigned_at).toBeUndefined();
  });

  it('preserves the record of the park that just ended', () => {
    // on_hold_reason and on_hold_placed_at are how long the job sat — the one
    // number this whole feature exists to show. Clearing them would erase it.
    const fields = releaseParkedJobFields({ job: PARKED, operatorId: 'conrade' });
    expect(fields).not.toHaveProperty('on_hold_reason');
    expect(fields).not.toHaveProperty('on_hold_placed_at');
  });
});

describe('schedulingDatesMoving — "it got a date" has to be a fact', () => {
  const job = {
    scheduled_date: '2026-08-17',
    end_date: null,
    scheduled_end_date: null,
    assigned_to: 'op-1',
  };

  it('is FALSE when the editor resubmits the date it already had', () => {
    // The board's edit panel sends every field it rendered. This is the exact
    // shape of "take the operator off a parked job": the date rides along
    // unchanged and must not be read as the office re-scheduling the job.
    expect(schedulingDatesMoving({ scheduled_date: '2026-08-17', assigned_to: null }, job)).toBe(
      false
    );
  });

  it('is TRUE when a date actually changes', () => {
    expect(schedulingDatesMoving({ scheduled_date: '2026-08-21' }, job)).toBe(true);
  });

  it('is TRUE when an end date is added to a job that had none', () => {
    expect(schedulingDatesMoving({ end_date: '2026-08-22' }, job)).toBe(true);
  });

  it('treats null, undefined and empty string as the same absent date', () => {
    expect(schedulingDatesMoving({ end_date: null }, job)).toBe(false);
    expect(schedulingDatesMoving({ end_date: '' }, job)).toBe(false);
    expect(schedulingDatesMoving({ scheduled_end_date: null }, job)).toBe(false);
  });

  it('ignores fields the update does not name', () => {
    expect(schedulingDatesMoving({ po_number: '1234' }, job)).toBe(false);
    expect(schedulingDatesMoving({}, job)).toBe(false);
  });

  it('takes a written date at face value when the row could not be read', () => {
    expect(schedulingDatesMoving({ scheduled_date: '2026-08-21' }, null)).toBe(true);
  });
});
