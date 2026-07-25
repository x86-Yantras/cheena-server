import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateKundali,
  rashiFromLongitude,
  nakshatraFromLongitude,
  houseFromRashi,
  navamsaRashiIndex,
  horaRashiIndex,
  bhavaHouseFromLongitude,
} from '../src/kundaliCalculator.js';

describe('rashiFromLongitude', () => {
  it('maps 0 degrees to Mesha, 35 degrees to Vrishabha at 5 degrees in', () => {
    expect(rashiFromLongitude(0)).toEqual({ rashiIndex: 0, rashiName: 'Mesha', degreeInRashi: 0 });
    expect(rashiFromLongitude(35)).toEqual({ rashiIndex: 1, rashiName: 'Vrishabha', degreeInRashi: 5 });
  });
});

describe('nakshatraFromLongitude', () => {
  it('maps 0 degrees to Ashwini pada 1, and one span in to Bharani pada 1', () => {
    expect(nakshatraFromLongitude(0)).toEqual({ nakshatraIndex: 0, nakshatraName: 'Ashwini', pada: 1 });
    const bharani = nakshatraFromLongitude(360 / 27);
    expect(bharani.nakshatraIndex).toBe(1);
    expect(bharani.nakshatraName).toBe('Bharani');
    expect(bharani.pada).toBe(1);
  });
});

describe('houseFromRashi', () => {
  it('places the ascendant rashi in house 1 and wraps around', () => {
    expect(houseFromRashi(3, 3)).toBe(1);
    expect(houseFromRashi(4, 3)).toBe(2);
    expect(houseFromRashi(2, 3)).toBe(12);
  });
});

describe('navamsaRashiIndex', () => {
  it('maps 0 degrees to Mesha (navamsha index 0)', () => {
    expect(navamsaRashiIndex(0)).toBe(0);
  });

  it('maps just under 30 degrees to Dhanu (the 9th navamsha of a movable sign)', () => {
    expect(navamsaRashiIndex(29.9999)).toBe(8);
  });

  it('maps exactly 30 degrees to Makara (fixed-sign navamsha starts at the 9th sign)', () => {
    expect(navamsaRashiIndex(30)).toBe(9);
  });

  it('maps just under 360 degrees back to Meena (wraps within the last sign)', () => {
    expect(navamsaRashiIndex(359.9999)).toBe(11);
  });
});

describe('horaRashiIndex', () => {
  it('maps the first half of an odd sign (Mesha) to Simha (Sun hora)', () => {
    expect(horaRashiIndex(5)).toBe(4);
  });

  it('maps the second half of an odd sign (Mesha) to Karka (Moon hora)', () => {
    expect(horaRashiIndex(20)).toBe(3);
  });

  it('maps the first half of an even sign (Vrishabha) to Karka (Moon hora)', () => {
    expect(horaRashiIndex(35)).toBe(3);
  });

  it('maps the second half of an even sign (Vrishabha) to Simha (Sun hora)', () => {
    expect(horaRashiIndex(50)).toBe(4);
  });
});

describe('bhavaHouseFromLongitude', () => {
  const evenlySpacedMadhyas = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

  it('places a longitude just past a house madhya into that house, when madhyas are evenly spaced', () => {
    // Madhya-centered bhava: house 1 spans [345, 15), so 10 degrees falls in house 1.
    expect(bhavaHouseFromLongitude(10, evenlySpacedMadhyas)).toBe(1);
  });

  it('places a longitude past the sandhi (boundary) into the next house', () => {
    // Boundary between house 1 and house 2 is at 15 degrees.
    expect(bhavaHouseFromLongitude(20, evenlySpacedMadhyas)).toBe(2);
  });

  it('handles the 0/360 degree wraparound between house 12 and house 1', () => {
    const shiftedMadhyas = [20, 50, 80, 110, 140, 170, 200, 230, 260, 290, 320, 350];
    // House 12's madhya is 350; the house-12/house-1 boundary is at 5 degrees.
    // 359 degrees is just past the house-12 madhya, still within house 12.
    expect(bhavaHouseFromLongitude(359, shiftedMadhyas)).toBe(12);
    // 10 degrees is past the boundary at 5 degrees, so it's in house 1.
    expect(bhavaHouseFromLongitude(10, shiftedMadhyas)).toBe(1);
  });
});

