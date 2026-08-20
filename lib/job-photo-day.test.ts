import {
  photoUploadedAtMs,
  photoUploadedOnYMD,
  photosFiledOn,
  photosFiledThisShift,
  currentShiftStartMs,
  normalizeShiftStartMs,
  MAX_SHIFT_HOURS,
} from './job-photo-day';
import { toLocalYMD } from './dates';

const SUPA = 'https://klatddoyncxidgqtcjnu.supabase.co/storage/v1/object/public/job-photos';
const JOB = '189dbd86-75dd-43ba-9987-d873d94a8f33';

/** Build a URL the way PhotoUploader does: `${prefix}-${Date.now()}-${rand}.jpg`. */
const workPhoto = (ms: number, rand = 'hvrg7') =>
  `${SUPA}/${JOB}/${JOB}-${ms}-${rand}.jpg`;
const completionPhoto = (ms: number, rand = 'smbx2') =>
  `${SUPA}/${JOB}/completion/${JOB}/completion-${ms}-${rand}.jpg`;

describe('photoUploadedAtMs', () => {
  it('reads the stamp off a work-performed upload', () => {
    // Real production object: .../189dbd86-...-1787170264849-hvrg7.jpg
    expect(photoUploadedAtMs(workPhoto(1787170264849))).toBe(1787170264849);
  });

  it('reads the stamp off a completion upload (nested /completion/ path)', () => {
    expect(photoUploadedAtMs(completionPhoto(1787170366853))).toBe(1787170366853);
  });

  it('is not fooled by the UUID folder segments', () => {
    // A UUID's longest group is 12 chars, so nothing in the path can pose as a
    // 13-digit stamp. The stamp returned must be the one in the basename.
    const url = `${SUPA}/${JOB}/${JOB}-1787004434250-0lqvtg.jpg`;
    expect(photoUploadedAtMs(url)).toBe(1787004434250);
  });

  it('strips a signed-URL query before looking for the stamp', () => {
    const signed = `${SUPA.replace('/public/', '/sign/')}/${JOB}/${JOB}-1787170264849-abc.jpg?token=eyJhbGciOi123456789`;
    expect(photoUploadedAtMs(signed)).toBe(1787170264849);
  });

  it('returns null for a URL with no stamp', () => {
    expect(photoUploadedAtMs(`${SUPA}/${JOB}/legacy-photo.jpg`)).toBeNull();
  });

  it('returns null for non-strings and empties', () => {
    expect(photoUploadedAtMs(null)).toBeNull();
    expect(photoUploadedAtMs(undefined)).toBeNull();
    expect(photoUploadedAtMs(12345)).toBeNull();
    expect(photoUploadedAtMs('')).toBeNull();
    expect(photoUploadedAtMs('   ')).toBeNull();
  });
});

describe('photoUploadedOnYMD', () => {
  it('uses the LOCAL calendar day, not UTC', () => {
    // 2026-08-19 20:11 US Eastern is already 2026-08-20 in UTC. The operator
    // closing out his evening must not be told his photos are tomorrow's.
    const evening = new Date(2026, 7, 19, 20, 11, 0);
    expect(photoUploadedOnYMD(workPhoto(evening.getTime()))).toBe('2026-08-19');
    expect(photoUploadedOnYMD(workPhoto(evening.getTime()))).toBe(toLocalYMD(evening));
  });

  it('returns null when the URL carries no stamp', () => {
    expect(photoUploadedOnYMD(`${SUPA}/${JOB}/legacy.jpg`)).toBeNull();
  });
});

describe('photosFiledOn', () => {
  const today = new Date(2026, 7, 19, 14, 14, 0);
  const todayYMD = toLocalYMD(today);
  const yesterday = new Date(2026, 7, 18, 14, 14, 0);

  it('accepts a work-performed photo taken earlier the same day', () => {
    // THE BUG: this is the photo day-complete used to ignore, forcing the
    // operator to shoot the same work twice, minutes apart.
    const urls = [workPhoto(today.getTime())];
    expect(photosFiledOn(urls, todayYMD)).toEqual(urls);
  });

  it('does NOT count a photo from a previous day of a multi-day job', () => {
    const stale = workPhoto(yesterday.getTime());
    expect(photosFiledOn([stale], todayYMD)).toEqual([]);
  });

  it('keeps only today from a mixed multi-day job, in order', () => {
    const d1 = workPhoto(yesterday.getTime(), 'aaa');
    const t1 = workPhoto(today.getTime(), 'bbb');
    const t2 = completionPhoto(today.getTime() + 60_000, 'ccc');
    expect(photosFiledOn([d1, t1, t2], todayYMD)).toEqual([t1, t2]);
  });

  it('treats an undated URL as NOT today (fail toward asking, never toward skipping)', () => {
    expect(photosFiledOn([`${SUPA}/${JOB}/legacy.jpg`], todayYMD)).toEqual([]);
  });

  it('ignores non-string members instead of throwing', () => {
    const good = workPhoto(today.getTime());
    expect(photosFiledOn([null, 42, good, undefined] as unknown[], todayYMD)).toEqual([good]);
  });

  it('returns [] for a null/absent photo_urls column', () => {
    expect(photosFiledOn(null)).toEqual([]);
    expect(photosFiledOn(undefined)).toEqual([]);
    expect(photosFiledOn('not-an-array')).toEqual([]);
  });

  it('defaults to the device today', () => {
    const now = workPhoto(Date.now());
    expect(photosFiledOn([now])).toEqual([now]);
  });
});

