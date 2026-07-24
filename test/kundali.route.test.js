import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('POST /api/kundali', () => {
  const validPayload = { date: '1990-05-15', time: '14:30', latitude: 40.7128, longitude: -74.006 };

  beforeEach(() => {
    process.env.EPHEMERIS_SERVICE_URL = 'http://ephemeris.test';
    process.env.EPHEMERIS_SERVICE_API_KEY = 'test-api-key';
    // 'returns 400 for an invalid timezone override' below never reaches this
    // mock: validateKundaliInput() rejects unknown IANA zones (via
    // IANAZone.isValidZone) before calculateKundali()/fetch is called, so a
    // single unconditional success response covers every case here.
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

  it('returns 200 with ascendant and planets for a valid payload', async () => {
    const app = createApp();
    const response = await request(app).post('/api/kundali').send(validPayload);
    expect(response.status).toBe(200);
    expect(response.body.ascendant).toBeDefined();
    expect(response.body.planets).toHaveLength(9);
  }, 20000);

  it('returns 400 when date is missing', async () => {
    const app = createApp();
    const { date, ...rest } = validPayload;
    const response = await request(app).post('/api/kundali').send(rest);
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/date/i);
  });

  it('returns 400 when latitude is out of range', async () => {
    const app = createApp();
    const response = await request(app).post('/api/kundali').send({ ...validPayload, latitude: 200 });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/latitude/i);
  });

  it('returns 400 when time format is invalid', async () => {
    const app = createApp();
    const response = await request(app).post('/api/kundali').send({ ...validPayload, time: '2:30pm' });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/time/i);
  });

  it('accepts a valid IANA timezone override and returns 200', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/kundali')
      .send({ ...validPayload, timezone: 'Asia/Kolkata' });
    expect(response.status).toBe(200);
  }, 20000);

  it('returns 400 for an invalid timezone override', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/kundali')
      .send({ ...validPayload, timezone: 'Not/AZone' });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/timezone/i);
  });
});
