import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reverseGeocode, clearCache } from '../src/geocodeService.js';

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
});
