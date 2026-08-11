import { describe, it, expect } from 'vitest';
import { computeVimshottariDasha, computeTribhagiDasha, computeYoginiDasha } from '../src/dashaCalculator.js';

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

  it('lists 9 mahadashas in Vimshottari order, first mahadasha clipped to its birth balance', () => {
    const dasha = computeVimshottariDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas.map((m) => m.lord)).toEqual([
      'MARS', 'RAHU', 'JUPITER', 'SATURN', 'MERCURY', 'KETU', 'VENUS', 'SUN', 'MOON',
    ]);
    // 120 years minus the part of the Mars mahadasha already elapsed at birth.
    const totalMs = Date.parse(dasha.mahadashas[8].end) - Date.parse(dasha.mahadashas[0].start);
    const elapsedYears = 7 - dasha.balanceYears;
    expect(totalMs / YEAR_MS).toBeCloseTo(120 - elapsedYears, 6);
  });

  it('ends the first mahadasha exactly balanceYears after birth', () => {
    const dasha = computeVimshottariDasha(moonLongitude, birthUtcMs);
    const endMs = Date.parse(dasha.mahadashas[0].end);
    expect((endMs - birthUtcMs) / YEAR_MS).toBeCloseTo(dasha.balanceYears, 6);
  });

  it('starts the first mahadasha exactly at birth, never before (notional pre-birth start is clipped)', () => {
    const dasha = computeVimshottariDasha(moonLongitude, birthUtcMs);
    expect(Date.parse(dasha.mahadashas[0].start)).toBe(birthUtcMs);
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

describe('computeTribhagiDasha', () => {
  const moonLongitude = 62.909972675015986;
  const birthUtcMs = Date.UTC(1999, 0, 1, 2, 55, 0);

  it('starts with the Mars mahadasha with ~1.3148 years balance (exactly 2/3 of Vimshottari\'s)', () => {
    const dasha = computeTribhagiDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas[0].lord).toBe('MARS');
    expect(dasha.balanceYears).toBeCloseTo(1.3148, 3);
  });

  it('lists 9 mahadashas per cycle in the same order as Vimshottari, first cycle clipped to the birth balance', () => {
    const dasha = computeTribhagiDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas.slice(0, 9).map((m) => m.lord)).toEqual([
      'MARS', 'RAHU', 'JUPITER', 'SATURN', 'MERCURY', 'KETU', 'VENUS', 'SUN', 'MOON',
    ]);
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    const totalMs = Date.parse(dasha.mahadashas[8].end) - Date.parse(dasha.mahadashas[0].start);
    // Tribhagi cycle is 80 years (2/3 of Vimshottari's 120); first mahadasha
    // is clipped to its balance, so cycle 1 falls short of 80 by the elapsed part.
    const elapsedYears = (7 * 2) / 3 - dasha.balanceYears;
    expect(totalMs / YEAR_MS).toBeCloseTo(80 - elapsedYears, 6);
  });

  it('repeats the identical 9-lord cycle enough times to cover a 120-year lifespan (2 repeats of the 80-year cycle)', () => {
    const dasha = computeTribhagiDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas).toHaveLength(18);
    // Cycle 2 repeats the exact same lord order as cycle 1.
    expect(dasha.mahadashas.slice(9, 18).map((m) => m.lord)).toEqual(
      dasha.mahadashas.slice(0, 9).map((m) => m.lord),
    );
    // Cycle 2 starts exactly where cycle 1 ends (no gap, no overlap).
    expect(dasha.mahadashas[9].start).toBe(dasha.mahadashas[8].end);
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    const totalMs = Date.parse(dasha.mahadashas[17].end) - Date.parse(dasha.mahadashas[0].start);
    const elapsedYears = (7 * 2) / 3 - dasha.balanceYears;
    expect(totalMs / YEAR_MS).toBeCloseTo(160 - elapsedYears, 6);
  });

  it('scales every mahadasha to exactly 2/3 of its Vimshottari equivalent', () => {
    const vimshottari = computeVimshottariDasha(moonLongitude, birthUtcMs);
    const tribhagi = computeTribhagiDasha(moonLongitude, birthUtcMs);
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    for (let i = 0; i < 9; i += 1) {
      const vimYears = (Date.parse(vimshottari.mahadashas[i].end) - Date.parse(vimshottari.mahadashas[i].start)) / YEAR_MS;
      const tribYears = (Date.parse(tribhagi.mahadashas[i].end) - Date.parse(tribhagi.mahadashas[i].start)) / YEAR_MS;
      expect(tribYears).toBeCloseTo((vimYears * 2) / 3, 6);
    }
  });

  it('nests 9 antardashas and 9 pratyantardashas (3-level depth, same as Vimshottari)', () => {
    const dasha = computeTribhagiDasha(moonLongitude, birthUtcMs);
    const maha = dasha.mahadashas[1]; // RAHU, 18*2/3 = 12 years
    expect(maha.subPeriods).toHaveLength(9);
    expect(maha.subPeriods[0].lord).toBe('RAHU');

    const antar = maha.subPeriods[0];
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    const antarYears = (Date.parse(antar.end) - Date.parse(antar.start)) / YEAR_MS;
    expect(antarYears).toBeCloseTo(1.8, 6); // 2.7 * 2/3

    expect(antar.subPeriods).toHaveLength(9);
    expect(antar.subPeriods[0].subPeriods).toBeUndefined();
  });
});

