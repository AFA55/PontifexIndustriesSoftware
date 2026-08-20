import {
  parseJobQuery,
  rankJobResults,
  mergeJobResults,
  sanitizeSearchText,
  canSearchJobs,
  JOB_NUMBER_PREFIXES,
  JOB_SEARCH_ROLES,
  type JobSearchResult,
} from './job-search';
import { SALES_STAFF_ROLES } from './api-auth';

describe('canSearchJobs — who sees the header search box', () => {
  it('matches the roles the search API admits', () => {
    // The box must not appear for anyone the API refuses, and must not be
    // hidden from anyone it admits. If `requireSalesStaff` changes, this fails
    // here rather than as a 403 in a dropdown.
    expect([...JOB_SEARCH_ROLES].sort()).toEqual([...SALES_STAFF_ROLES].sort());
  });

  it.each(['admin', 'super_admin', 'operations_manager', 'supervisor', 'salesman'])(
    'admits %s',
    (role) => {
      expect(canSearchJobs(role)).toBe(true);
    }
  );

  it.each(['shop_manager', 'shop_help', 'operator', 'apprentice', 'inventory_manager'])(
    'refuses %s — the job-detail page would bounce them on click',
    (role) => {
      expect(canSearchJobs(role)).toBe(false);
    }
  );

  it.each([null, undefined, ''])('refuses %p rather than failing open', (role) => {
    expect(canSearchJobs(role as string | null | undefined)).toBe(false);
  });
});

describe('parseJobQuery — the four production prefixes', () => {
  it.each([
    ['JOB-2026-793440', 'JOB'],
    ['QA-2026-122769', 'QA'],
    ['TEST-2026-000101', 'TEST'],
    ['DEMO-2026-000002', 'DEMO'],
  ])('recognises %s as prefix %s', (input, prefix) => {
    const p = parseJobQuery(input);
    expect(p.prefix).toBe(prefix);
    expect(p.isJobNumberLike).toBe(true);
    expect(p.jobNumberPattern.startsWith(`${prefix}-`)).toBe(true);
  });

  it('covers every prefix the module declares', () => {
    for (const prefix of JOB_NUMBER_PREFIXES) {
      expect(parseJobQuery(`${prefix}-2026-000001`).prefix).toBe(prefix);
    }
  });

  it('anchors a prefixed query to that prefix so QA does not return JOB', () => {
    // Both JOB-2026-122769 and QA-2026-122769 could exist; typing QA means QA.
    expect(parseJobQuery('QA-122769').jobNumberPattern).toBe('QA-%122769%');
  });
});

describe('parseJobQuery — how a person actually types a job number', () => {
  it('accepts the bare six-digit tail read off a ticket', () => {
    const p = parseJobQuery('793440');
    expect(p.prefix).toBeNull();
    expect(p.isJobNumberLike).toBe(true);
    // Unanchored, so it finds the job whatever prefix it carries.
    expect(p.jobNumberPattern).toBe('%793440%');
  });

  it('accepts year-and-tail without a prefix', () => {
    expect(parseJobQuery('2026-793440').jobNumberPattern).toBe('%2026-793440%');
  });

  it('accepts lowercase — a phone keyboard auto-lowercases', () => {
    const lower = parseJobQuery('job-2026-793440');
    const upper = parseJobQuery('JOB-2026-793440');
    expect(lower.prefix).toBe('JOB');
    expect(lower.normalized).toBe('JOB-2026-793440');
    expect(lower.jobNumberPattern).toBe(upper.jobNumberPattern);
  });

  it.each([
    ['qa-2026-122769', 'QA'],
    ['test-2026-000101', 'TEST'],
    ['demo-2026-000002', 'DEMO'],
  ])('accepts lowercase %s', (input, prefix) => {
    expect(parseJobQuery(input).prefix).toBe(prefix);
  });

  it('treats spaces, underscores and slashes as the dash separator', () => {
    for (const input of ['job 2026 793440', 'JOB_2026_793440', 'job/2026/793440', 'JOB--2026--793440']) {
      expect(parseJobQuery(input).normalized).toBe('JOB-2026-793440');
    }
  });

  it('tolerates surrounding whitespace from a paste', () => {
    expect(parseJobQuery('  JOB-2026-793440 \n').normalized).toBe('JOB-2026-793440');
  });

  it('does not require a digit shape — JOB-2026-MYTEST is a real production row', () => {
    const p = parseJobQuery('JOB-2026-MYTEST');
    expect(p.prefix).toBe('JOB');
    expect(p.jobNumberPattern).toBe('JOB-%2026-MYTEST%');
  });

  it('handles a prefix typed on its own', () => {
    expect(parseJobQuery('QA').jobNumberPattern).toBe('QA-%');
  });

  it('returns an empty parse for an empty query rather than a match-everything pattern', () => {
    for (const input of ['', '   ', '%%%']) {
      const p = parseJobQuery(input);
      expect(p.normalized).toBe('');
      expect(p.jobNumberPattern).toBe('');
      expect(p.isJobNumberLike).toBe(false);
    }
  });

  it('does not call a short customer name a job number', () => {
    expect(parseJobQuery('Sterling').isJobNumberLike).toBe(false);
    expect(parseJobQuery('NC&E').isJobNumberLike).toBe(false);
  });
});

