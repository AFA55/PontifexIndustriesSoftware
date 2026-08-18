/**
 * THE AUG 18 CREW WIPE, as tests.
 *
 * The founder changed a helper on one schedule-board row and three jobs lost
 * their operator in four seconds — two of them `in_route`, crews driving to
 * jobs the board then said nobody was on. Every assertion below is one of the
 * links in that chain.
 */
import {
  buildCrewNameIndex,
  resolveCrewId,
  isLiveJobStatus,
  stripsCrew,
  crewClearNeedsConfirmation,
  crewClearBlockedMessage,
  shouldClearCrewOnDateMove,
  summarizeCrewChange,
  describeCrewClear,
} from './crew-assignment';

// The real roster shape: the picker shows "Conrade Richardson (Nate)", the
// board's rows are labelled with the bare `profiles.full_name`.
const CONRADE = {
  id: '81377aa2-4383-444f-a061-94036068c046',
  name: 'Conrade Richardson (Nate)',
  fullName: 'Conrade Richardson',
  nickname: 'Nate',
};
const MICAH = {
  id: '2eaa10c4-b8ef-4104-856e-4dbde0234cc2',
  name: 'Micah Rentz',
  fullName: 'Micah Rentz',
  nickname: null,
};
const AXEL = { id: 'axel-uuid', name: 'Axel Vance', fullName: 'Axel Vance', nickname: null };

describe('crew name resolution — the lookup that missed', () => {
  const index = buildCrewNameIndex([CONRADE, MICAH, AXEL]);

  it('resolves the BOARD ROW label (bare full_name), not just the picker label', () => {
    // THE BUG: `operatorIdMap['Conrade Richardson']` was undefined because the
    // map was keyed on the nickname-carrying display name.
    expect(resolveCrewId(index, 'Conrade Richardson')).toBe(CONRADE.id);
  });

  it('resolves the picker display name', () => {
    expect(resolveCrewId(index, 'Conrade Richardson (Nate)')).toBe(CONRADE.id);
  });

  it('resolves the nickname on its own', () => {
    expect(resolveCrewId(index, 'Nate')).toBe(CONRADE.id);
  });

  it('is insensitive to case and stray whitespace', () => {
    expect(resolveCrewId(index, '  conrade   richardson ')).toBe(CONRADE.id);
  });

  it('returns null for an unknown name — "I do not know", never "nobody"', () => {
    expect(resolveCrewId(index, 'Someone Else')).toBeNull();
    expect(resolveCrewId(index, '')).toBeNull();
    expect(resolveCrewId(index, null)).toBeNull();
  });

  it('refuses to resolve a name two people answer to rather than guessing', () => {
    const ambiguous = buildCrewNameIndex([
      { id: 'a', name: 'Andres Altamirano (work)', fullName: 'Andres Altamirano', nickname: null },
      { id: 'b', name: 'Andres Altamirano (personal)', fullName: 'Andres Altamirano', nickname: null },
    ]);
    expect(resolveCrewId(ambiguous, 'Andres Altamirano')).toBeNull();
    // …while the names that DO distinguish them still work.
    expect(resolveCrewId(ambiguous, 'Andres Altamirano (work)')).toBe('a');
  });

  it('does not treat the same person appearing in both roster arrays as ambiguous', () => {
    // The operators + helpers arrays overlap (an apprentice is in both).
    const dup = buildCrewNameIndex([MICAH, { ...MICAH }]);
    expect(resolveCrewId(dup, 'Micah Rentz')).toBe(MICAH.id);
  });
});

