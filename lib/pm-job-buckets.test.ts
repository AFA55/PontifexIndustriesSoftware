import { bucketPmJobs, pmJobBucketOf, type PmJob } from '@/lib/pm-job-buckets';

// Fixed calendar, no `new Date()` anywhere in this file:
//   Mon 2026-08-10 · Fri 2026-08-14 · SAT 2026-08-15 · Sun 2026-08-16 · Mon 2026-08-17
const MON = '2026-08-10';
const FRI = '2026-08-14';
const SAT = '2026-08-15';
const SUN = '2026-08-16';
const NEXT_MON = '2026-08-17';

function job(over: Partial<PmJob> = {}): PmJob {
  return {
    id: over.id ?? 'j1',
    job_number: 'JOB-2026-000001',
    customer_name: 'Acme',
    status: 'scheduled',
    scheduled_date: MON,
    end_date: null,
    ...over,
  };
}

describe('bucketPmJobs — the three piles', () => {
  it('puts a job that starts after today in UPCOMING', () => {
    const b = bucketPmJobs([job({ scheduled_date: NEXT_MON })], SAT);
    expect(b.upcoming).toHaveLength(1);
    expect(b.active).toHaveLength(0);
    expect(b.completed).toHaveLength(0);
  });

  it('puts a job that starts TODAY in ACTIVE, not upcoming (boundary)', () => {
    const b = bucketPmJobs([job({ scheduled_date: NEXT_MON })], NEXT_MON);
    expect(b.active.map((j) => j.id)).toEqual(['j1']);
    expect(b.upcoming).toHaveLength(0);
  });

  it('puts a job with no start date in UPCOMING', () => {
    const b = bucketPmJobs([job({ scheduled_date: null })], SAT);
    expect(b.upcoming).toHaveLength(1);
  });

  it('puts a completed job in COMPLETED whatever its dates say', () => {
    const b = bucketPmJobs(
      [job({ status: 'completed', scheduled_date: NEXT_MON })],
      SAT
    );
    expect(b.completed).toHaveLength(1);
    expect(b.upcoming).toHaveLength(0);
  });

  it('drops cancelled and archived jobs from every pile', () => {
    const b = bucketPmJobs(
      [
        job({ id: 'c', status: 'cancelled' }),
        job({ id: 'a', status: 'archived' }),
        job({ id: 'k', status: 'in_progress' }),
      ],
      MON
    );
    expect(b.upcoming).toHaveLength(0);
    expect(b.completed).toHaveLength(0);
    expect(b.active.map((j) => j.id)).toEqual(['k']);
  });
});

describe('bucketPmJobs — the weekend rule (jobRunsOn)', () => {
  const span = { scheduled_date: MON, end_date: '2026-08-21' };

  it('a Mon–Fri job is active AND worked on a weekday', () => {
    const b = bucketPmJobs([job(span)], NEXT_MON);
    expect(b.active[0].runs_today).toBe(true);
  });

  it('a Mon–Fri job stays ACTIVE on a Saturday but is not worked', () => {
    const b = bucketPmJobs([job(span)], SAT);
    expect(b.active).toHaveLength(1);
    expect(b.active[0].runs_today).toBe(false);
  });

  it('same on a Sunday', () => {
    expect(bucketPmJobs([job(span)], SUN).active[0].runs_today).toBe(false);
  });

  it('is worked on a Saturday when the job says it can work weekends', () => {
    const b = bucketPmJobs(
      [job({ ...span, scheduling_flexibility: { can_work_weekends: true } })],
      SAT
    );
    expect(b.active[0].runs_today).toBe(true);
  });

  it('a job deliberately SCHEDULED to start on a Saturday is worked that day', () => {
    const b = bucketPmJobs([job({ scheduled_date: SAT, end_date: '2026-08-21' })], SAT);
    expect(b.active[0].runs_today).toBe(true);
  });

  it('honours can_work_fridays: false', () => {
    const b = bucketPmJobs(
      [job({ ...span, scheduling_flexibility: { can_work_fridays: false } })],
      FRI
    );
    expect(b.active[0].runs_today).toBe(false);
  });

  it('keeps a job whose end date passed but was never closed out, flagged not-worked', () => {
    const b = bucketPmJobs(
      [job({ status: 'in_progress', scheduled_date: MON, end_date: '2026-08-12' })],
      NEXT_MON
    );
    expect(b.active).toHaveLength(1);
    expect(b.active[0].runs_today).toBe(false);
  });
});

describe('bucketPmJobs — ordering', () => {
  it('sorts upcoming soonest-first with undated jobs last', () => {
    const b = bucketPmJobs(
      [
        job({ id: 'late', scheduled_date: '2026-09-01' }),
        job({ id: 'none', scheduled_date: null }),
        job({ id: 'soon', scheduled_date: '2026-08-18' }),
      ],
      NEXT_MON
    );
    expect(b.upcoming.map((j) => j.id)).toEqual(['soon', 'late', 'none']);
  });

  it('sorts active soonest-started first', () => {
    const b = bucketPmJobs(
      [
        job({ id: 'newer', scheduled_date: '2026-08-13', end_date: '2026-08-20' }),
        job({ id: 'older', scheduled_date: '2026-08-10', end_date: '2026-08-20' }),
      ],
      NEXT_MON
    );
    expect(b.active.map((j) => j.id)).toEqual(['older', 'newer']);
  });

  it('sorts completed most-recently-finished first', () => {
    const b = bucketPmJobs(
      [
        job({ id: 'old', status: 'completed', completed_at: '2026-07-01T12:00:00Z' }),
        job({ id: 'new', status: 'completed', completed_at: '2026-08-12T12:00:00Z' }),
      ],
      SAT
    );
    expect(b.completed.map((j) => j.id)).toEqual(['new', 'old']);
  });

  it('falls back to the scheduled day when a completed job has no finish timestamp', () => {
    const b = bucketPmJobs(
      [
        job({ id: 'old', status: 'completed', scheduled_date: '2026-06-01' }),
        job({ id: 'new', status: 'completed', scheduled_date: '2026-08-01' }),
      ],
      SAT
    );
    expect(b.completed.map((j) => j.id)).toEqual(['new', 'old']);
  });
});

describe('pmJobBucketOf', () => {
  it('agrees with bucketPmJobs for one row', () => {
    expect(pmJobBucketOf(job({ scheduled_date: NEXT_MON }), SAT)).toBe('upcoming');
    expect(pmJobBucketOf(job({ scheduled_date: MON }), SAT)).toBe('active');
    expect(pmJobBucketOf(job({ status: 'completed' }), SAT)).toBe('completed');
    expect(pmJobBucketOf(job({ status: 'cancelled' }), SAT)).toBeNull();
  });
});
