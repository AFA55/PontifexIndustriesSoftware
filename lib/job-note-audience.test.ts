import {
  normalizeNoteAudience,
  isOfficeRole,
  canViewNote,
  filterVisibleNotes,
  resolveJobCrewUserIds,
  resolveNoteNotifyRecipients,
  notePreview,
  OFFICE_NOTE_ROLES,
} from './job-note-audience';

const OFFICE = { userId: 'office-1', role: 'admin', isCrewOnJob: false };
const LEAD = { userId: 'op-lead', role: 'operator', isCrewOnJob: true };
const STRANGER = { userId: 'op-other', role: 'operator', isCrewOnJob: false };

describe('normalizeNoteAudience — anything unrecognised falls PRIVATE', () => {
  it('keeps an explicit operator audience', () => {
    expect(normalizeNoteAudience('operator')).toBe('operator');
  });

  it.each([
    ['internal', 'internal'],
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['a typo', 'operatr'],
    ['a legacy kind', 'manual'],
    ['a number', 7],
    ['an object', { audience: 'operator' }],
  ])('falls back to internal for %s', (_label, value) => {
    expect(normalizeNoteAudience(value)).toBe('internal');
  });
});

describe('isOfficeRole', () => {
  it('admits every office/management role', () => {
    for (const r of OFFICE_NOTE_ROLES) expect(isOfficeRole(r)).toBe(true);
  });

  it.each(['operator', 'apprentice', 'shop_help', 'customer', '', null, undefined])(
    'refuses the worker/unknown role %s',
    (role) => {
      expect(isOfficeRole(role as string)).toBe(false);
    },
  );
});

describe('canViewNote — the visibility rule', () => {
  const internal = { audience: 'internal', note_type: 'manual', author_id: 'office-1' };
  const forCrew = { audience: 'operator', note_type: 'manual', author_id: 'office-1' };

  it('NEVER shows an internal note to a crewed operator — the whole point', () => {
    expect(canViewNote(LEAD, internal)).toBe(false);
  });

  it('shows an operator-audience note to the crew', () => {
    expect(canViewNote(LEAD, forCrew)).toBe(true);
  });

  it('hides an operator-audience note from someone NOT on the crew', () => {
    expect(canViewNote(STRANGER, forCrew)).toBe(false);
  });

  it('shows the office both audiences', () => {
    expect(canViewNote(OFFICE, internal)).toBe(true);
    expect(canViewNote(OFFICE, forCrew)).toBe(true);
  });

  it('lets an author read their own note whatever the audience', () => {
    const ownInternal = { audience: 'internal', note_type: 'amendment', author_id: LEAD.userId };
    expect(canViewNote(LEAD, ownInternal)).toBe(true);
    // ...even once they are off the crew.
    expect(canViewNote({ ...LEAD, isCrewOnJob: false }, ownInternal)).toBe(true);
  });

  it('hides change_log rows from everyone, office included', () => {
    const log = { audience: 'operator', note_type: 'change_log', author_id: 'office-1' };
    expect(canViewNote(OFFICE, log)).toBe(false);
    expect(canViewNote(LEAD, log)).toBe(false);
  });

  it('treats a note with a missing audience as internal (legacy rows)', () => {
    const legacy = { note_type: 'manual', author_id: 'office-1' };
    expect(canViewNote(LEAD, legacy)).toBe(false);
    expect(canViewNote(OFFICE, legacy)).toBe(true);
  });

  it('does not leak an internal note through a corrupted audience value', () => {
    const sneaky = { audience: 'Operator', note_type: 'manual', author_id: 'office-1' };
    expect(canViewNote(LEAD, sneaky)).toBe(false);
  });
});

describe('filterVisibleNotes', () => {
  const notes = [
    { id: 'a', audience: 'internal', note_type: 'manual', author_id: 'office-1' },
    { id: 'b', audience: 'operator', note_type: 'manual', author_id: 'office-1' },
    { id: 'c', audience: 'internal', note_type: 'change_log', author_id: 'office-1' },
    { id: 'd', audience: 'internal', note_type: 'amendment', author_id: 'op-lead' },
  ];

  it('gives the crew only what is addressed to them plus their own', () => {
    expect(filterVisibleNotes(LEAD, notes).map((n) => n.id)).toEqual(['b', 'd']);
  });

  it('gives the office everything except change_log', () => {
    expect(filterVisibleNotes(OFFICE, notes).map((n) => n.id)).toEqual(['a', 'b', 'd']);
  });
});

