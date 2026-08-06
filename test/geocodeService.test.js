import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reverseGeocode, searchPlaces, clearCache } from '../src/geocodeService.js';

describe('geocodeService', () => {
  let fetchMock;

  beforeEach(() => {
    process.env.NOMINATIM_BASE_URL = 'http://nominatim.test';
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
    clearCache();
  });

  it('returns the district name from a successful Nominatim response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'Baitadi', display_name: 'Baitadi, Sudurpashchim, Nepal' }),
    });

    const result = await reverseGeocode(29.588815, 80.452126);

    expect(result).toBe('Baitadi');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://nominatim.test/reverse?format=jsonv2&zoom=8&lat=29.588815&lon=80.452126',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'kundali-app (kiran.bhatt7638@gmail.com)',
        }),
      }),
    );
  });

  it('falls back to the first segment of display_name when name is absent', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ display_name: 'Baitadi, Sudurpashchim, Nepal' }),
    });

    const result = await reverseGeocode(29.588815, 80.452126);

    expect(result).toBe('Baitadi');
  });

  it('returns null (does not throw) on a non-2xx upstream response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    const result = await reverseGeocode(29.588815, 80.452126);

    expect(result).toBeNull();
  });

  it('returns null (does not throw) when the response body is unparsable', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0');
      },
    });

    const result = await reverseGeocode(29.588815, 80.452126);

    expect(result).toBeNull();
  });

  it('returns null when a network error is thrown', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await reverseGeocode(29.588815, 80.452126);

    expect(result).toBeNull();
  });

  it('caches a successful lookup and does not re-fetch for the same rounded coordinates', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'Baitadi' }),
    });

    await reverseGeocode(29.588815, 80.452126);
    const second = await reverseGeocode(29.588820, 80.452130); // rounds to same 3-decimal key

    expect(second).toBe('Baitadi');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache a null result, so a later call re-fetches', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    await reverseGeocode(29.588815, 80.452126);
    await reverseGeocode(29.588815, 80.452126);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('defaults NOMINATIM_BASE_URL to the public Nominatim instance when unset', async () => {
    delete process.env.NOMINATIM_BASE_URL;
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ name: 'Baitadi' }) });

    await reverseGeocode(1.111111, 2.222222);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=8&lat=1.111111&lon=2.222222',
      expect.anything(),
    );
  });

  it('returns mapped results from a successful Nominatim search response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ([
        { display_name: 'Kathmandu, Bagmati Province, Nepal', lat: '27.7172', lon: '85.3240' },
        { display_name: 'Kathmandu, Sudurpashchim Province, Nepal', lat: '29.3', lon: '80.1' },
      ]),
    });

    const results = await searchPlaces('Kathmandu');

    expect(results).toEqual([
      { placeName: 'Kathmandu, Bagmati Province, Nepal', latitude: 27.7172, longitude: 85.3240 },
      { placeName: 'Kathmandu, Sudurpashchim Province, Nepal', latitude: 29.3, longitude: 80.1 },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://nominatim.test/search?format=jsonv2&limit=5&q=Kathmandu',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'kundali-app (kiran.bhatt7638@gmail.com)',
        }),
      }),
    );
  });

  it('URL-encodes the query', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

    await searchPlaces('New York, USA');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://nominatim.test/search?format=jsonv2&limit=5&q=New%20York%2C%20USA',
      expect.anything(),
    );
  });

  it('returns an empty array on a non-2xx upstream response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    const results = await searchPlaces('Kathmandu');

    expect(results).toEqual([]);
  });

  it('returns an empty array when the response body is unparsable', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); },
    });

    const results = await searchPlaces('Kathmandu');

    expect(results).toEqual([]);
  });

  it('returns an empty array when a network error is thrown', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const results = await searchPlaces('Kathmandu');

    expect(results).toEqual([]);
  });

  it('returns an empty array when the response body is not an array', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ error: 'not found' }) });

    const results = await searchPlaces('asdkjaslkdj');

    expect(results).toEqual([]);
  });

  it('filters out results missing display_name, lat, or lon, or with unparsable coordinates', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ([
        { display_name: 'Valid Place', lat: '1.0', lon: '2.0' },
        { lat: '1.0', lon: '2.0' }, // missing display_name
        { display_name: 'Bad Lat', lat: 'not-a-number', lon: '2.0' },
        { display_name: 'Missing Lon', lat: '1.0' },
      ]),
    });

    const results = await searchPlaces('test');

    expect(results).toEqual([{ placeName: 'Valid Place', latitude: 1.0, longitude: 2.0 }]);
  });

  it('defaults NOMINATIM_BASE_URL to the public Nominatim instance when unset', async () => {
    delete process.env.NOMINATIM_BASE_URL;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

    await searchPlaces('Kathmandu');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=Kathmandu',
      expect.anything(),
    );
  });
});
