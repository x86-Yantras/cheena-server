import { describe, it, expect } from 'vitest';
import {
  parseHHmm, formatMinutes, weekdayFromDate,
  computeRahuKaal, computeYamaganda, computeGulikaKaal,
  computeAbhijitMuhurta, computeBrahmaMuhurta, computeChoghadiya,
  computeBhadraWindows, _computeBhadraWindowsFromKaranaLookup,
} from '../src/muhurtaCalculator.js';

// Verified reference: Baitadi (29.588806, 80.452122), Monday 2026-07-27,
// Asia/Kathmandu, altitude 0 -> sunrise 05:44, sunset 19:15.
const SUNRISE_MIN = parseHHmm('05:44'); // 344
const SUNSET_MIN = parseHHmm('19:15'); // 1155

describe('parseHHmm / formatMinutes', () => {
  it('parseHHmm converts "HH:mm" to minutes since midnight', () => {
    expect(parseHHmm('05:44')).toBe(344);
    expect(parseHHmm('19:15')).toBe(1155);
    expect(parseHHmm('00:00')).toBe(0);
  });

  it('formatMinutes converts minutes back to "HH:mm", wrapping negative/overflow', () => {
    expect(formatMinutes(344)).toBe('05:44');
    expect(formatMinutes(1155)).toBe('19:15');
    expect(formatMinutes(-56)).toBe('23:04'); // Brahma Muhurta style negative offset
    expect(formatMinutes(1500)).toBe('01:00'); // past midnight
  });
});

describe('weekdayFromDate', () => {
  it('returns "monday" for 2026-07-27 in Asia/Kathmandu', () => {
    expect(weekdayFromDate('2026-07-27', 0, 0, 'Asia/Kathmandu')).toBe('monday');
  });

  it('returns "sunday" for 2026-08-02 in Asia/Kathmandu', () => {
    expect(weekdayFromDate('2026-08-02', 0, 0, 'Asia/Kathmandu')).toBe('sunday');
  });
});

describe('weekday-math periods (Baitadi, Monday 2026-07-27)', () => {
  it('computeRahuKaal returns 07:25-09:07 for Monday (index 2 of 8)', () => {
    const window = computeRahuKaal('monday', SUNRISE_MIN, SUNSET_MIN);
    expect(window.name).toBe('Rahu Kaal');
    expect(window.type).toBe('inauspicious');
    expect(formatMinutes(window.start)).toBe('07:25');
    expect(formatMinutes(window.end)).toBe('09:07');
  });

  it('computeYamaganda returns 10:48-12:30 for Monday (index 4 of 8)', () => {
    const window = computeYamaganda('monday', SUNRISE_MIN, SUNSET_MIN);
    expect(window.name).toBe('Yamaganda');
    expect(formatMinutes(window.start)).toBe('10:48');
    expect(formatMinutes(window.end)).toBe('12:30');
  });

  it('computeGulikaKaal returns 14:11-15:52 for Monday (index 6 of 8)', () => {
    const window = computeGulikaKaal('monday', SUNRISE_MIN, SUNSET_MIN);
    expect(window.name).toBe('Gulika Kaal');
    expect(formatMinutes(window.start)).toBe('14:11');
    expect(formatMinutes(window.end)).toBe('15:52');
  });

  it('computeAbhijitMuhurta returns 12:02-12:57 (8th of 15 parts), no note on a non-Wednesday', () => {
    const window = computeAbhijitMuhurta('monday', SUNRISE_MIN, SUNSET_MIN);
    expect(window.name).toBe('Abhijit Muhurta');
    expect(window.type).toBe('auspicious');
    expect(formatMinutes(window.start)).toBe('12:02');
    expect(formatMinutes(window.end)).toBe('12:57');
    expect(window.note).toBeUndefined();
  });

  it('computeAbhijitMuhurta flags a note on Wednesday', () => {
    const window = computeAbhijitMuhurta('wednesday', SUNRISE_MIN, SUNSET_MIN);
    expect(window.note).toMatch(/weak|void/i);
  });

  it('computeBrahmaMuhurta returns 04:08-04:56 (96/48 min before sunrise)', () => {
    const window = computeBrahmaMuhurta(SUNRISE_MIN);
    expect(window.name).toBe('Brahma Muhurta');
    expect(window.type).toBe('auspicious');
    expect(formatMinutes(window.start)).toBe('04:08');
    expect(formatMinutes(window.end)).toBe('04:56');
  });
});

