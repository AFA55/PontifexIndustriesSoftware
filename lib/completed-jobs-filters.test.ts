import {
  NO_PROJECT_MANAGER,
  completionMoment,
  isSortDirection,
  matchesProjectManager,
  projectManagerOf,
  projectManagerOptions,
  sortByCompletion,
  type CompletedJobLike,
} from './completed-jobs-filters';

const job = (over: Partial<CompletedJobLike> = {}): CompletedJobLike => ({
  job_number: 'JOB-2026-000001',
  ...over,
});

describe('projectManagerOf', () => {
  it('uses the salesman_name column when it is set', () => {
    expect(projectManagerOf(job({ salesman_name: 'Adam Ingalls' }))).toBe('Adam Ingalls');
  });

  it('trims, and treats whitespace-only as absent', () => {
    expect(projectManagerOf(job({ salesman_name: '  Jeter Yates ' }))).toBe('Jeter Yates');
    expect(projectManagerOf(job({ salesman_name: '   ' }))).toBeNull();
  });

  it('falls back to the profile behind created_by, like the printed ticket does', () => {
    expect(
      projectManagerOf(job({ salesman_name: null, created_by: 'p1' }), { p1: 'Super Admin (Demo)' })
    ).toBe('Super Admin (Demo)');
  });

  it('prefers the column over the creator when both exist', () => {
    expect(
      projectManagerOf(job({ salesman_name: 'Adam Ingalls', created_by: 'p1' }), { p1: 'Somebody Else' })
    ).toBe('Adam Ingalls');
  });

  it('returns null when neither the column nor a known creator names anyone', () => {
    expect(projectManagerOf(job({ salesman_name: null, created_by: 'ghost' }), {})).toBeNull();
    expect(projectManagerOf(job({ salesman_name: null, created_by: null }))).toBeNull();
  });
});

describe('projectManagerOptions', () => {
  it('lists only managers who actually have a job, A-Z, deduped', () => {
    const options = projectManagerOptions([
      job({ salesman_name: 'Jeter Yates' }),
      job({ salesman_name: 'Adam Ingalls' }),
      job({ salesman_name: 'Jeter Yates' }),
      job({ salesman_name: null, created_by: 'p1' }),
      job({ salesman_name: null, created_by: null }),
    ], { p1: 'Andres Altamirano' });
    expect(options).toEqual(['Adam Ingalls', 'Andres Altamirano', 'Jeter Yates']);
  });

  it('never emits an option no job can satisfy', () => {
    const jobs = [job({ salesman_name: 'Adam Ingalls' }), job({ salesman_name: null })];
    for (const name of projectManagerOptions(jobs)) {
      expect(jobs.some((j) => matchesProjectManager(j, name))).toBe(true);
    }
  });
});

describe('matchesProjectManager', () => {
  const adam = job({ salesman_name: 'Adam Ingalls' });
  const nobody = job({ salesman_name: null, created_by: null });

  it('passes everything through when nothing is selected', () => {
    expect(matchesProjectManager(adam, null)).toBe(true);
    expect(matchesProjectManager(nobody, null)).toBe(true);
  });

  it('matches on the exact name', () => {
    expect(matchesProjectManager(adam, 'Adam Ingalls')).toBe(true);
    expect(matchesProjectManager(adam, 'Jeter Yates')).toBe(false);
  });

  it('isolates the unnamed jobs behind their own sentinel', () => {
    expect(matchesProjectManager(nobody, NO_PROJECT_MANAGER)).toBe(true);
    expect(matchesProjectManager(adam, NO_PROJECT_MANAGER)).toBe(false);
  });

  it('yields an empty result for a name nobody has, rather than throwing', () => {
    expect([adam, nobody].filter((j) => matchesProjectManager(j, 'Nobody At All'))).toEqual([]);
  });
});

