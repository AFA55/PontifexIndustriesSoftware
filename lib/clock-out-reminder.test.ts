/**
 * Tests for the completion-aware smart clock-out reminder logic
 * (lib/clock-out-reminder.ts) — the fourth trigger in the
 * clock-out-reminders cron.
 */

import {
  MIN_REMINDER_DELAY_MINUTES,
  MAX_REMINDER_DELAY_MINUTES,
  reminderDelayMinutes,
  driveMinutesForJob,
  estimateDriveMinutesFromCoords,
  resolveCompletionInstant,
  isJobUnfinished,
  formatMinutesAgo,
  type ReminderJob,
} from './clock-out-reminder';

const job = (overrides: Partial<ReminderJob> = {}): ReminderJob => ({
  id: 'j1',
  job_number: 'JOB-2026-000001',
  status: 'in_progress',
  work_completed_at: null,
  drive_time: null,
  jobsite_latitude: null,
  jobsite_longitude: null,
  ...overrides,
});

describe('reminderDelayMinutes', () => {
  it('no drive data → base 30-minute delay', () => {
    expect(reminderDelayMinutes(null)).toBe(30);
    expect(reminderDelayMinutes(undefined)).toBe(30);
    expect(reminderDelayMinutes(0)).toBe(30);
  });
  it('short drive stays at the 30-minute floor (15 + 10 buffer < 30)', () => {
    expect(reminderDelayMinutes(15)).toBe(30);
    expect(reminderDelayMinutes(20)).toBe(30);
  });
  it('45-minute drive → 55 (drive + 10 buffer)', () => {
    expect(reminderDelayMinutes(45)).toBe(55);
  });
  it('very long drive clamps at 120', () => {
    expect(reminderDelayMinutes(200)).toBe(120);
    expect(reminderDelayMinutes(110)).toBe(120);
    expect(reminderDelayMinutes(115)).toBe(120);
  });
  it('garbage input falls back to the floor', () => {
    expect(reminderDelayMinutes(NaN)).toBe(MIN_REMINDER_DELAY_MINUTES);
    expect(reminderDelayMinutes(-30)).toBe(MIN_REMINDER_DELAY_MINUTES);
    expect(reminderDelayMinutes(Infinity)).toBe(MIN_REMINDER_DELAY_MINUTES);
  });
  it('never exceeds bounds', () => {
    for (const d of [0, 5, 30, 60, 90, 150, 500]) {
      const delay = reminderDelayMinutes(d);
      expect(delay).toBeGreaterThanOrEqual(MIN_REMINDER_DELAY_MINUTES);
      expect(delay).toBeLessThanOrEqual(MAX_REMINDER_DELAY_MINUTES);
    }
  });
});

describe('driveMinutesForJob', () => {
  const shop = { latitude: 40.0, longitude: -75.0 };
  it('prefers the scheduled drive_time column', () => {
    expect(driveMinutesForJob(job({ drive_time: 45 }), shop)).toBe(45);
  });
  it('falls back to a haversine estimate when coordinates exist', () => {
    // ~0.9 degrees of latitude ≈ 100 km ≈ 62 straight miles → well over an hour
    const j = job({ jobsite_latitude: 40.9, jobsite_longitude: -75.0 });
    const mins = driveMinutesForJob(j, shop);
    expect(mins).not.toBeNull();
    expect(mins!).toBeGreaterThan(60);
  });
  it('null when no drive_time and no coordinates (old un-geocoded job)', () => {
    expect(driveMinutesForJob(job(), shop)).toBeNull();
  });
  it('null when no shop coordinates are available', () => {
    expect(driveMinutesForJob(job({ jobsite_latitude: 40.9, jobsite_longitude: -75.0 }), null)).toBeNull();
  });
  it('ignores zero/negative drive_time and tries coordinates instead', () => {
    const j = job({ drive_time: 0, jobsite_latitude: 40.9, jobsite_longitude: -75.0 });
    expect(driveMinutesForJob(j, shop)).toBeGreaterThan(0);
  });
  it('null job → null', () => {
    expect(driveMinutesForJob(null, shop)).toBeNull();
  });
});

describe('estimateDriveMinutesFromCoords', () => {
  it('matches the lib/drive-time.ts fallback heuristic (×1.3 road factor, 28 mph)', () => {
    // 1 degree latitude ≈ 111.2 km ≈ 69.1 straight miles → 89.8 road miles
    // → 89.8 / 28 mph ≈ 3.21 h ≈ 192 min
    const mins = estimateDriveMinutesFromCoords(40.0, -75.0, 41.0, -75.0);
    expect(mins).toBeGreaterThanOrEqual(185);
    expect(mins).toBeLessThanOrEqual(200);
  });
  it('same point → minimum of 1 minute', () => {
    expect(estimateDriveMinutesFromCoords(40, -75, 40, -75)).toBe(1);
  });
});

