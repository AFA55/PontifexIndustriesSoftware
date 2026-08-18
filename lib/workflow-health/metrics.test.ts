/**
 * Metric computation tests.
 *
 * The rule these enforce, metric by metric: a check that CANNOT run must never
 * be mistaken for a check that ran and found zero. Every metric therefore gets
 * three tests — a normal case, an empty-window case, and a
 * data-source-throws case — and the last one asserts `value === null`, because
 * the entire class of bug this feature exists to end is a dashboard confidently
 * rendering 0% off a select that failed.
 *
 * The "normal case" numbers are the REAL production figures measured against
 * project klatddoyncxidgqtcjnu on 2026-08-17, so if a definition silently drifts
 * away from what was actually verified, these fail.
 */

import {
  WORKFLOW_METRICS,
  COMPLETION_SAMPLE_SIZE,
  hasSignatureArtifact,
  formatMetricValue,
  metricByKey,
  shiftYMD,
} from './metrics';
import { runMetric, evaluateStatus } from './runner';
import type {
  AgingJobRow,
  CloseoutRow,
  CompletedJobRow,
  CrewRow,
  HealthDataSource,
  MetricContext,
  TimecardRow,
} from './types';

const CTX: MetricContext = {
  tenantId: 'tenant-a',
  todayYMD: '2026-08-17',
  timezone: 'America/New_York',
};

function job(overrides: Partial<CompletedJobRow> = {}): CompletedJobRow {
  return {
    id: `job-${Math.random().toString(36).slice(2)}`,
    job_number: 'JOB-2026-000001',
    customer_signature: null,
    completion_signature: null,
    completion_signature_url: null,
    completion_signed_at: null,
    office_completed_at: null,
    work_completed_at: '2026-08-15T12:00:00Z',
    ...overrides,
  };
}

/** A source where every method returns nothing — the empty-window baseline. */
function emptySource(): HealthDataSource {
  return {
    async recentCompletedJobs() {
      return [];
    },
    async recentCloseouts() {
      return [];
    },
    async recentTimecards() {
      return [];
    },
    async unassignedAgingJobs() {
      return [];
    },
    async activeCrew() {
      return [];
    },
  };
}

function sourceWith(partial: Partial<HealthDataSource>): HealthDataSource {
  return { ...emptySource(), ...partial };
}

/** Every method throws — stands in for a bad column name, a timeout, an outage. */
function brokenSource(message = 'column job_orders.nope does not exist'): HealthDataSource {
  const boom = async (): Promise<never> => {
    throw new Error(message);
  };
  return {
    recentCompletedJobs: boom,
    recentCloseouts: boom,
    recentTimecards: boom,
    unassignedAgingJobs: boom,
    activeCrew: boom,
  };
}

// ── The registry itself ─────────────────────────────────────────────────────

describe('the metric registry', () => {
  it('has unique keys, so history rows can never be attributed to two metrics', () => {
    const keys = WORKFLOW_METRICS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every metric a plain-English sentence and a next action', () => {
    for (const m of WORKFLOW_METRICS) {
      expect(m.action.length).toBeGreaterThan(10);
      expect(m.why.length).toBeGreaterThan(10);
      expect(m.href.startsWith('/dashboard')).toBe(true);
    }
  });

  it('keeps ratio thresholds inside 0..1 so a percentage can actually cross them', () => {
    for (const m of WORKFLOW_METRICS.filter((x) => x.unit === 'ratio')) {
      expect(m.threshold).toBeGreaterThan(0);
      expect(m.threshold).toBeLessThanOrEqual(1);
    }
  });
});

describe('every metric, when its data source fails', () => {
  it.each(WORKFLOW_METRICS.map((m) => [m.key, m] as const))(
    '%s reports unknown/error with a NULL value — never zero',
    async (_key, def) => {
      const result = await runMetric(def, brokenSource(), CTX);

      expect(result.status).toBe('unknown');
      expect(result.unknownReason).toBe('error');
      // The assertion that matters. A 0 here is the silent failure.
      expect(result.value).toBeNull();
      expect(result.error).toContain('does not exist');
      expect(result.sentence).toContain('Could not measure');
      expect(result.sentence).toContain('NOT zero');
    }
  );
});