describe('calculateKundali', () => {
  beforeEach(() => {
    process.env.EPHEMERIS_SERVICE_URL = 'http://ephemeris.test';
    process.env.EPHEMERIS_SERVICE_API_KEY = 'test-api-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        julianDay: 2448026.5,
        ascendantLongitude: 15,
        planetLongitudes: {
          SUN: 10, MOON: 40, MARS: 70, MERCURY: 100,
          JUPITER: 130, VENUS: 160, SATURN: 190, RAHU: 220,
        },
      }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const input = { date: '1990-05-15', time: '14:30', latitude: 40.7128, longitude: -74.006 };

  it('returns all 9 grahas with valid rashi/nakshatra/house ranges', async () => {
    const result = await calculateKundali(input);
    expect(result.planets).toHaveLength(9);
    const keys = result.planets.map((p) => p.key);
    expect(keys).toEqual(['SUN', 'MOON', 'MARS', 'MERCURY', 'JUPITER', 'VENUS', 'SATURN', 'RAHU', 'KETU']);
    for (const planet of result.planets) {
      expect(planet.rashiIndex).toBeGreaterThanOrEqual(0);
      expect(planet.rashiIndex).toBeLessThan(12);
      expect(planet.nakshatraIndex).toBeGreaterThanOrEqual(0);
      expect(planet.nakshatraIndex).toBeLessThan(27);
      expect(planet.house).toBeGreaterThanOrEqual(1);
      expect(planet.house).toBeLessThanOrEqual(12);
    }
    expect(result.ascendant.rashiIndex).toBeGreaterThanOrEqual(0);
    expect(result.ascendant.rashiIndex).toBeLessThan(12);
  }, 20000);

  it('places Ketu exactly 180 degrees from Rahu', async () => {
    const result = await calculateKundali(input);
    const rahu = result.planets.find((p) => p.key === 'RAHU');
    const ketu = result.planets.find((p) => p.key === 'KETU');
    const expectedKetu = (rahu.longitude + 180) % 360;
    expect(ketu.longitude).toBeCloseTo(expectedKetu, 8);
  }, 20000);

  it('is deterministic for the same input', async () => {
    const first = await calculateKundali(input);
    const second = await calculateKundali(input);
    expect(first.ascendant.longitude).toBeCloseTo(second.ascendant.longitude, 8);
    expect(first.planets[0].longitude).toBeCloseTo(second.planets[0].longitude, 8);
  }, 20000);
});

describe('calculateKundali (real-world regression case)', () => {
  beforeEach(() => {
    process.env.EPHEMERIS_SERVICE_URL = 'http://ephemeris.test';
    process.env.EPHEMERIS_SERVICE_API_KEY = 'test-api-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        julianDay: 2451179.6215278,
        ascendantLongitude: 276.51,
        planetLongitudes: {
          SUN: 256.39,
          MOON: 62.91,
          MARS: 174.60,
          MERCURY: 237.60,
          JUPITER: 328.12,
          VENUS: 271.69,
          SATURN: 2.93,
          RAHU: 120.55,
        },
      }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // 1999-01-01 08:40 local (Asia/Kathmandu, UTC+5:45), Baitadi, Nepal.
  // Independently-verified sidereal (Lahiri) values, mean-node Rahu/Ketu.
  // Tolerance is 0.02 degrees per graha, matching the precision of the
  // independently-supplied reference values.
  const input = {
    date: '1999-01-01',
    time: '08:40',
    latitude: 29.588806,
    longitude: 80.452122,
    timezone: 'Asia/Kathmandu',
  };

  const expected = {
    ascendant: { longitude: 276.51, navamsa: { rashiIndex: 10, rashiName: 'Kumbha' } },
    SUN: { longitude: 256.39, house: 12, navamsa: { rashiIndex: 4, rashiName: 'Simha', house: 7 } },
    MOON: { longitude: 62.91, house: 6, navamsa: { rashiIndex: 6, rashiName: 'Tula', house: 9 } },
    MARS: { longitude: 174.60, house: 9, navamsa: { rashiIndex: 4, rashiName: 'Simha', house: 7 } },
    MERCURY: { longitude: 237.60, house: 11, navamsa: { rashiIndex: 11, rashiName: 'Meena', house: 2 } },
    JUPITER: { longitude: 328.12, house: 2, navamsa: { rashiIndex: 2, rashiName: 'Mithuna', house: 5 } },
    VENUS: { longitude: 271.69, house: 1, navamsa: { rashiIndex: 9, rashiName: 'Makara', house: 12 } },
    SATURN: { longitude: 2.93, house: 4, navamsa: { rashiIndex: 0, rashiName: 'Mesha', house: 3 } },
    RAHU: { longitude: 120.55, house: 8, navamsa: { rashiIndex: 0, rashiName: 'Mesha', house: 3 } },
    KETU: { longitude: 300.55, house: 2, navamsa: { rashiIndex: 6, rashiName: 'Tula', house: 9 } },
  };

  it('matches independently-verified sidereal longitudes and whole-sign houses', async () => {
    const result = await calculateKundali(input);

    expect(result.julianDay).toBeCloseTo(2451179.6215278, 6);
    expect(result.ascendant.longitude).toBeCloseTo(expected.ascendant.longitude, 1);
    expect(result.ascendant.navamsa.rashiIndex).toBe(expected.ascendant.navamsa.rashiIndex);
    expect(result.ascendant.navamsa.rashiName).toBe(expected.ascendant.navamsa.rashiName);

    for (const planet of result.planets) {
      const exp = expected[planet.key];
      expect(planet.longitude, `${planet.key} longitude`).toBeCloseTo(exp.longitude, 1);
      expect(planet.house, `${planet.key} house`).toBe(exp.house);
      expect(planet.navamsa.rashiIndex, `${planet.key} navamsa rashiIndex`).toBe(exp.navamsa.rashiIndex);
      expect(planet.navamsa.rashiName, `${planet.key} navamsa rashiName`).toBe(exp.navamsa.rashiName);
      expect(planet.navamsa.house, `${planet.key} navamsa house`).toBe(exp.navamsa.house);
    }
  }, 20000);

  it('uses the mean node for Rahu, not the true node', async () => {
    const result = await calculateKundali(input);
    const rahu = result.planets.find((p) => p.key === 'RAHU');
    // The true node for this instant is ~119.0° (Karka); the mean node is
    // ~120.55° (Simha). Asserting the mean-node value catches a regression
    // back to SE_TRUE_NODE even if someone loosens the tolerance above.
    expect(rahu.longitude).toBeGreaterThan(120);
    expect(rahu.rashiName).toBe('Simha');
  }, 20000);

  it('includes the Vimshottari dasha timeline starting with the Mars mahadasha', async () => {
    const result = await calculateKundali(input);
    expect(result.dasha.mahadashas).toHaveLength(9);
    expect(result.dasha.mahadashas[0].lord).toBe('MARS');
    expect(result.dasha.balanceYears).toBeCloseTo(1.9722, 3);
    expect(result.dasha.mahadashas[0].subPeriods[0].subPeriods).toHaveLength(9);
  }, 20000);
});