const HOUR = 3_600_000;
const iso = (d: Date) => d.toISOString();

describe('currentShiftStartMs', () => {
  // Tuesday 21:00 local → Wednesday 00:05 local: the founder's own example.
  const clockIn = new Date(2026, 7, 18, 21, 0, 0);
  const pastMidnight = new Date(2026, 7, 19, 0, 5, 0);

  it('reads the clock-in off the operator’s open overnight card', () => {
    const cards = [{ clock_in_time: iso(clockIn), clock_out_time: null }];
    expect(currentShiftStartMs(cards, pastMidnight.getTime())).toBe(clockIn.getTime());
  });

  it('takes the LATEST clock-in when several cards are returned', () => {
    const earlier = new Date(2026, 7, 18, 7, 0, 0);
    const cards = [
      { clock_in_time: iso(earlier), clock_out_time: iso(new Date(2026, 7, 18, 15, 0, 0)) },
      { clock_in_time: iso(clockIn), clock_out_time: null },
    ];
    expect(currentShiftStartMs(cards, pastMidnight.getTime())).toBe(clockIn.getTime());
  });

  it('still reads a CLOSED overnight card — the ticket is often filed from the truck', () => {
    // In 21:00 Tue, out 06:00 Wed, closeout at 07:00 Wed.
    const closed = [{
      clock_in_time: iso(clockIn),
      clock_out_time: iso(new Date(2026, 7, 19, 6, 0, 0)),
    }];
    const at7am = new Date(2026, 7, 19, 7, 0, 0).getTime();
    expect(currentShiftStartMs(closed, at7am)).toBe(clockIn.getTime());
  });

  it('ignores a card that claims to have run longer than a real shift', () => {
    // The production 88-hour card. Honouring it would stretch the photo window
    // across four days and let day 1 close day 5.
    const stale = new Date(2026, 7, 16, 6, 53, 0);
    const cards = [{ clock_in_time: iso(stale), clock_out_time: null }];
    expect(currentShiftStartMs(cards, pastMidnight.getTime())).toBeNull();
  });

  it('ignores a clock-in in the future (clock skew must never widen the window)', () => {
    const cards = [{ clock_in_time: iso(new Date(2026, 7, 19, 3, 0, 0)) }];
    expect(currentShiftStartMs(cards, pastMidnight.getTime())).toBeNull();
  });

  it('returns null for no cards, junk cards, or a non-array', () => {
    expect(currentShiftStartMs([])).toBeNull();
    expect(currentShiftStartMs([null, 42, {}, { clock_in_time: '' }] as unknown[])).toBeNull();
    expect(currentShiftStartMs(null)).toBeNull();
    expect(currentShiftStartMs(undefined)).toBeNull();
  });
});

describe('normalizeShiftStartMs', () => {
  const now = new Date(2026, 7, 19, 0, 5, 0).getTime();

  it('accepts a start just inside the cap and rejects one just outside', () => {
    expect(normalizeShiftStartMs(now - (MAX_SHIFT_HOURS * HOUR - 1), now))
      .toBe(now - (MAX_SHIFT_HOURS * HOUR - 1));
    expect(normalizeShiftStartMs(now - (MAX_SHIFT_HOURS * HOUR + 1), now)).toBeNull();
  });

  it('rejects nulls, NaN and non-numbers', () => {
    expect(normalizeShiftStartMs(null, now)).toBeNull();
    expect(normalizeShiftStartMs(undefined, now)).toBeNull();
    expect(normalizeShiftStartMs(NaN, now)).toBeNull();
    expect(normalizeShiftStartMs('1787170264849', now)).toBeNull();
    expect(normalizeShiftStartMs(0, now)).toBeNull();
  });
});