// ── 1. Signed completions ───────────────────────────────────────────────────

describe('signed_completions', () => {
  const def = metricByKey('signed_completions')!;

  it('matches the production reading of 2026-08-17: 3 of 15, with 4 phantom claims', async () => {
    const jobs = [
      // Three with a real artifact — one of which has ONLY the stored URL,
      // which is exactly why all three columns are checked.
      job({ customer_signature: 'data:image/png;base64,AAA', completion_signed_at: 'ts' }),
      job({ completion_signature: 'data:image/png;base64,BBB', completion_signed_at: 'ts' }),
      job({ completion_signature_url: 'https://x/sig.png', completion_signed_at: 'ts' }),
      // Four claiming a signature with nothing behind it. The dangerous set.
      ...Array.from({ length: 4 }, () => job({ completion_signed_at: 'ts' })),
      // Eight that never claimed anything.
      ...Array.from({ length: 8 }, () => job()),
    ];
    const result = await runMetric(def, sourceWith({ recentCompletedJobs: async () => jobs }), CTX);

    expect(result.numerator).toBe(3);
    expect(result.denominator).toBe(15);
    expect(result.value).toBeCloseTo(0.2);
    expect(result.status).toBe('breach');
    expect(result.detail.phantomSignatures).toBe(4);
    expect(result.sentence).toBe(
      'Only 3 of 15 of the last finished jobs have a customer signature on file. ' +
        '4 more say they were signed but have nothing attached.'
    );
  });

  it('drops the phantom sentence when every claim is backed by an artifact', async () => {
    const jobs = [job({ customer_signature: 'sig', completion_signed_at: 'ts' })];
    const result = await runMetric(def, sourceWith({ recentCompletedJobs: async () => jobs }), CTX);

    expect(result.status).toBe('ok');
    expect(result.sentence).toBe('All 1 of the last 1 finished job has a customer signature on file.');
  });

  it('treats a whitespace-only signature as no signature', () => {
    expect(hasSignatureArtifact(job({ customer_signature: '   ' }))).toBe(false);
    expect(hasSignatureArtifact(job({ customer_signature: 'x' }))).toBe(true);
  });

  it('says "no data" rather than 0% when no jobs have been finished at all', async () => {
    const result = await runMetric(def, emptySource(), CTX);

    expect(result.status).toBe('unknown');
    expect(result.unknownReason).toBe('no_data');
    expect(result.value).toBeNull();
  });

  it('asks for only the sample size, so a busy tenant cannot pull the whole table', async () => {
    const spy = jest.fn(async () => [] as CompletedJobRow[]);
    await runMetric(def, sourceWith({ recentCompletedJobs: spy }), CTX);
    expect(spy).toHaveBeenCalledWith('tenant-a', COMPLETION_SAMPLE_SIZE);
  });
});

// ── 2. Stalled after closeout ───────────────────────────────────────────────

