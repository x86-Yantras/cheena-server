import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSwe, resolveUtc, computeJulianDay, computeAscendantLongitude, computePlanetLongitude, computePlanetSpeed, computeBhavaMadhyas } from '../src/swissephService.js';

const MOCK_RESPONSE = {
  julianDay: 2451545.0,
  ascendantLongitude: 123.456,
  planetLongitudes: {
    SUN: 10.1, MOON: 20.2, MARS: 30.3, MERCURY: 40.4,
    JUPITER: 50.5, VENUS: 60.6, SATURN: 70.7, RAHU: 80.8,
  },
  planetSpeeds: {
    SUN: 0.98, MOON: 13.2, MARS: 0.5, MERCURY: 1.1,
    JUPITER: -0.13, VENUS: 1.26, SATURN: 0.03, RAHU: -0.05,
  },
  bhavaMadhyas: [5, 35, 65, 95, 125, 155, 185, 215, 245, 275, 305, 335],
};

describe('swissephService (HTTP client)', () => {
  let fetchMock;

  beforeEach(() => {
    process.env.EPHEMERIS_SERVICE_URL = 'http://ephemeris.test';
    process.env.EPHEMERIS_SERVICE_API_KEY = 'test-api-key';
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_RESPONSE,
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('resolveUtc computes UTC without any network call', () => {
    const utc = resolveUtc('2000-01-01', '12:00', 51.5074, -0.1278);
    expect(utc.isValid).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('getSwe resolves swisseph constant names to planet keys used by astro-data.js sweKey values', async () => {
    const swe = await getSwe();
    expect(swe.SE_SUN).toBe('SUN');
    expect(swe.SE_MOON).toBe('MOON');
    expect(swe.SE_MARS).toBe('MARS');
    expect(swe.SE_MERCURY).toBe('MERCURY');
    expect(swe.SE_JUPITER).toBe('JUPITER');
    expect(swe.SE_VENUS).toBe('VENUS');
    expect(swe.SE_SATURN).toBe('SATURN');
    expect(swe.SE_MEAN_NODE).toBe('RAHU');
  });

  it('computeJulianDay POSTs to EPHEMERIS_SERVICE_URL with the API key header and returns julianDay', async () => {
    const jd = await computeJulianDay('2000-01-01', '12:00', 51.5074, -0.1278, 'UTC');
    expect(jd).toBe(2451545.0);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://ephemeris.test/v1/ephemeris',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-API-Key': 'test-api-key',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          date: '2000-01-01',
          time: '12:00',
          latitude: 51.5074,
          longitude: -0.1278,
          timezone: 'UTC',
        }),
      }),
    );
  });

  it('computeJulianDay passes an AbortSignal so a stalled connection cannot hang forever', async () => {
    await computeJulianDay('2000-01-01', '12:00', 51.5074, -0.1278, 'UTC');
    const [, options] = fetchMock.mock.calls[0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('computeAscendantLongitude reuses the cached response from computeJulianDay for the same jd, without a second fetch', async () => {
    const jd = await computeJulianDay('2000-01-01', '12:00', 51.5074, -0.1278, 'UTC');
    const asc = await computeAscendantLongitude(jd, 51.5074, -0.1278);
    expect(asc).toBe(123.456);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('computePlanetLongitude reuses the cached response and maps swe constant names to values', async () => {
    const jd = await computeJulianDay('2000-01-01', '12:00', 51.5074, -0.1278, 'UTC');
    const swe = await getSwe();
    const sunLongitude = await computePlanetLongitude(jd, swe.SE_SUN);
    const rahuLongitude = await computePlanetLongitude(jd, swe.SE_MEAN_NODE);
    expect(sunLongitude).toBe(10.1);
    expect(rahuLongitude).toBe(80.8);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('computePlanetSpeed reuses the cached response and maps swe constant names to values', async () => {
    const jd = await computeJulianDay('2000-01-01', '12:00', 51.5074, -0.1278, 'UTC');
    const swe = await getSwe();
    const jupiterSpeed = await computePlanetSpeed(jd, swe.SE_JUPITER);
    const venusSpeed = await computePlanetSpeed(jd, swe.SE_VENUS);
    expect(jupiterSpeed).toBe(-0.13);
    expect(venusSpeed).toBe(1.26);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('computePlanetLongitude throws when called before computeJulianDay for that jd', async () => {
    await expect(computePlanetLongitude(9999999.0, 'SUN')).rejects.toThrow(/no cached ephemeris response/i);
  });

  it('computePlanetLongitude returns undefined (not throw) when computeJulianDay succeeded but the response lacked planetLongitudes', async () => {
    const { planetLongitudes, ...responseWithoutPlanetLongitudes } = MOCK_RESPONSE;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => responseWithoutPlanetLongitudes,
    });
    const jd = await computeJulianDay('2000-01-01', '12:00', 51.5074, -0.1278, 'UTC');
    const swe = await getSwe();
    await expect(computePlanetLongitude(jd, swe.SE_SUN)).resolves.toBeUndefined();
  });

  it('computePlanetSpeed throws when called before computeJulianDay for that jd', async () => {
    await expect(computePlanetSpeed(9999999.0, 'JUPITER')).rejects.toThrow(/no cached ephemeris response/i);
  });

  it('computePlanetSpeed returns undefined (not throw) when computeJulianDay succeeded but the response lacked planetSpeeds', async () => {
    const { planetSpeeds, ...responseWithoutPlanetSpeeds } = MOCK_RESPONSE;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => responseWithoutPlanetSpeeds,
    });
    const jd = await computeJulianDay('2000-01-01', '12:00', 51.5074, -0.1278, 'UTC');
    const swe = await getSwe();
    await expect(computePlanetSpeed(jd, swe.SE_JUPITER)).resolves.toBeUndefined();
  });

  it('throws a clear error when the service responds with a non-2xx status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid date/time/timezone: bad zone' }),
    });
    await expect(
      computeJulianDay('2000-01-01', '12:00', 51.5074, -0.1278, 'Not/AZone'),
    ).rejects.toThrow(/invalid/i);
  });

  it('throws a clear error when the service responds with an unparsable (non-JSON) body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0');
      },
    });
    await expect(
      computeJulianDay('2000-01-01', '12:00', 51.5074, -0.1278, 'UTC'),
    ).rejects.toThrow(/502/);
  });

  it('keeps two same-instant, different-location ascendants independent under concurrent requests', async () => {
    // Same jd (same UTC instant) for both, but two different observer
    // locations — a jd-only cache key would let the second write clobber
    // the first's location-dependent ascendant.
    const responseForNewYork = {
      julianDay: 2451545.0,
      ascendantLongitude: 10.0,
      planetLongitudes: MOCK_RESPONSE.planetLongitudes,
    };
    const responseForBoston = {
      julianDay: 2451545.0,
      ascendantLongitude: 200.0,
      planetLongitudes: MOCK_RESPONSE.planetLongitudes,
    };
    fetchMock.mockImplementation(async (url, options) => {
      const body = JSON.parse(options.body);
      const response = body.latitude === 40.7128 ? responseForNewYork : responseForBoston;
      return { ok: true, json: async () => response };
    });

    const jdNewYork = await computeJulianDay('2000-01-01', '12:00', 40.7128, -74.006, 'UTC');
    const jdBoston = await computeJulianDay('2000-01-01', '12:00', 42.3601, -71.0589, 'UTC');
    expect(jdNewYork).toBe(jdBoston);

    const ascNewYork = await computeAscendantLongitude(jdNewYork, 40.7128, -74.006);
    const ascBoston = await computeAscendantLongitude(jdBoston, 42.3601, -71.0589);
    expect(ascNewYork).toBe(10.0);
    expect(ascBoston).toBe(200.0);
  });

  it('computeBhavaMadhyas reuses the cached response from computeJulianDay for the same jd/location', async () => {
    const jd = await computeJulianDay('2000-01-01', '12:00', 51.5074, -0.1278, 'UTC');
    const madhyas = await computeBhavaMadhyas(jd, 51.5074, -0.1278);
    expect(madhyas).toEqual(MOCK_RESPONSE.bhavaMadhyas);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('computeBhavaMadhyas throws when called before computeJulianDay for that location', async () => {
    await expect(computeBhavaMadhyas(2451545.0, 1.23, 4.56)).rejects.toThrow(/no cached bhava madhyas/i);
  });

  it('computeBhavaMadhyas returns undefined (not throw) when computeJulianDay succeeded but the response lacked bhavaMadhyas', async () => {
    const { bhavaMadhyas, ...responseWithoutBhavaMadhyas } = MOCK_RESPONSE;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => responseWithoutBhavaMadhyas,
    });
    const jd = await computeJulianDay('2000-01-01', '12:00', 51.5074, -0.1278, 'UTC');
    await expect(computeBhavaMadhyas(jd, 51.5074, -0.1278)).resolves.toBeUndefined();
  });

  it('computeBhavaMadhyas still throws when computeJulianDay was never called for that jd/location at all', async () => {
    // Distinct from the "field absent from a present response" case above:
    // here no cached response exists at all for this jd/location, which is
    // a real programming error (caller forgot to call computeJulianDay).
    await expect(computeBhavaMadhyas(9999999.0, 12.34, 56.78)).rejects.toThrow(/no cached bhava madhyas/i);
  });
});