describe('photosFiledThisShift — a crew past midnight is asked once', () => {
  // The live shape: photos filed Tuesday evening, ticket closed out after
  // midnight on Wednesday. Production has a job photo uploaded at 02:00 ET.
  const clockIn = new Date(2026, 7, 18, 21, 0, 0);
  const beforeMidnight = new Date(2026, 7, 18, 23, 50, 0);
  const afterMidnight = new Date(2026, 7, 19, 2, 0, 0);
  const closeout = new Date(2026, 7, 19, 2, 30, 0);
  const nowMs = closeout.getTime();

  it('counts a photo filed before midnight on the same shift', () => {
    const evening = workPhoto(beforeMidnight.getTime(), 'nite1');
    // The bug: by the phone's calendar it is yesterday's photo.
    expect(photosFiledOn([evening], toLocalYMD(closeout))).toEqual([]);
    expect(
      photosFiledThisShift([evening], { shiftStartMs: clockIn.getTime(), nowMs })
    ).toEqual([evening]);
  });

  it('keeps both halves of a shift that straddles midnight, in order', () => {
    const before = workPhoto(beforeMidnight.getTime(), 'aaa');
    const after = completionPhoto(afterMidnight.getTime(), 'bbb');
    expect(
      photosFiledThisShift([before, after], { shiftStartMs: clockIn.getTime(), nowMs })
    ).toEqual([before, after]);
  });

  it('does NOT reach back before the shift started', () => {
    // Day 1 of the job, 08:00 Tuesday — thirteen hours before this shift began.
    const dayOne = workPhoto(new Date(2026, 7, 18, 8, 0, 0).getTime(), 'old');
    expect(
      photosFiledThisShift([dayOne], { shiftStartMs: clockIn.getTime(), nowMs })
    ).toEqual([]);
  });

  it('does NOT let a day-1 photo close day 5 on a normal day shift', () => {
    const day5In = new Date(2026, 7, 19, 7, 0, 0);
    const day5Now = new Date(2026, 7, 19, 15, 0, 0).getTime();
    const day4 = workPhoto(new Date(2026, 7, 18, 15, 0, 0).getTime(), 'd4');
    const day1 = workPhoto(new Date(2026, 7, 15, 9, 0, 0).getTime(), 'd1');
    expect(
      photosFiledThisShift([day1, day4], { shiftStartMs: day5In.getTime(), nowMs: day5Now })
    ).toEqual([]);
  });

  it('falls back to the wall clock when there is no usable shift', () => {
    const todayShot = workPhoto(afterMidnight.getTime(), 'today');
    const lastNight = workPhoto(beforeMidnight.getTime(), 'last');
    // shiftStartMs null → identical to the wall-clock rule that shipped first.
    expect(photosFiledThisShift([lastNight, todayShot], { shiftStartMs: null, nowMs }))
      .toEqual([todayShot]);
    expect(photosFiledThisShift([lastNight, todayShot], { nowMs }))
      .toEqual(photosFiledOn([lastNight, todayShot], toLocalYMD(closeout)));
  });

  it('never accepts FEWER photos than the wall-clock rule alone', () => {
    // Union, not replacement: a photo from this morning still counts even when
    // the shift began after it (operator photographed the site, then clocked in).
    const morning = workPhoto(new Date(2026, 7, 19, 6, 0, 0).getTime(), 'am');
    const lateIn = new Date(2026, 7, 19, 9, 0, 0).getTime();
    const at10 = new Date(2026, 7, 19, 10, 0, 0).getTime();
    expect(photosFiledThisShift([morning], { shiftStartMs: lateIn, nowMs: at10 }))
      .toEqual([morning]);
  });

  it('ignores an out-of-range shift start rather than widening the window', () => {
    const fourDaysAgo = new Date(2026, 7, 15, 6, 53, 0).getTime();
    const dayOne = workPhoto(new Date(2026, 7, 15, 9, 0, 0).getTime(), 'd1');
    expect(photosFiledThisShift([dayOne], { shiftStartMs: fourDaysAgo, nowMs })).toEqual([]);
  });

  it('treats an undated URL as not-this-shift', () => {
    expect(
      photosFiledThisShift([`${SUPA}/${JOB}/legacy.jpg`], {
        shiftStartMs: clockIn.getTime(),
        nowMs,
      })
    ).toEqual([]);
  });

  it('returns [] for a null/absent photo_urls column', () => {
    expect(photosFiledThisShift(null, { nowMs })).toEqual([]);
    expect(photosFiledThisShift(undefined, { nowMs })).toEqual([]);
    expect(photosFiledThisShift('not-an-array', { nowMs })).toEqual([]);
  });
});
