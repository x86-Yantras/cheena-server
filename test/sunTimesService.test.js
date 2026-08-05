import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeSunriseSunset } from '../src/sunTimesService.js';

describe('sunTimesService (HTTP client)', () => {
  let fetchMock;

  beforeEach(() => {
    process.env.EPHEMERIS_SERVICE_URL = 'http://ephemeris.test';
    process.env.EPHEMERIS_SERVICE_API_KEY = 'test-api-key';
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sunrise: '05:44', sunset: '19:15' }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('POSTs to EPHEMERIS_SERVICE_URL/v1/sunrise-sunset with the API key header and returns sunrise/sunset', async () => {
    const result = await computeSunriseSunset('2026-07-27', 29.588806, 80.452122, 'Asia/Kathmandu');
    expect(result).toEqual({ sunrise: '05:44', sunset: '19:15' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://ephemeris.test/v1/sunrise-sunset',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-API-Key': 'test-api-key',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          date: '2026-07-27',
          latitude: 29.588806,
          longitude: 80.452122,
          timezone: 'Asia/Kathmandu',
        }),
      }),
    );
  });

  it('throws a clear error when the service responds with a non-2xx status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid date/time/timezone: bad zone' }),
    });
    await expect(
      computeSunriseSunset('2026-07-27', 29.588806, 80.452122, 'Not/AZone'),
    ).rejects.toThrow(/invalid/i);
  });

  it('throws a clear error when the service responds with an unparsable body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); },
    });
    await expect(
      computeSunriseSunset('2026-07-27', 29.588806, 80.452122, 'Asia/Kathmandu'),
    ).rejects.toThrow(/502/);
  });
});
