import { crewTimecardSpan, groupCrewTimecards, CrewTimecardRow } from './crew-timecards';

describe('crewTimecardSpan', () => {
  it('returns null without a scheduled_date', () => {
    expect(crewTimecardSpan({ scheduled_date: null }, '2026-08-02')).toBeNull();
  });

  it('single-day completed job spans just that day', () => {
    expect(
      crewTimecardSpan(
        { scheduled_date: '2026-07-01', status: 'completed' },
        '2026-08-02'
      )
    ).toEqual({ from: '2026-07-01', to: '2026-07-01' });
  });

  it('uses the latest of end_date / scheduled_end_date / actual_end_date', () => {
    expect(
      crewTimecardSpan(
        {
          scheduled_date: '2026-07-01',
          end_date: '2026-07-03',
          scheduled_end_date: '2026-07-02',
          actual_end_date: '2026-07-05',
          status: 'completed',
        },
        '2026-08-02'
      )
    ).toEqual({ from: '2026-07-01', to: '2026-07-05' });
  });

  it('extends an ACTIVE job running past its end date to today', () => {
    expect(
      crewTimecardSpan(
        { scheduled_date: '2026-07-28', end_date: '2026-07-30', status: 'in_progress' },
        '2026-08-02'
      )
    ).toEqual({ from: '2026-07-28', to: '2026-08-02' });
  });

  it('does NOT extend a completed job to today', () => {
    expect(
      crewTimecardSpan(
        { scheduled_date: '2026-07-28', end_date: '2026-07-30', status: 'completed' },
        '2026-08-02'
      )
    ).toEqual({ from: '2026-07-28', to: '2026-07-30' });
  });

  it('never lets a malformed end before the start shrink the span', () => {
    expect(
      crewTimecardSpan(
        { scheduled_date: '2026-07-10', end_date: '2026-07-01', status: 'completed' },
        '2026-08-02'
      )
    ).toEqual({ from: '2026-07-10', to: '2026-07-10' });
  });

  it('active future job (today before start) keeps the scheduled span', () => {
    expect(
      crewTimecardSpan(
        { scheduled_date: '2026-08-10', end_date: '2026-08-11', status: 'scheduled' },
        '2026-08-02'
      )
    ).toEqual({ from: '2026-08-10', to: '2026-08-11' });
  });
});

describe('groupCrewTimecards', () => {
  const JOB = 'job-1';
  const names = new Map<string, string | null>([
    ['u1', 'Alice Lead'],
    ['u2', 'Bob Op'],
  ]);

  const row = (over: Partial<CrewTimecardRow>): CrewTimecardRow => ({
    user_id: 'u1',
    date: '2026-08-01',
    clock_in_time: '2026-08-01T12:00:00Z',
    clock_out_time: '2026-08-01T20:00:00Z',
    total_hours: 8,
    job_order_id: JOB,
    ...over,
  });

  it('groups by date ascending and resolves names', () => {
    const days = groupCrewTimecards(
      [row({ date: '2026-08-02' }), row({ user_id: 'u2', date: '2026-08-01' })],
      names,
      JOB
    );
    expect(days.map((d) => d.date)).toEqual(['2026-08-01', '2026-08-02']);
    expect(days[0].entries[0].full_name).toBe('Bob Op');
  });

  it('flags cards not linked to this job as day cards (job_linked=false)', () => {
    const days = groupCrewTimecards(
      [row({ job_order_id: null }), row({ user_id: 'u2', job_order_id: 'other-job' })],
      names,
      JOB
    );
    expect(days[0].entries.every((e) => e.job_linked === false)).toBe(true);
  });

  it('sorts job-linked cards before day cards, then by clock-in', () => {
    const days = groupCrewTimecards(
      [
        row({ user_id: 'u2', job_order_id: null, clock_in_time: '2026-08-01T10:00:00Z' }),
        row({ user_id: 'u1', clock_in_time: '2026-08-01T13:00:00Z' }),
        row({ user_id: 'u2', clock_in_time: '2026-08-01T11:00:00Z' }),
      ],
      names,
      JOB
    );
    expect(days[0].entries.map((e) => [e.user_id, e.job_linked])).toEqual([
      ['u2', true],
      ['u1', true],
      ['u2', false],
    ]);
  });

  it('handles unknown users and null clock fields without throwing', () => {
    const days = groupCrewTimecards(
      [row({ user_id: 'ghost', clock_in_time: null, clock_out_time: null, total_hours: null })],
      names,
      JOB
    );
    expect(days[0].entries[0]).toMatchObject({
      full_name: null,
      clock_in_time: null,
      job_linked: true,
    });
  });

  it('skips rows with a missing date', () => {
    expect(groupCrewTimecards([row({ date: '' })], names, JOB)).toEqual([]);
  });
});