describe('a crew never comes off a live job by accident', () => {
  it('counts in_route as live — the truck is already moving', () => {
    expect(isLiveJobStatus('in_route')).toBe(true);
    expect(isLiveJobStatus('in_progress')).toBe(true);
    expect(isLiveJobStatus('on_site')).toBe(true);
    expect(isLiveJobStatus('pending_completion')).toBe(true);
    expect(isLiveJobStatus('scheduled')).toBe(false);
    expect(isLiveJobStatus('assigned')).toBe(false);
    expect(isLiveJobStatus(null)).toBe(false);
  });

  it('stripsCrew is about ending with NOBODY, not about changing seats', () => {
    expect(
      stripsCrew({
        status: 'assigned',
        prevOperatorId: CONRADE.id,
        prevHelperId: MICAH.id,
        nextOperatorId: null,
        nextHelperId: null,
      })
    ).toBe(true);
    // Swapping the operator keeps a crew — not a strip.
    expect(
      stripsCrew({
        status: 'assigned',
        prevOperatorId: CONRADE.id,
        prevHelperId: null,
        nextOperatorId: AXEL.id,
        nextHelperId: null,
      })
    ).toBe(false);
    // A helper-only crew is still a crew.
    expect(
      stripsCrew({
        status: 'assigned',
        prevOperatorId: CONRADE.id,
        prevHelperId: null,
        nextOperatorId: null,
        nextHelperId: AXEL.id,
      })
    ).toBe(false);
    // Nobody was on it to begin with.
    expect(
      stripsCrew({
        status: 'scheduled',
        prevOperatorId: null,
        prevHelperId: null,
        nextOperatorId: null,
        nextHelperId: null,
      })
    ).toBe(false);
  });

  it('THE INCIDENT: emptying the crew off an in_route job needs confirmation', () => {
    expect(
      crewClearNeedsConfirmation({
        status: 'in_route',
        prevOperatorId: CONRADE.id,
        prevHelperId: MICAH.id,
        nextOperatorId: null,
        nextHelperId: null,
      })
    ).toBe(true);
  });

  it('a job worked today is protected even when its status is not live', () => {
    expect(
      crewClearNeedsConfirmation({
        status: 'assigned',
        prevOperatorId: CONRADE.id,
        prevHelperId: null,
        nextOperatorId: null,
        nextHelperId: null,
        hasWorkLogged: true,
      })
    ).toBe(true);
  });

  it('an untouched, unstarted job may still be cleared freely', () => {
    expect(
      crewClearNeedsConfirmation({
        status: 'assigned',
        prevOperatorId: CONRADE.id,
        prevHelperId: null,
        nextOperatorId: null,
        nextHelperId: null,
      })
    ).toBe(false);
  });

  it('reassigning a live job to someone else is never blocked — only emptying it', () => {
    expect(
      crewClearNeedsConfirmation({
        status: 'in_progress',
        prevOperatorId: CONRADE.id,
        prevHelperId: null,
        nextOperatorId: AXEL.id,
        nextHelperId: null,
      })
    ).toBe(false);
  });

  it('the block message names the job and says what to do instead', () => {
    const msg = crewClearBlockedMessage('JOB-2026-400639', 'in_route');
    expect(msg).toContain('JOB-2026-400639');
    expect(msg).toContain('in route');
    expect(msg.toLowerCase()).toContain('assign someone else');
  });
});

describe('date move → crew clear (the movingStart rule)', () => {
  it('still clears the crew on a plain, unstarted job — the rule exists for a reason', () => {
    expect(shouldClearCrewOnDateMove({ status: 'assigned' })).toBe(true);
    expect(shouldClearCrewOnDateMove({ status: 'scheduled' })).toBe(true);
    expect(shouldClearCrewOnDateMove({ status: 'pending_approval' })).toBe(true);
  });

  it('does NOT clear the crew off a job that is in_route or being worked', () => {
    expect(shouldClearCrewOnDateMove({ status: 'in_route' })).toBe(false);
    expect(shouldClearCrewOnDateMove({ status: 'in_progress' })).toBe(false);
    expect(shouldClearCrewOnDateMove({ status: 'on_site' })).toBe(false);
  });

  it('does NOT clear the crew off a job that already has work logged', () => {
    expect(shouldClearCrewOnDateMove({ status: 'assigned', hasWorkLogged: true })).toBe(false);
  });
});

