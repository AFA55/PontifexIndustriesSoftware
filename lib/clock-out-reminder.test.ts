/**
 * Tests for the completion-aware smart clock-out reminder logic
 * (lib/clock-out-reminder.ts) — the fourth trigger in the
 * clock-out-reminders cron.
 */

import {
  MIN_REMINDER_DELAY_MINUTES,
  MAX_REMINDER_DELAY_MINUTES,
  DEFAULT_SHIFT_END_MINUTES,
  SHIFT_END_WINDOW_MINUTES,
  reminderDelayMinutes,
  driveMinutesForJob,
  estimateDriveMinutesFromCoords,
  resolveCompletionInstant,
  isJobUnfinished,
  formatMinutesAgo,
  shiftEndReminderDue,
  usesShiftWindowReminders,
  resolveWallClockReminderMinutes,
  type ReminderJob,
} from './clock-out-reminder';
import { nowMinutesInTz } from './reminder-timing';

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

// ── Supervisors: wall-clock shift end, never job completion ──────────────────

describe('usesShiftWindowReminders', () => {
  it('supervisors are shift-window: a finished job is not the end of their day', () => {
    expect(usesShiftWindowReminders('supervisor')).toBe(true);
  });
  it('operators and apprentices are NOT — their reminders are unchanged', () => {
    expect(usesShiftWindowReminders('operator')).toBe(false);
    expect(usesShiftWindowReminders('apprentice')).toBe(false);
  });
  it('other roles are unaffected', () => {
    expect(usesShiftWindowReminders('operations_manager')).toBe(false);
    expect(usesShiftWindowReminders('admin')).toBe(false);
    expect(usesShiftWindowReminders(null)).toBe(false);
    expect(usesShiftWindowReminders(undefined)).toBe(false);
    expect(usesShiftWindowReminders('')).toBe(false);
  });
});

describe('shiftEndReminderDue — the 6:30 PM boundary', () => {
  const SIX_THIRTY_PM = DEFAULT_SHIFT_END_MINUTES;

  it('the default shift end is 6:30 PM local (18:30 → 1110 minutes)', () => {
    expect(SIX_THIRTY_PM).toBe(18 * 60 + 30);
  });
  it('BEFORE 6:30 PM → not due (this is the whole point: no mid-day nagging)', () => {
    expect(shiftEndReminderDue(SIX_THIRTY_PM - 1, SIX_THIRTY_PM)).toBe(false); // 6:29 PM
    expect(shiftEndReminderDue(SIX_THIRTY_PM - 7, SIX_THIRTY_PM)).toBe(false); // 6:23 PM
    expect(shiftEndReminderDue(16 * 60 + 30, SIX_THIRTY_PM)).toBe(false);      // 4:30 PM (the old 10h nudge)
    expect(shiftEndReminderDue(12 * 60 + 30, SIX_THIRTY_PM)).toBe(false);      // 12:30 PM (the old after-job nudge)
    expect(shiftEndReminderDue(6 * 60 + 30, SIX_THIRTY_PM)).toBe(false);       // 6:30 AM — start of shift, not end
  });
  it('AT 6:30 PM → due', () => {
    expect(shiftEndReminderDue(SIX_THIRTY_PM, SIX_THIRTY_PM)).toBe(true);
  });
  it('stays due for TWO cron periods, so a delayed 15-minute tick cannot miss it', () => {
    // 14 left exactly one qualifying tick (18:30); a tick delayed to 18:45:10
    // meant the supervisor's ONLY clock-out reminder never arrived at all.
    expect(SHIFT_END_WINDOW_MINUTES).toBe(29);
    expect(shiftEndReminderDue(SIX_THIRTY_PM + 15, SIX_THIRTY_PM)).toBe(true);  // 6:45 PM — the second chance
    expect(shiftEndReminderDue(SIX_THIRTY_PM + 29, SIX_THIRTY_PM)).toBe(true);  // 6:59 PM
    expect(shiftEndReminderDue(SIX_THIRTY_PM + 30, SIX_THIRTY_PM)).toBe(false); // 7:00 PM — outside
  });

  it('the extra tick cannot double-send — sendReminderOnce dedups on the shift date', () => {
    // Documented here because it is the reason widening the window is free:
    // both qualifying ticks use the key `clock_out_personal:${tc.date}`.
    expect(shiftEndReminderDue(SIX_THIRTY_PM, SIX_THIRTY_PM)).toBe(true);
    expect(shiftEndReminderDue(SIX_THIRTY_PM + 15, SIX_THIRTY_PM)).toBe(true);
  });
  it('honours a personal override instead of the default', () => {
    const sevenPm = 19 * 60;
    expect(shiftEndReminderDue(SIX_THIRTY_PM, sevenPm)).toBe(false);
    expect(shiftEndReminderDue(sevenPm, sevenPm)).toBe(true);
  });
});