describe('resolveJobCrewUserIds — all three assignment paths', () => {
  it('reads the job-level slots', () => {
    expect(
      resolveJobCrewUserIds({ job: { assigned_to: 'u1', helper_assigned_to: 'u2' } }),
    ).toEqual(['u1', 'u2']);
  });

  it('reads the per-day ledger even when both slots are null', () => {
    expect(
      resolveJobCrewUserIds({
        job: { assigned_to: null, helper_assigned_to: null },
        dailyAssignments: [{ operator_id: 'javi', helper_id: 'kev' }],
      }),
    ).toEqual(['javi', 'kev']);
  });

  it('reads extra job_crew members', () => {
    expect(
      resolveJobCrewUserIds({
        job: { assigned_to: 'u1' },
        crew: [{ user_id: 'u3' }, { user_id: 'u4' }],
      }),
    ).toEqual(['u1', 'u3', 'u4']);
  });

  it('unions all three and dedupes', () => {
    expect(
      resolveJobCrewUserIds({
        job: { assigned_to: 'u1', helper_assigned_to: 'u2' },
        crew: [{ user_id: 'u2' }, { user_id: 'u3' }],
        dailyAssignments: [
          { operator_id: 'u1', helper_id: 'u4' },
          { operator_id: 'u5', helper_id: null },
        ],
      }),
    ).toEqual(['u1', 'u2', 'u3', 'u4', 'u5']);
  });

  it('survives empty / null / malformed sources', () => {
    expect(resolveJobCrewUserIds({})).toEqual([]);
    expect(resolveJobCrewUserIds({ job: null, crew: null, dailyAssignments: null })).toEqual([]);
    expect(
      resolveJobCrewUserIds({ crew: [{ user_id: null }, { user_id: '' }] }),
    ).toEqual([]);
  });
});

describe('resolveNoteNotifyRecipients — who actually gets told', () => {
  const sources = {
    job: { assigned_to: 'lead', helper_assigned_to: 'helper' },
    crew: [{ user_id: 'extra' }],
    dailyAssignments: [{ operator_id: 'ledger-only', helper_id: null }],
  };

  it('tells nobody about an internal note', () => {
    expect(resolveNoteNotifyRecipients(sources, { audience: 'internal', authorId: 'office-1' }))
      .toEqual([]);
  });

  it('tells nobody when the audience is missing (fails private)', () => {
    expect(resolveNoteNotifyRecipients(sources, { audience: undefined, authorId: 'office-1' }))
      .toEqual([]);
  });

  it('tells the whole crew about an operator note — ledger people included', () => {
    expect(resolveNoteNotifyRecipients(sources, { audience: 'operator', authorId: 'office-1' }))
      .toEqual(['lead', 'helper', 'extra', 'ledger-only']);
  });

  it('never notifies the author about their own note', () => {
    expect(resolveNoteNotifyRecipients(sources, { audience: 'operator', authorId: 'lead' }))
      .toEqual(['helper', 'extra', 'ledger-only']);
  });

  it('reaches a ledger-only crew with both job slots empty', () => {
    expect(
      resolveNoteNotifyRecipients(
        {
          job: { assigned_to: null, helper_assigned_to: null },
          dailyAssignments: [{ operator_id: 'javi', helper_id: 'kev' }],
        },
        { audience: 'operator', authorId: 'office-1' },
      ),
    ).toEqual(['javi', 'kev']);
  });

  it('returns nobody when the job has no crew at all', () => {
    expect(
      resolveNoteNotifyRecipients({ job: {} }, { audience: 'operator', authorId: 'office-1' }),
    ).toEqual([]);
  });
});

describe('notePreview', () => {
  it('leaves a short note alone', () => {
    expect(notePreview('Gate code is 4417')).toBe('Gate code is 4417');
  });

  it('flattens newlines so a push notification reads as one line', () => {
    expect(notePreview('Gate code 4417\n\nPark on   Elm')).toBe('Gate code 4417 Park on Elm');
  });

  it('truncates with an ellipsis', () => {
    expect(notePreview('x'.repeat(200), 10)).toBe(`${'x'.repeat(9)}…`);
    expect(notePreview('x'.repeat(200), 10)).toHaveLength(10);
  });
});