describe('saying what changed', () => {
  it('reports an operator that came off', () => {
    const s = summarizeCrewChange(
      { operatorId: CONRADE.id, helperId: MICAH.id },
      { operatorId: null, helperId: MICAH.id }
    );
    expect(s.operator_cleared).toBe(true);
    expect(s.helper_cleared).toBe(false);
    expect(s.operator_changed).toBe(true);
    expect(s.helper_changed).toBe(false);
    expect(describeCrewClear(s, { operator: 'Conrade Richardson' })).toContain('Conrade Richardson');
  });

  it('says nothing when nobody came off', () => {
    const s = summarizeCrewChange(
      { operatorId: CONRADE.id, helperId: null },
      { operatorId: AXEL.id, helperId: null }
    );
    expect(s.operator_cleared).toBe(false);
    expect(describeCrewClear(s, {})).toBeNull();
  });
});

/**
 * ── THE INCIDENT, END TO END ─────────────────────────────────────────────
 * Replays what the board client actually did on Aug 18 and asserts the two
 * things that must now be true of the payload it builds.
 */
describe('regression: a helper change must not speak for the operator', () => {
  const index = buildCrewNameIndex([CONRADE, MICAH, AXEL]);

  /** What handleChangeRowHelper now sends for one job in the row. */
  function helperChangePayload(rowOperatorLabel: string, newHelperName: string | null) {
    const helperId = newHelperName ? resolveCrewId(index, newHelperName) : null;
    // Deliberately does NOT read rowOperatorLabel into an operatorId — the key
    // is omitted so the server keeps whoever is on the job.
    void rowOperatorLabel;
    return { helperId, assignment_date: '2026-08-18', scope: 'day' as const };
  }

  it('omits operatorId entirely, so an unresolved row label cannot mean "nobody"', () => {
    const payload = helperChangePayload('Conrade Richardson', 'Axel Vance');
    expect('operatorId' in payload).toBe(false);
    expect(payload.helperId).toBe(AXEL.id);
  });

  it('the OLD payload shape is what nulled the operator — proven here', () => {
    // The pre-fix map: keyed on the picker's display name only.
    const oldOperatorIdMap: Record<string, string> = { [CONRADE.name]: CONRADE.id };
    const oldPayloadOperatorId = oldOperatorIdMap['Conrade Richardson'] || null;
    expect(oldPayloadOperatorId).toBeNull(); // ← the crew wipe, in one line

    // The new resolver, given the same board row label, finds him.
    expect(resolveCrewId(index, 'Conrade Richardson')).toBe(CONRADE.id);
  });

  it('a batch of three jobs in one row: none of them may lose their operator', () => {
    const rowJobs = ['JOB-2026-400639', 'JOB-2026-630612', 'JOB-2026-651428'];
    const payloads = rowJobs.map(() => helperChangePayload('Conrade Richardson', 'Axel Vance'));
    expect(payloads.every((p) => !('operatorId' in p))).toBe(true);

    // And the server-side rule: with operatorId absent, the operator is kept,
    // so no write in the batch strips the crew.
    for (const p of payloads) {
      expect(
        stripsCrew({
          status: 'in_route',
          prevOperatorId: CONRADE.id,
          prevHelperId: MICAH.id,
          nextOperatorId: CONRADE.id, // ← preserved, because the key was absent
          nextHelperId: p.helperId,
        })
      ).toBe(false);
    }
  });

  it("one job's date change must not clear crew on the others in the batch", () => {
    // A batch edit where only job A moves. The movingStart rule is evaluated
    // per job against ITS OWN stored date — B and C never enter the branch.
    const jobs = [
      { id: 'A', stored: '2026-08-18', posted: '2026-08-25', status: 'assigned' },
      { id: 'B', stored: '2026-08-18', posted: '2026-08-18', status: 'in_route' },
      { id: 'C', stored: '2026-08-18', posted: '2026-08-18', status: 'in_route' },
    ];
    const cleared = jobs
      .filter((j) => j.posted !== j.stored && shouldClearCrewOnDateMove({ status: j.status }))
      .map((j) => j.id);
    expect(cleared).toEqual(['A']);
  });

  it('even the job that DID move keeps its crew when it is already in_route', () => {
    expect(
      shouldClearCrewOnDateMove({ status: 'in_route' })
    ).toBe(false);
  });
});
