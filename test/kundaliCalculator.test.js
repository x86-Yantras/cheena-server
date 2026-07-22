import { describe, it, expect } from 'vitest';
import {
  calculateKundali,
  rashiFromLongitude,
  nakshatraFromLongitude,
  houseFromRashi,
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

describe('calculateKundali', () => {
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