describe('stalled_after_closeout', () => {
  const def = metricByKey('stalled_after_closeout')!;

  function closeout(jobId: string, status: string | null, num = 'JOB-2026-111111'): CloseoutRow {
    return { job_order_id: jobId, log_date: '2026-08-15', job_status: status, job_number: num };
  }

  it('counts the JOB once even when the crew closed it out on several days', async () => {
    const rows = [
      closeout('j1', 'scheduled'),
      closeout('j1', 'scheduled'),
      closeout('j1', 'scheduled'),
      closeout('j2', 'completed'),
    ];
    const result = await runMetric(def, sourceWith({ recentCloseouts: async () => rows }), CTX);

    // Not 3-of-4: a five-day job must not swamp the ratio with its own stall.
    expect(result.numerator).toBe(1);
    expect(result.denominator).toBe(2);
  });

  it('flags the founder-described case: "Done for Today" left the job scheduled', async () => {
    const rows = [
      closeout('j1', 'scheduled', 'JOB-2026-929434'),
      closeout('j2', 'assigned', 'JOB-2026-124747'),
      closeout('j3', 'completed'),
    ];
    const result = await runMetric(def, sourceWith({ recentCloseouts: async () => rows }), CTX);

    expect(result.status).toBe('breach');
    expect(result.sentence).toContain('2 of 3 jobs the crew closed out in the last 14 days');
    expect(result.sentence).toContain('JOB-2026-929434');
    expect(result.sentence).toContain('will never invoice');
  });

  it('reads healthy without claiming the jobs are FINISHED', async () => {
    // The all-clear used to say every closed-out job "moved forward
    // afterwards". Production has 3 on_hold and 2 in_progress behind that
    // sentence — moved on, but not invoiced. The zero branch may only claim
    // the narrow thing this metric actually measures.
    const rows = [closeout('j1', 'completed'), closeout('j2', 'in_progress')];
    const result = await runMetric(def, sourceWith({ recentCloseouts: async () => rows }), CTX);

    expect(result.status).toBe('ok');
    expect(result.sentence).toContain('still sitting where the crew left them');
    expect(result.sentence).toContain('1 is still open');
    expect(result.sentence).not.toContain('moved forward');
  });

  it('drops the still-open clause when every closeout really did finish', async () => {
    const rows = [closeout('j1', 'completed'), closeout('j2', 'completed')];
    const result = await runMetric(def, sourceWith({ recentCloseouts: async () => rows }), CTX);

    expect(result.sentence).toBe(
      'None of the 2 jobs the crew closed out in the last 14 days are still sitting where the crew left them.'
    );
  });

  it('reports no data for a fortnight with no closeouts at all', async () => {
    const result = await runMetric(def, emptySource(), CTX);
    expect(result.unknownReason).toBe('no_data');
    expect(result.value).toBeNull();
  });
});

// ── 3. Timecards tagged to a job ────────────────────────────────────────────

describe('timecards_tagged_to_job', () => {
  const def = metricByKey('timecards_tagged_to_job')!;

  it('matches production: 61 of 140 tagged in the last 30 days', async () => {
    // 140, not 298. 298 is the all-time timecard count; this metric reads a
    // 30-day window, and a fixture built from the wrong figure quietly makes
    // the test agree with a number the code never produces.
    const cards: TimecardRow[] = [
      ...Array.from({ length: 61 }, (_, i) => ({ id: `t${i}`, job_order_id: 'j1' })),
      ...Array.from({ length: 79 }, (_, i) => ({ id: `u${i}`, job_order_id: null })),
    ];
    const result = await runMetric(def, sourceWith({ recentTimecards: async () => cards }), CTX);

    expect(result.value).toBeCloseTo(61 / 140);
    expect(result.status).toBe('breach');
    expect(result.sentence).toContain('Only 61 of 140 timecards');
    expect(result.sentence).toContain('other 79 have to be matched to a job by hand');
  });

  it('reports no data for an empty month rather than a 0% catastrophe', async () => {
    const result = await runMetric(def, emptySource(), CTX);
    expect(result.status).toBe('unknown');
    expect(result.value).toBeNull();
  });
});

// ── 4. Unassigned aging jobs ────────────────────────────────────────────────