describe('resolveCompletionInstant', () => {
  const clockIn = '2026-08-01T12:00:00Z';
  it('picks work_completed_at when it is the only candidate', () => {
    const j = job({ work_completed_at: '2026-08-01T20:00:00Z' });
    const r = resolveCompletionInstant([{ at: j.work_completed_at, job: j }], clockIn);
    expect(r).not.toBeNull();
    expect(r!.atMs).toBe(Date.parse('2026-08-01T20:00:00Z'));
    expect(r!.job).toBe(j);
  });
  it('picks the LATEST of work_completed_at vs day_completed_at', () => {
    const j1 = job({ id: 'j1', work_completed_at: '2026-08-01T18:00:00Z' });
    const j2 = job({ id: 'j2' }); // multi-day job, "Done for Today" log at 20:30
    const r = resolveCompletionInstant(
      [
        { at: j1.work_completed_at, job: j1 },
        { at: '2026-08-01T20:30:00Z', job: j2 },
      ],
      clockIn
    );
    expect(r!.atMs).toBe(Date.parse('2026-08-01T20:30:00Z'));
    expect(r!.job!.id).toBe('j2');
  });
  it('no candidates → null (never-completed ticket is covered by the elapsed reminders)', () => {
    expect(resolveCompletionInstant([], clockIn)).toBeNull();
  });
  it('ignores completions BEFORE clock-in (previous shift / stale multi-day stamp)', () => {
    const j = job({ work_completed_at: '2026-08-01T09:00:00Z' }); // before 12:00 clock-in
    expect(resolveCompletionInstant([{ at: j.work_completed_at, job: j }], clockIn)).toBeNull();
  });
  it('ignores null/invalid timestamps', () => {
    expect(
      resolveCompletionInstant(
        [
          { at: null, job: job() },
          { at: 'not-a-date', job: job() },
        ],
        clockIn
      )
    ).toBeNull();
  });
  it('night shift: completion after midnight UTC still counts against the shift clock-in', () => {
    const nightClockIn = '2026-08-01T22:00:00Z';
    const r = resolveCompletionInstant(
      [{ at: '2026-08-02T03:30:00Z', job: job() }],
      nightClockIn
    );
    expect(r).not.toBeNull();
    expect(r!.atMs).toBe(Date.parse('2026-08-02T03:30:00Z'));
  });
});

describe('isJobUnfinished (mirror of the clock-out route gate)', () => {
  it('dispatched, not completed, no log today → unfinished (blocks the reminder)', () => {
    expect(isJobUnfinished(job(), false)).toBe(true);
  });
  it('completed (work_completed_at set) → finished', () => {
    expect(isJobUnfinished(job({ work_completed_at: '2026-08-01T18:00:00Z' }), false)).toBe(false);
  });
  it('cancelled / completed / pending_completion statuses never block', () => {
    expect(isJobUnfinished(job({ status: 'cancelled' }), false)).toBe(false);
    expect(isJobUnfinished(job({ status: 'completed' }), false)).toBe(false);
    expect(isJobUnfinished(job({ status: 'pending_completion' }), false)).toBe(false);
  });
  it('multi-day "Done for Today" log satisfies the day even though status resets to scheduled', () => {
    expect(isJobUnfinished(job({ status: 'scheduled' }), true)).toBe(false);
  });
  it('on_hold blocks a LEAD operator (mirrors the operator gate)', () => {
    expect(isJobUnfinished(job({ status: 'on_hold' }), false, 'operator')).toBe(true);
  });
  it('on_hold does NOT block a helper/crew slot (a parked job must not silence their reminder)', () => {
    expect(isJobUnfinished(job({ status: 'on_hold' }), false, 'helper')).toBe(false);
  });
  it('helper slot still blocked by a genuinely open job', () => {
    expect(isJobUnfinished(job({ status: 'in_progress' }), false, 'helper')).toBe(true);
  });
  it('default slot is operator (backward compatible)', () => {
    expect(isJobUnfinished(job({ status: 'on_hold' }), false)).toBe(true);
  });
});

describe('formatMinutesAgo', () => {
  it('minutes under an hour', () => {
    expect(formatMinutesAgo(35)).toBe('about 35 minutes ago');
  });
  it('around an hour', () => {
    expect(formatMinutesAgo(65)).toBe('about an hour ago');
  });
  it('multiple hours', () => {
    expect(formatMinutesAgo(150)).toBe('about 3 hours ago');
  });
  it('never negative', () => {
    expect(formatMinutesAgo(-5)).toBe('about 0 minutes ago');
  });
});