describe('completionMoment', () => {
  it('prefers the crew finish stamp', () => {
    const m = completionMoment(job({
      work_completed_at: '2026-08-18T14:47:06.214Z',
      completion_submitted_at: '2026-08-04T19:54:55.312Z',
    }));
    expect(m.kind).toBe('timestamp');
    expect(m.ms).toBe(Date.parse('2026-08-18T14:47:06.214Z'));
  });

  it('uses completion_submitted_at for jobs finished via the newer flow', () => {
    const m = completionMoment(job({
      work_completed_at: null,
      completion_submitted_at: '2026-08-12T14:35:06.835Z',
    }));
    expect(m).toMatchObject({ kind: 'timestamp', ms: Date.parse('2026-08-12T14:35:06.835Z') });
  });

  it('falls through signature and office close before giving up on timestamps', () => {
    expect(completionMoment(job({ completion_signed_at: '2026-08-11T15:04:34.553Z' })).kind).toBe('timestamp');
    expect(completionMoment(job({ office_completed_at: '2026-08-11T15:04:34.553Z' })).kind).toBe('timestamp');
  });

  it('falls back to the bare end_date parsed as LOCAL midnight, not UTC', () => {
    const m = completionMoment(job({ end_date: '2026-08-05' }));
    expect(m.kind).toBe('date');
    // The recurring timezone bug: new Date('2026-08-05') is UTC midnight and
    // renders as Aug 4 in US timezones. Local midnight keeps the calendar day.
    const local = m.ms === null ? new Date(NaN) : new Date(m.ms);
    expect(local.getFullYear()).toBe(2026);
    expect(local.getMonth()).toBe(7);
    expect(local.getDate()).toBe(5);
  });

  it('prefers end_date over scheduled_date, and ignores malformed days', () => {
    expect(completionMoment(job({ end_date: '2026-08-06', scheduled_date: '2026-08-01' })))
      .toMatchObject({ kind: 'date', ymd: '2026-08-06' });
    expect(completionMoment(job({ end_date: 'nonsense', scheduled_date: '2026-08-01' })))
      .toMatchObject({ kind: 'date', ymd: '2026-08-01' });
  });

  it('reports none when nothing dates the job', () => {
    expect(completionMoment(job())).toEqual({ kind: 'none', ms: null });
  });

  it('ignores an unparseable timestamp instead of producing NaN', () => {
    expect(completionMoment(job({ work_completed_at: 'not a date', end_date: '2026-08-05' })))
      .toMatchObject({ kind: 'date' });
  });
});

describe('sortByCompletion', () => {
  const a = job({ job_number: 'A', work_completed_at: '2026-08-18T14:47:06Z' });
  const b = job({ job_number: 'B', completion_submitted_at: '2026-08-12T14:35:06Z' });
  const c = job({ job_number: 'C', end_date: '2026-07-21' });
  const undated = job({ job_number: 'Z' });

  it('defaults to newest first', () => {
    expect(sortByCompletion([c, a, b]).map((j) => j.job_number)).toEqual(['A', 'B', 'C']);
  });

  it('reverses on request', () => {
    expect(sortByCompletion([a, c, b], 'oldest').map((j) => j.job_number)).toEqual(['C', 'B', 'A']);
  });

  it('pins undated jobs LAST in both directions', () => {
    expect(sortByCompletion([undated, a, b], 'newest').map((j) => j.job_number)).toEqual(['A', 'B', 'Z']);
    expect(sortByCompletion([undated, a, b], 'oldest').map((j) => j.job_number)).toEqual(['B', 'A', 'Z']);
  });

  it('breaks ties by job number so the order is stable', () => {
    const x = job({ job_number: 'X', work_completed_at: '2026-08-18T14:47:06Z' });
    const y = job({ job_number: 'Y', work_completed_at: '2026-08-18T14:47:06Z' });
    expect(sortByCompletion([y, x]).map((j) => j.job_number)).toEqual(['X', 'Y']);
  });

  it('does not mutate the input array', () => {
    const input = [c, a, b];
    sortByCompletion(input);
    expect(input.map((j) => j.job_number)).toEqual(['C', 'A', 'B']);
  });

  it('compares timestamp jobs against date-only jobs on the same scale', () => {
    const sameDayStamp = job({ job_number: 'S', work_completed_at: '2026-07-21T19:03:23Z' });
    const older = job({ job_number: 'O', end_date: '2026-07-01' });
    expect(sortByCompletion([older, sameDayStamp]).map((j) => j.job_number)).toEqual(['S', 'O']);
  });
});

describe('isSortDirection', () => {
  it('accepts only the two directions', () => {
    expect(isSortDirection('newest')).toBe(true);
    expect(isSortDirection('oldest')).toBe(true);
    expect(isSortDirection('sideways')).toBe(false);
    expect(isSortDirection(null)).toBe(false);
  });
});