describe('computeChoghadiya (Baitadi, Monday 2026-07-27, next sunrise 05:44)', () => {
  const NEXT_SUNRISE_MIN = parseHHmm('05:44') + 1440; // 2026-07-28

  it('day sequence starts at Amrit (Monday) and follows the fixed rotation', () => {
    const { day } = computeChoghadiya('monday', SUNRISE_MIN, SUNSET_MIN, NEXT_SUNRISE_MIN);
    expect(day.map((slot) => slot.name)).toEqual(['Amrit', 'Kaal', 'Shubh', 'Rog', 'Udveg', 'Chal', 'Labh', 'Amrit']);
    expect(day).toHaveLength(8);
  });

  it('day slot times match the 8-part division of daytime', () => {
    const { day } = computeChoghadiya('monday', SUNRISE_MIN, SUNSET_MIN, NEXT_SUNRISE_MIN);
    expect(formatMinutes(day[0].start)).toBe('05:44');
    expect(formatMinutes(day[0].end)).toBe('07:25');
    expect(formatMinutes(day[7].start)).toBe('17:34');
    expect(formatMinutes(day[7].end)).toBe('19:15');
  });

  it('each slot carries the correct nature and lord', () => {
    const { day } = computeChoghadiya('monday', SUNRISE_MIN, SUNSET_MIN, NEXT_SUNRISE_MIN);
    expect(day[0]).toMatchObject({ name: 'Amrit', nature: 'auspicious', lord: 'Moon' });
    expect(day[3]).toMatchObject({ name: 'Rog', nature: 'inauspicious', lord: 'Mars' });
    expect(day[4]).toMatchObject({ name: 'Udveg', nature: 'inauspicious', lord: 'Sun' });
  });

  it('night sequence continues the rotation from where day left off (Kaal, after day ends on Amrit)', () => {
    const { night } = computeChoghadiya('monday', SUNRISE_MIN, SUNSET_MIN, NEXT_SUNRISE_MIN);
    expect(night.map((slot) => slot.name)).toEqual(['Kaal', 'Shubh', 'Rog', 'Udveg', 'Chal', 'Labh', 'Amrit', 'Kaal']);
    expect(night).toHaveLength(8);
  });

  it('night slot times match the 8-part division of night (sunset to next sunrise), ending exactly at next sunrise', () => {
    const { night } = computeChoghadiya('monday', SUNRISE_MIN, SUNSET_MIN, NEXT_SUNRISE_MIN);
    expect(formatMinutes(night[0].start)).toBe('19:15');
    expect(formatMinutes(night[7].end)).toBe('05:44');
  });

  it('a different weekday starts at a different Choghadiya (Sunday starts at Udveg)', () => {
    const { day } = computeChoghadiya('sunday', SUNRISE_MIN, SUNSET_MIN, NEXT_SUNRISE_MIN);
    expect(day[0].name).toBe('Udveg');
  });
});

describe('computeBhadraWindows — boundary-stitching logic (pure, injected karana lookup)', () => {
  // _computeBhadraWindowsFromKaranaLookup takes a (timeMin) => Promise<karanaHalfIndex>
  // function directly, so this test doesn't touch the real ephemeris service.
  // karanaHalfIndex 7 is the first Vishti: (7-1) % 7 = 6, and
  // MOVABLE_KARANA_NAMES[6] = 'Vishti'. Indices 14, 21, 28... are Vishti too.

  it('returns no window when the karana index is constant and not Vishti all day', async () => {
    const lookup = async () => 1; // Bava all day
    const windows = await _computeBhadraWindowsFromKaranaLookup(lookup, 300, 1200);
    expect(windows).toEqual([]);
  });

  it('returns one full-day window when the karana index is constant and IS Vishti all day', async () => {
    const lookup = async () => 7; // Vishti all day: (7-1)%7 = 6 = Vishti
    const windows = await _computeBhadraWindowsFromKaranaLookup(lookup, 300, 1200);
    expect(windows).toEqual([{ name: 'Bhadra (Vishti Karana)', start: 300, end: 1200, type: 'inauspicious' }]);
  });

  it('returns a partial window ending at sunset when karana transitions INTO Vishti during the day', async () => {
    // index 6 (Vanija, not Vishti) before minute 750, index 7 (Vishti) from 750 on.
    const lookup = async (min) => (min < 750 ? 6 : 7);
    const windows = await _computeBhadraWindowsFromKaranaLookup(lookup, 300, 1200);
    expect(windows).toHaveLength(1);
    expect(windows[0].name).toBe('Bhadra (Vishti Karana)');
    expect(windows[0].start).toBeCloseTo(750, 0);
    expect(windows[0].end).toBe(1200);
  });

  it('returns a partial window starting at sunrise when karana transitions OUT of Vishti during the day', async () => {
    // index 7 (Vishti) before minute 600, index 8 (Bava again, not Vishti) from 600 on.
    const lookup = async (min) => (min < 600 ? 7 : 8);
    const windows = await _computeBhadraWindowsFromKaranaLookup(lookup, 300, 1200);
    expect(windows).toHaveLength(1);
    expect(windows[0].start).toBe(300);
    expect(windows[0].end).toBeCloseTo(600, 0);
  });
});

describe('computeBhadraWindows — real ephemeris integration (Kathmandu, 2026-08-01)', () => {
  // Verified: at Kathmandu (27.7172, 85.3240), 2026-08-01, altitude 0, sunrise
  // ~05:31 (321min) and sunset ~18:49 (1129min), the karana index goes from
  // 34 (Vanija, not Vishti) at sunrise to 35 (Vishti) at sunset, crossing
  // near 11:08 local (~668min). Computed directly with this repo's
  // swissephService against the real ephemeris service for this plan.
  it('finds the Vishti window ending at sunset on 2026-08-01 in Kathmandu', async () => {
    const sunriseMin = parseHHmm('05:31');
    const sunsetMin = parseHHmm('18:49');
    const windows = await computeBhadraWindows('2026-08-01', sunriseMin, sunsetMin, 27.7172, 85.3240, 'Asia/Kathmandu');
    expect(windows).toHaveLength(1);
    expect(windows[0].name).toBe('Bhadra (Vishti Karana)');
    expect(formatMinutes(windows[0].end)).toBe('18:49');
    const crossingMinutes = windows[0].start;
    expect(Math.abs(crossingMinutes - parseHHmm('11:08'))).toBeLessThan(3); // within 3 min of the pre-verified crossing
  }, 30000);

  it('returns an empty array on a day with no karana transition into/out of Vishti (Baitadi, Monday 2026-07-27)', async () => {
    const windows = await computeBhadraWindows('2026-07-27', SUNRISE_MIN, SUNSET_MIN, 29.588806, 80.452122, 'Asia/Kathmandu');
    // Pre-verified for this plan: karana stays in the 25/26 range (Taitila/Gara)
    // across this day at this location, never touching Vishti.
    expect(windows).toEqual([]);
  }, 30000);
});