describe('sanitizeSearchText', () => {
  it('strips SQL LIKE wildcards so a query cannot match the whole table', () => {
    expect(sanitizeSearchText('100%_complete')).toBe('100complete');
    expect(sanitizeSearchText('a\\b')).toBe('ab');
  });

  it('strips `*`, which PostgREST reads as `%` inside an ilike value', () => {
    // `*` is not a SQL wildcard, which is why it survived the first pass of this
    // sanitizer — but PostgREST maps it to `%` for `ilike`, and it sits in the
    // x-www-form-urlencoded safe set so `URLSearchParams` sends it through
    // unencoded. `**` would otherwise arrive at the database as `%%%%`.
    expect(sanitizeSearchText('**')).toBe('');
    expect(sanitizeSearchText('Ster*ling')).toBe('Sterling');
    expect(parseJobQuery('Ster*ling').textPattern).toBe('%Sterling%');
  });

  it('strips `*` on the job-number path too, not just the free-text one', () => {
    // The job-number pattern is built by `normalizeJobNumber`, which runs its
    // own strip. A bare `**` must not become the pattern `%**%`.
    expect(parseJobQuery('**').normalized).toBe('');
    expect(parseJobQuery('**').jobNumberPattern).toBe('');
    expect(parseJobQuery('JOB-*').jobNumberPattern).toBe('JOB-%');
    expect(parseJobQuery('79*3440').jobNumberPattern).toBe('%793440%');
  });

  it('keeps commas and parentheses — addresses have them', () => {
    expect(sanitizeSearchText('123 Main St, Boston (rear)')).toBe('123 Main St, Boston (rear)');
  });

  it('builds an unanchored text pattern for free-text columns', () => {
    expect(parseJobQuery('Sterling').textPattern).toBe('%Sterling%');
  });
});

describe('mergeJobResults', () => {
  const row = (id: string, job_number: string) => ({
    id,
    job_number,
    customer_name: 'Sterling',
    project_name: null,
    address: null,
    status: 'scheduled',
    scheduled_date: '2026-08-19',
  });

  it('keeps the strongest match reason when a job appears in two groups', () => {
    const merged = mergeJobResults([
      { matched_on: 'customer', rows: [row('a', 'JOB-2026-1')] },
      { matched_on: 'job_number', rows: [row('a', 'JOB-2026-1')] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].matched_on).toBe('job_number');
  });

  it('does not let a weaker group overwrite a stronger one already seen', () => {
    const merged = mergeJobResults([
      { matched_on: 'job_number', rows: [row('a', 'JOB-2026-1')] },
      { matched_on: 'address', rows: [row('a', 'JOB-2026-1')] },
    ]);
    expect(merged[0].matched_on).toBe('job_number');
  });
});

describe('rankJobResults', () => {
  const make = (
    id: string,
    job_number: string,
    matched_on: JobSearchResult['matched_on'],
    scheduled_date: string | null = '2026-08-19'
  ): JobSearchResult => ({
    id,
    job_number,
    customer_name: null,
    project_name: null,
    address: null,
    status: 'scheduled',
    scheduled_date,
    matched_on,
  });

  it('puts an exact job-number match first', () => {
    const parsed = parseJobQuery('JOB-2026-793440');
    const ranked = rankJobResults(parsed, [
      make('a', 'JOB-2026-793441', 'job_number'),
      make('b', 'JOB-2026-793440', 'job_number'),
    ]);
    expect(ranked[0].id).toBe('b');
  });

  it('orders job number above customer above address', () => {
    const parsed = parseJobQuery('Sterling');
    const ranked = rankJobResults(parsed, [
      make('addr', 'JOB-2026-3', 'address'),
      make('cust', 'JOB-2026-2', 'customer'),
      make('num', 'JOB-2026-1', 'job_number'),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['num', 'cust', 'addr']);
  });

  it('breaks ties on the most recent scheduled date, comparing bare strings', () => {
    const parsed = parseJobQuery('Sterling');
    const ranked = rankJobResults(parsed, [
      make('old', 'JOB-2026-1', 'customer', '2026-03-01'),
      make('new', 'JOB-2026-2', 'customer', '2026-08-19'),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['new', 'old']);
  });

  it('sorts a null scheduled_date last without throwing', () => {
    const parsed = parseJobQuery('Sterling');
    const ranked = rankJobResults(parsed, [
      make('nodate', 'JOB-2026-1', 'customer', null),
      make('dated', 'JOB-2026-2', 'customer', '2026-01-02'),
    ]);
    expect(ranked[0].id).toBe('dated');
  });

  it('does not mutate the input array', () => {
    const parsed = parseJobQuery('Sterling');
    const input = [make('b', 'JOB-2026-2', 'address'), make('a', 'JOB-2026-1', 'job_number')];
    const copy = [...input];
    rankJobResults(parsed, input);
    expect(input).toEqual(copy);
  });
});
