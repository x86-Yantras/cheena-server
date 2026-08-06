import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { clearCache } from '../../src/geocodeService.js';

describe('GET /api/geocode/reverse', () => {
  beforeEach(() => {
    clearCache();
    process.env.NOMINATIM_BASE_URL = 'http://nominatim.test';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'Baitadi' }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 200 with placeName for valid latitude/longitude', async () => {
    const app = createApp();
    const response = await request(app).get('/api/geocode/reverse?latitude=29.588815&longitude=80.452126');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ placeName: 'Baitadi' });
  });

  it('returns 400 when latitude is missing', async () => {
    const app = createApp();
    const response = await request(app).get('/api/geocode/reverse?longitude=80.452126');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/latitude/i);
  });

  it('returns 400 when longitude is missing', async () => {
    const app = createApp();
    const response = await request(app).get('/api/geocode/reverse?latitude=29.588815');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/longitude/i);
  });

  it('returns 400 when latitude is not numeric', async () => {
    const app = createApp();
    const response = await request(app).get('/api/geocode/reverse?latitude=abc&longitude=80.452126');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/latitude/i);
  });

  it('returns 200 with placeName: null when the upstream service fails, not a 5xx', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const app = createApp();
    const response = await request(app).get('/api/geocode/reverse?latitude=29.588815&longitude=80.452126');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ placeName: null });
  });
});

describe('GET /api/geocode/search', () => {
  beforeEach(() => {
    process.env.NOMINATIM_BASE_URL = 'http://nominatim.test';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([
        { display_name: 'Kathmandu, Bagmati Province, Nepal', lat: '27.7172', lon: '85.3240' },
      ]),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 400 when q is missing', async () => {
    const app = createApp();
    const response = await request(app).get('/api/geocode/search');
    expect(response.status).toBe(400);
  });

  it('returns 400 when q is shorter than 3 characters after trimming', async () => {
    const app = createApp();
    const response = await request(app).get('/api/geocode/search').query({ q: '  a  ' });
    expect(response.status).toBe(400);
  });

  it('returns 200 with a results array for a valid query', async () => {
    const app = createApp();
    const response = await request(app).get('/api/geocode/search').query({ q: 'Kathmandu' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      results: [{ placeName: 'Kathmandu, Bagmati Province, Nepal', latitude: 27.7172, longitude: 85.3240 }],
    });
  });
});
