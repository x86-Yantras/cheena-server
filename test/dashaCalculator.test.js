import { describe, it, expect } from 'vitest';
import { computeVimshottariDasha } from '../src/dashaCalculator.js';

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

describe('computeVimshottariDasha', () => {
  // Baitadi regression fixture: Moon sidereal longitude at birth, birth moment
  // 1999-01-01 08:40 Asia/Kathmandu = 1999-01-01 02:55 UTC.
  const moonLongitude = 62.909972675015986; // Mrigashira (nakshatra index 4)
  const birthUtcMs = Date.UTC(1999, 0, 1, 2, 55, 0);

  it('starts with the Mars mahadasha (Mrigashira lord) with ~1.9722 years balance', () => {
    const dasha = computeVimshottariDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas[0].lord).toBe('MARS');
    expect(dasha.balanceYears).toBeCloseTo(1.9722, 3);
  });

  it('lists 9 mahadashas in Vimshottari order totalling exactly 120 years', () => {
    const dasha = computeVimshottariDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas.map((m) => m.lord)).toEqual([
      'MARS', 'RAHU', 'JUPITER', 'SATURN', 'MERCURY', 'KETU', 'VENUS', 'SUN', 'MOON',
    ]);
    const totalMs = Date.parse(dasha.mahadashas[8].end) - Date.parse(dasha.mahadashas[0].start);
    expect(totalMs / YEAR_MS).toBeCloseTo(120, 6);
  });

  it('ends the first mahadasha exactly balanceYears after birth', () => {
    const dasha = computeVimshottariDasha(moonLongitude, birthUtcMs);
    const endMs = Date.parse(dasha.mahadashas[0].end);
    expect((endMs - birthUtcMs) / YEAR_MS).toBeCloseTo(dasha.balanceYears, 6);
  });

  it('starts the first mahadasha before birth (cycle began at nakshatra entry)', () => {
    const dasha = computeVimshottariDasha(moonLongitude, birthUtcMs);
    expect(Date.parse(dasha.mahadashas[0].start)).toBeLessThan(birthUtcMs);
  });

  it('nests 9 antardashas and 9 pratyantardashas, each starting with the parent lord and spanning the parent period', () => {
    const dasha = computeVimshottariDasha(moonLongitude, birthUtcMs);
    const maha = dasha.mahadashas[1]; // RAHU, 18 years
    expect(maha.subPeriods).toHaveLength(9);
    expect(maha.subPeriods[0].lord).toBe('RAHU');
    expect(maha.subPeriods[0].start).toBe(maha.start);
    expect(Math.abs(Date.parse(maha.subPeriods[8].end) - Date.parse(maha.end))).toBeLessThan(5);

    // Rahu antardasha inside Rahu mahadasha: 18 * 18 / 120 = 2.7 years.
    const antar = maha.subPeriods[0];
    const antarYears = (Date.parse(antar.end) - Date.parse(antar.start)) / YEAR_MS;
    expect(antarYears).toBeCloseTo(2.7, 6);

    expect(antar.subPeriods).toHaveLength(9);
    expect(antar.subPeriods[0].lord).toBe('RAHU');
    expect(antar.subPeriods[0].start).toBe(antar.start);
    expect(Math.abs(Date.parse(antar.subPeriods[8].end) - Date.parse(antar.end))).toBeLessThan(5);
  });

  it('gives pratyantardashas no further sub-periods', () => {
    const dasha = computeVimshottariDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas[0].subPeriods[0].subPeriods[0].subPeriods).toBeUndefined();
  });
});
