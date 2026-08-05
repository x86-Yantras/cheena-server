import { describe, it, expect } from 'vitest';
import {
  parseHHmm, formatMinutes, weekdayFromDate,
  computeRahuKaal, computeYamaganda, computeGulikaKaal,
  computeAbhijitMuhurta, computeBrahmaMuhurta,
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