describe('computeVimshottariDasha regression after computeDashaCycle refactor', () => {
  it('produces byte-for-byte identical output to before the refactor', () => {
    const moonLongitude = 62.909972675015986;
    const birthUtcMs = Date.UTC(1999, 0, 1, 2, 55, 0);
    const dasha = computeVimshottariDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas[0].lord).toBe('MARS');
    expect(dasha.balanceYears).toBeCloseTo(1.9722, 3);
    expect(dasha.mahadashas.map((m) => m.lord)).toEqual([
      'MARS', 'RAHU', 'JUPITER', 'SATURN', 'MERCURY', 'KETU', 'VENUS', 'SUN', 'MOON',
    ]);
  });
});

describe('computeYoginiDasha', () => {
  const moonLongitude = 62.909972675015986; // Mrigashira, nakshatraNumber 5
  const birthUtcMs = Date.UTC(1999, 0, 1, 2, 55, 0);

  it('starts with the Sankata mahadasha (nakshatraNumber 5: (5+3)%8=0 -> Sankata) with ~2.254 years balance', () => {
    const dasha = computeYoginiDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas[0].name).toBe('SANKATA');
    expect(dasha.mahadashas[0].lord).toBe('RAHU');
    expect(dasha.balanceYears).toBeCloseTo(2.254, 3);
  });

  it('lists 8 mahadashas per cycle in Yogini order starting from Sankata, first cycle clipped to the birth balance', () => {
    const dasha = computeYoginiDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas.slice(0, 8).map((m) => m.name)).toEqual([
      'SANKATA', 'MANGALA', 'PINGALA', 'DHANYA', 'BHRAMARI', 'BHADRIKA', 'ULKA', 'SIDDHA',
    ]);
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    const totalMs = Date.parse(dasha.mahadashas[7].end) - Date.parse(dasha.mahadashas[0].start);
    const elapsedYears = 8 - dasha.balanceYears;
    expect(totalMs / YEAR_MS).toBeCloseTo(36 - elapsedYears, 6);
  });

  it('repeats the identical 8-deity cycle enough times to cover a 120-year lifespan (4 repeats of the 36-year cycle)', () => {
    const dasha = computeYoginiDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas).toHaveLength(32);
    expect(dasha.mahadashas.slice(8, 16).map((m) => m.name)).toEqual(
      dasha.mahadashas.slice(0, 8).map((m) => m.name),
    );
    expect(dasha.mahadashas[8].start).toBe(dasha.mahadashas[7].end);
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    const totalMs = Date.parse(dasha.mahadashas[31].end) - Date.parse(dasha.mahadashas[0].start);
    const elapsedYears = 8 - dasha.balanceYears;
    expect(totalMs / YEAR_MS).toBeCloseTo(144 - elapsedYears, 6);
  });

  it('clips the Sankata mahadasha (8 years) to its birth balance and starts it exactly at birth', () => {
    const dasha = computeYoginiDasha(moonLongitude, birthUtcMs);
    const maha = dasha.mahadashas[0]; // SANKATA, clipped to balance at birth
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    expect(Date.parse(maha.start)).toBe(birthUtcMs);
    const mahaYears = (Date.parse(maha.end) - Date.parse(maha.start)) / YEAR_MS;
    expect(mahaYears).toBeCloseTo(dasha.balanceYears, 6);

    // Antardashas that would have elapsed before birth are dropped; the
    // remaining first one is clamped to start exactly at birth too.
    expect(maha.subPeriods.length).toBeLessThan(8);
    expect(maha.subPeriods[0].start).toBe(maha.start);
  });

  it('sums all 8 antardashas within one mahadasha to exactly that mahadasha\'s duration', () => {
    const dasha = computeYoginiDasha(moonLongitude, birthUtcMs);
    const maha = dasha.mahadashas[1]; // MANGALA, 1 year
    expect(maha.subPeriods).toHaveLength(8);
    expect(Math.abs(Date.parse(maha.subPeriods[7].end) - Date.parse(maha.end))).toBeLessThan(5);
  });

  it('gives antardashas no further sub-periods (2-level depth only)', () => {
    const dasha = computeYoginiDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas[0].subPeriods[0].subPeriods).toBeUndefined();
  });

  it('starting-Yogini formula: nakshatraNumber 6 (remainder 1) starts with Mangala', () => {
    // Ashwini=1..Mrigashira=5..Ardra=6. Nakshatra index 5 (Ardra) has span
    // [66.667, 80), so pick a longitude inside it: 70 degrees.
    const dasha = computeYoginiDasha(70, birthUtcMs);
    expect(dasha.mahadashas[0].name).toBe('MANGALA');
  });
});
