import { describe, it, expect } from 'vitest';
import { getSwe, computeJulianDay, computeAscendantLongitude, computePlanetLongitude } from '../src/swissephService.js';

describe('swissephService', () => {
  it('computes the known J2000.0 julian day for 2000-01-01 12:00 UTC (London, no DST in January)', async () => {
    const jd = await computeJulianDay('2000-01-01', '12:00', 51.5074, -0.1278);
    expect(jd).toBeCloseTo(2451545.0, 4);
  }, 15000);

  it('returns a sidereal ascendant longitude in [0, 360)', async () => {
    const jd = await computeJulianDay('1990-05-15', '14:30', 40.7128, -74.006);
    const asc = await computeAscendantLongitude(jd, 40.7128, -74.006);
    expect(asc).toBeGreaterThanOrEqual(0);
    expect(asc).toBeLessThan(360);
  }, 15000);

  it('returns a sidereal Sun longitude in [0, 360) and is deterministic', async () => {
    const swe = await getSwe();
    const jd = await computeJulianDay('1990-05-15', '14:30', 40.7128, -74.006);
    const first = await computePlanetLongitude(jd, swe.SE_SUN);
    const second = await computePlanetLongitude(jd, swe.SE_SUN);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(360);
    expect(first).toBeCloseTo(second, 8);
  }, 15000);
});