describe('resolveWallClockReminderMinutes — the nudge must land BEFORE auto-clockout', () => {
  const WARN = 30; // PRE_AUTOCLOCKOUT_WARN_MINUTES in the cron route
  const resolve = (
    over: Partial<Parameters<typeof resolveWallClockReminderMinutes>[0]> = {}
  ) =>
    resolveWallClockReminderMinutes({
      personalMinutes: null,
      usesShiftWindow: true,
      autoClockoutMinutes: null,
      warnBeforeAutoClockoutMinutes: WARN,
      ...over,
    });

  it('roles that are not shift-window and have no personal time get nothing', () => {
    expect(resolve({ usesShiftWindow: false })).toBeNull();
    expect(resolve({ usesShiftWindow: false, autoClockoutMinutes: 18 * 60 })).toBeNull();
  });

  it('a personal override wins outright — it is a decision, not a default', () => {
    const sevenPm = 19 * 60;
    expect(resolve({ personalMinutes: sevenPm })).toBe(sevenPm);
    // Even for a role that gets no wall-clock nudge by default.
    expect(resolve({ personalMinutes: sevenPm, usesShiftWindow: false })).toBe(sevenPm);
    // And it is NOT pulled earlier by the tenant's auto-clockout.
    expect(resolve({ personalMinutes: sevenPm, autoClockoutMinutes: 18 * 60 })).toBe(sevenPm);
  });

  it('Patriot (auto-clockout 7:00 PM) keeps the 6:30 PM default untouched', () => {
    expect(resolve({ autoClockoutMinutes: 19 * 60 })).toBe(DEFAULT_SHIFT_END_MINUTES);
  });

  it('THE BUG: a tenant left on the 18:00 default would never get the nudge at all', () => {
    // Card auto-closed at 6:00 PM → no open timecard at 6:30 → the supervisor's
    // ONE reminder fires into nothing, and he loses the half hour he worked.
    const sixPm = 18 * 60;
    expect(resolve({ autoClockoutMinutes: sixPm })).toBe(sixPm - WARN); // 5:30 PM
    expect(resolve({ autoClockoutMinutes: sixPm })).toBeLessThan(DEFAULT_SHIFT_END_MINUTES);
  });

  it('auto-clockout DISABLED → nothing to race, the default stands', () => {
    expect(resolve({ autoClockoutMinutes: null })).toBe(DEFAULT_SHIFT_END_MINUTES);
  });

  it('only ever pulls the default EARLIER, never later', () => {
    expect(resolve({ autoClockoutMinutes: 23 * 60 })).toBe(DEFAULT_SHIFT_END_MINUTES);
    expect(resolve({ autoClockoutMinutes: 20 * 60 })).toBe(DEFAULT_SHIFT_END_MINUTES);
  });

  it('an absurdly early auto-clockout cannot produce a negative minute', () => {
    expect(resolve({ autoClockoutMinutes: 10 })).toBe(0);
  });
});

describe('shiftEndReminderDue — evaluated in the TENANT timezone, never UTC', () => {
  const TZ = 'America/New_York';
  const at = (iso: string) => nowMinutesInTz(TZ, new Date(iso));

  it('6:29 PM EDT (22:29 UTC) → not due; 6:30 PM EDT (22:30 UTC) → due', () => {
    expect(shiftEndReminderDue(at('2026-08-17T22:29:00Z'), DEFAULT_SHIFT_END_MINUTES)).toBe(false);
    expect(shiftEndReminderDue(at('2026-08-17T22:30:00Z'), DEFAULT_SHIFT_END_MINUTES)).toBe(true);
  });

  it('EST (winter) shifts the UTC offset: 23:30 UTC is 6:30 PM local and IS due', () => {
    expect(shiftEndReminderDue(at('2026-01-15T23:29:00Z'), DEFAULT_SHIFT_END_MINUTES)).toBe(false);
    expect(shiftEndReminderDue(at('2026-01-15T23:30:00Z'), DEFAULT_SHIFT_END_MINUTES)).toBe(true);
  });

  it('the UTC trap: 18:30 UTC is 2:30 PM local — must NOT fire', () => {
    const utcMinutes = 18 * 60 + 30; // what a naive Date#getUTCHours comparison would use
    expect(shiftEndReminderDue(utcMinutes, DEFAULT_SHIFT_END_MINUTES)).toBe(true); // wrong-by-construction
    expect(at('2026-08-17T18:30:00Z')).toBe(14 * 60 + 30);                         // actual tenant-local time
    expect(shiftEndReminderDue(at('2026-08-17T18:30:00Z'), DEFAULT_SHIFT_END_MINUTES)).toBe(false);
  });
});