describe('unassigned_aging_jobs', () => {
  const def = metricByKey('unassigned_aging_jobs')!;

  it('counts them and names a few, so the founder can go straight to one', async () => {
    const jobs: AgingJobRow[] = [
      { id: 'a', job_number: 'JOB-2026-001', scheduled_date: '2026-08-01' },
      { id: 'b', job_number: 'JOB-2026-002', scheduled_date: '2026-08-02' },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `x${i}`,
        job_number: `QA-2026-00${i}`,
        scheduled_date: '2026-08-03',
      })),
    ];
    const result = await runMetric(def, sourceWith({ unassignedAgingJobs: async () => jobs }), CTX);

    expect(result.value).toBe(8);
    expect(result.status).toBe('breach');
    expect(result.sentence).toContain('8 live jobs have nobody assigned');
    expect(result.sentence).toContain('more than 3 days past their scheduled date');
    expect(result.sentence).toContain('JOB-2026-001');
  });

  it('does not claim a never-scheduled job is "past its scheduled date"', async () => {
    // The query deliberately includes scheduled_date IS NULL. The sentence has
    // to match the query, or the founder goes looking for a date that is not
    // there. Zero such jobs at Patriot today — the wording still has to be true.
    const jobs: AgingJobRow[] = [
      { id: 'a', job_number: 'JOB-2026-001', scheduled_date: '2026-08-01' },
      { id: 'b', job_number: 'JOB-2026-002', scheduled_date: null },
      { id: 'c', job_number: 'JOB-2026-003', scheduled_date: null },
    ];
    const result = await runMetric(def, sourceWith({ unassignedAgingJobs: async () => jobs }), CTX);

    expect(result.sentence).toContain('1 more than 3 days past its scheduled date');
    expect(result.sentence).toContain('2 with no date at all');
  });

  it('says so plainly when every one of them was never scheduled', async () => {
    const jobs: AgingJobRow[] = [{ id: 'a', job_number: 'QA-2026-001', scheduled_date: null }];
    const result = await runMetric(def, sourceWith({ unassignedAgingJobs: async () => jobs }), CTX);

    expect(result.sentence).toContain('no scheduled date at all');
    expect(result.sentence).not.toContain('past');
  });

  it('treats ZERO as a real, healthy measurement — not as an empty window', async () => {
    // The distinction that makes count metrics different from ratio metrics: a
    // count of zero is the answer, not the absence of one.
    const result = await runMetric(def, emptySource(), CTX);

    expect(result.status).toBe('ok');
    expect(result.value).toBe(0);
    expect(result.unknownReason).toBeNull();
    expect(result.sentence).toBe(
      'No live jobs are sitting unassigned — none past their scheduled date, and none without one.'
    );
  });
});

// ── 5. Crew pay-rate coverage ───────────────────────────────────────────────

describe('crew_pay_rate_coverage', () => {
  const def = metricByKey('crew_pay_rate_coverage')!;

  it('matches production: 2 of 15 who filed hours in the window have a rate', async () => {
    // 15, not 13. Eighteen people filed a timecard in the last 90 days; three
    // are deleted profiles. The other two — Javi and David — are switched off
    // but NOT deleted, and filtering them out was hiding exactly the people
    // whose hours cost $0. See the data-source test that pins the query.
    const crew: CrewRow[] = [
      { id: 'c1', full_name: 'Paid One', hourly_rate: 32 },
      { id: 'c2', full_name: 'Paid Two', hourly_rate: 28 },
      ...Array.from({ length: 13 }, (_, i) => ({
        id: `n${i}`,
        full_name: `Unpaid ${i}`,
        hourly_rate: null,
      })),
    ];
    const result = await runMetric(def, sourceWith({ activeCrew: async () => crew }), CTX);

    expect(result.numerator).toBe(2);
    expect(result.denominator).toBe(15);
    expect(result.status).toBe('breach');
    expect(result.sentence).toContain('Only 2 of 15 crew who worked in the last 90 days');
    expect(result.sentence).toContain('$0 for the other 13');
  });

  it('does not accept a rate of zero as a rate', async () => {
    const crew: CrewRow[] = [{ id: 'c1', full_name: 'Zero', hourly_rate: 0 }];
    const result = await runMetric(def, sourceWith({ activeCrew: async () => crew }), CTX);
    expect(result.numerator).toBe(0);
  });

  it('reports no data for a tenant with nobody on the tools yet', async () => {
    const result = await runMetric(def, emptySource(), CTX);
    expect(result.unknownReason).toBe('no_data');
    expect(result.value).toBeNull();
  });
});

