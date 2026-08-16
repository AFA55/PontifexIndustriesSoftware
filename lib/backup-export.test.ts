import {
  BACKUP_EXCLUDED_TABLES,
  backupObjectKey,
  toNdjson,
  storageBudgetExhausted,
} from './backup-export';

const excluded = (t: string) => BACKUP_EXCLUDED_TABLES.some((re) => re.test(t));

describe('BACKUP_EXCLUDED_TABLES', () => {
  it('keeps every table that holds money or evidence', () => {
    // The backup this replaces named six tables by hand and left out
    // `timecards` — the payroll — for its entire existence. These must never
    // be excluded by a pattern added later.
    for (const t of [
      'timecards',
      'job_orders',
      'work_items',
      'daily_job_logs',
      'invoices',
      'customers',
      'profiles',
      'job_daily_assignments',
      'job_notes',
      'job_crew',
    ]) {
      expect(excluded(t)).toBe(false);
    }
  });

  it('skips ad-hoc rescue copies of live data', () => {
    expect(excluded('_work_items_backup_20260814')).toBe(true);
    expect(excluded('timecards_backup_20260801')).toBe(true);
  });

  it('skips high-volume telemetry nobody would restore', () => {
    expect(excluded('error_logs')).toBe(true);
    expect(excluded('login_attempts')).toBe(true);
  });

  it('does not exclude a real table just for containing the word log', () => {
    // `daily_job_logs` is the operator's day. An over-broad /log/ pattern here
    // would quietly drop it, which is exactly the failure mode being avoided.
    expect(excluded('daily_job_logs')).toBe(false);
    expect(excluded('audit_logs')).toBe(false);
    expect(excluded('backup_logs')).toBe(false);
  });
});

describe('backupObjectKey', () => {
  it('groups one run under one folder', () => {
    expect(backupObjectKey('20260816T031500', 'db/timecards.ndjson.gz')).toBe(
      'pontifex/20260816T031500/db/timecards.ndjson.gz'
    );
  });

  it('produces the run prefix when given an empty suffix', () => {
    expect(backupObjectKey('20260816T031500', '')).toBe('pontifex/20260816T031500/');
  });
});

describe('toNdjson', () => {
  it('writes one row per line', () => {
    expect(toNdjson([{ a: 1 }, { a: 2 }])).toBe('{"a":1}\n{"a":2}');
  });

  it('survives truncation — every complete line still parses', () => {
    // The reason NDJSON was chosen over one big array: a file cut short mid-
    // upload is still readable up to the last newline, where a truncated JSON
    // array is a syntax error and yields nothing at all.
    const full = toNdjson([{ a: 1 }, { a: 2 }, { a: 3 }]);
    const truncated = full.slice(0, full.lastIndexOf('\n'));
    const parsed = truncated.split('\n').map((l) => JSON.parse(l));
    expect(parsed).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('handles an empty table without producing a stray blank line', () => {
    expect(toNdjson([])).toBe('');
  });

  it('does not mangle newlines inside a value', () => {
    const line = toNdjson([{ notes: 'line one\nline two' }]);
    expect(line.split('\n')).toHaveLength(1);
    expect(JSON.parse(line).notes).toBe('line one\nline two');
  });
});

describe('storageBudgetExhausted', () => {
  it('is false with time to spare', () => {
    expect(storageBudgetExhausted(1_000, 240_000, 1_000 + 100_000)).toBe(false);
  });

  it('stops before the platform kills the function', () => {
    // A run killed at the hard limit writes NO log row, so it disappears
    // silently. Stopping early leaves time to record that it was partial.
    expect(storageBudgetExhausted(1_000, 240_000, 1_000 + 240_000)).toBe(true);
    expect(storageBudgetExhausted(1_000, 240_000, 1_000 + 300_000)).toBe(true);
  });
});
