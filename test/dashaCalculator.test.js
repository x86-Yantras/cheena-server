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

describe('computeTribhagiDasha', () => {
  const moonLongitude = 62.909972675015986;
  const birthUtcMs = Date.UTC(1999, 0, 1, 2, 55, 0);

  it('starts with the Mars mahadasha with ~0.6574 years balance (exactly 1/3 of Vimshottari\'s)', () => {
    const dasha = computeTribhagiDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas[0].lord).toBe('MARS');
    expect(dasha.balanceYears).toBeCloseTo(0.6574, 3);
  });

  it('lists 9 mahadashas per cycle in the same order as Vimshottari, first cycle totalling exactly 40 years', () => {
    const dasha = computeTribhagiDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas.slice(0, 9).map((m) => m.lord)).toEqual([
      'MARS', 'RAHU', 'JUPITER', 'SATURN', 'MERCURY', 'KETU', 'VENUS', 'SUN', 'MOON',
    ]);
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    const totalMs = Date.parse(dasha.mahadashas[8].end) - Date.parse(dasha.mahadashas[0].start);
    expect(totalMs / YEAR_MS).toBeCloseTo(40, 6);
  });

  it('repeats the identical 9-lord cycle enough times to cover a 120-year lifespan (3 repeats of the 40-year cycle)', () => {
    const dasha = computeTribhagiDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas).toHaveLength(27);
    // Cycle 2 and cycle 3 repeat the exact same lord order as cycle 1.
    expect(dasha.mahadashas.slice(9, 18).map((m) => m.lord)).toEqual(
      dasha.mahadashas.slice(0, 9).map((m) => m.lord),
    );
    expect(dasha.mahadashas.slice(18, 27).map((m) => m.lord)).toEqual(
      dasha.mahadashas.slice(0, 9).map((m) => m.lord),
    );
    // Cycle 2 starts exactly where cycle 1 ends (no gap, no overlap).
    expect(dasha.mahadashas[9].start).toBe(dasha.mahadashas[8].end);
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    const totalMs = Date.parse(dasha.mahadashas[26].end) - Date.parse(dasha.mahadashas[0].start);
    expect(totalMs / YEAR_MS).toBeCloseTo(120, 6);
  });

  it('scales every mahadasha to exactly 1/3 of its Vimshottari equivalent', () => {
    const vimshottari = computeVimshottariDasha(moonLongitude, birthUtcMs);
    const tribhagi = computeTribhagiDasha(moonLongitude, birthUtcMs);
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    for (let i = 0; i < 9; i += 1) {
      const vimYears = (Date.parse(vimshottari.mahadashas[i].end) - Date.parse(vimshottari.mahadashas[i].start)) / YEAR_MS;
      const tribYears = (Date.parse(tribhagi.mahadashas[i].end) - Date.parse(tribhagi.mahadashas[i].start)) / YEAR_MS;
      expect(tribYears).toBeCloseTo(vimYears / 3, 6);
    }
  });

  it('nests 9 antardashas and 9 pratyantardashas (3-level depth, same as Vimshottari)', () => {
    const dasha = computeTribhagiDasha(moonLongitude, birthUtcMs);
    const maha = dasha.mahadashas[1]; // RAHU, 6 years
    expect(maha.subPeriods).toHaveLength(9);
    expect(maha.subPeriods[0].lord).toBe('RAHU');

    const antar = maha.subPeriods[0];
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    const antarYears = (Date.parse(antar.end) - Date.parse(antar.start)) / YEAR_MS;
    expect(antarYears).toBeCloseTo(0.9, 6); // 2.7 / 3

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

  it('lists 8 mahadashas per cycle in Yogini order starting from Sankata, first cycle totalling exactly 36 years', () => {
    const dasha = computeYoginiDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas.slice(0, 8).map((m) => m.name)).toEqual([
      'SANKATA', 'MANGALA', 'PINGALA', 'DHANYA', 'BHRAMARI', 'BHADRIKA', 'ULKA', 'SIDDHA',
    ]);
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    const totalMs = Date.parse(dasha.mahadashas[7].end) - Date.parse(dasha.mahadashas[0].start);
    expect(totalMs / YEAR_MS).toBeCloseTo(36, 6);
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
    expect(totalMs / YEAR_MS).toBeCloseTo(144, 6);
  });

  it('gives the Sankata mahadasha (8 years) an 8-year span and its first antardasha (Sankata-in-Sankata) is proportional', () => {
    const dasha = computeYoginiDasha(moonLongitude, birthUtcMs);
    const maha = dasha.mahadashas[0]; // SANKATA, 8 years
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    const mahaYears = (Date.parse(maha.end) - Date.parse(maha.start)) / YEAR_MS;
    expect(mahaYears).toBeCloseTo(8, 6);

    expect(maha.subPeriods).toHaveLength(8);
    expect(maha.subPeriods[0].name).toBe('SANKATA');
    expect(maha.subPeriods[0].start).toBe(maha.start);

    // Sankata-in-Sankata antardasha: mahaYears(8) * ownYears(8) / totalYears(36) = 1.7778 years.
    const antar = maha.subPeriods[0];
    const antarYears = (Date.parse(antar.end) - Date.parse(antar.start)) / YEAR_MS;
    expect(antarYears).toBeCloseTo(1.7778, 3);
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