// ── 6. Unaccounted completions ──────────────────────────────────────────────

describe('unaccounted_completions', () => {
  const def = metricByKey('unaccounted_completions')!;

  it('counts only jobs closed by NO path at all', async () => {
    const jobs = [
      job({ customer_signature: 'sig' }), // signed — accounted for
      job({ office_completed_at: '2026-08-16T10:00:00Z' }), // office closed — a legitimate path
      job({ completion_signed_at: 'ts' }), // claims a signature — counted by metric 1, not here
      job(), // nothing at all
      job(), // nothing at all
    ];
    const result = await runMetric(def, sourceWith({ recentCompletedJobs: async () => jobs }), CTX);

    expect(result.value).toBe(2);
    expect(result.status).toBe('ok'); // threshold is 2, and 2 is not > 2
    expect(result.sentence).toContain('2 of 5 of the last finished jobs were closed with no signature');
  });

  it('breaches at the production reading of 8', async () => {
    const jobs = Array.from({ length: 15 }, (_, i) =>
      i < 8 ? job() : job({ customer_signature: 'sig' })
    );
    const result = await runMetric(def, sourceWith({ recentCompletedJobs: async () => jobs }), CTX);

    expect(result.value).toBe(8);
    expect(result.status).toBe('breach');
  });

  it('says no data — not "all clear" — when nothing has been completed', async () => {
    // A count of zero would read as a clean bill of health here, which would be
    // a lie: there is simply nothing to judge. The denominator makes it honest.
    const result = await runMetric(def, emptySource(), CTX);

    expect(result.status).toBe('unknown');
    expect(result.unknownReason).toBe('no_data');
    expect(result.value).toBeNull();
  });
});

// ── Shared helpers ──────────────────────────────────────────────────────────

describe('evaluateStatus', () => {
  const higher = WORKFLOW_METRICS.find((m) => m.direction === 'higher_is_better')!;
  const lower = WORKFLOW_METRICS.find((m) => m.direction === 'lower_is_better')!;

  it('breaches below the threshold when higher is better', () => {
    expect(evaluateStatus(higher, higher.threshold - 0.01, 10).status).toBe('breach');
    expect(evaluateStatus(higher, higher.threshold, 10).status).toBe('ok');
  });

  it('breaches above the threshold when lower is better', () => {
    expect(evaluateStatus(lower, lower.threshold + 0.01, 10).status).toBe('breach');
    expect(evaluateStatus(lower, lower.threshold, 10).status).toBe('ok');
  });

  it('turns an empty denominator into no_data, never into a score', () => {
    expect(evaluateStatus(higher, 0, 0)).toEqual({ status: 'unknown', unknownReason: 'no_data' });
  });

  it('leaves count metrics (no denominator) free to report a genuine zero', () => {
    expect(evaluateStatus(lower, 0, null).status).toBe('ok');
  });
});

describe('formatMetricValue', () => {
  it('shows the fraction next to the percentage so the number can be checked', () => {
    expect(formatMetricValue('ratio', 0.2, 3, 15)).toBe('20% (3 of 15)');
  });

  it('renders a count bare', () => {
    expect(formatMetricValue('count', 8, 8, null)).toBe('8');
  });
});

describe('shiftYMD', () => {
  it('stays on the intended calendar day (the recurring timezone bug)', () => {
    // new Date('2026-08-17') parses as UTC midnight and renders as Aug 16 in
    // every US timezone. shiftYMD must not have that behaviour.
    expect(shiftYMD('2026-08-17', -14)).toBe('2026-08-03');
    expect(shiftYMD('2026-08-17', 0)).toBe('2026-08-17');
  });

  it('crosses month and year boundaries correctly', () => {
    expect(shiftYMD('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftYMD('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftYMD('2024-03-01', -1)).toBe('2024-02-29'); // leap year
  });
});
