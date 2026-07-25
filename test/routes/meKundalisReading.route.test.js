import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { getPool, closePool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST || 'postgres://postgres:postgres@localhost:5433/kundali_test';
const validPayload = {
  label: 'Self',
  name: 'Aarav Sharma',
  date: '1990-05-15',
  time: '14:30',
  latitude: 40.7128,
  longitude: -74.006,
};

async function registerAndLogin(app, email) {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'hunter22222' });
  return response.body.token;
}

async function createKundali(app, token) {
  const response = await request(app)
    .post('/api/me/kundalis')
    .set('Authorization', `Bearer ${token}`)
    .send(validPayload);
  return response.body.id;
}

describe('GET /api/me/kundalis/:id/reading', () => {
  let fetchMock;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    process.env.JWT_SECRET = 'test-secret';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    await runMigrations();
  });

  beforeEach(() => {
    process.env.EPHEMERIS_SERVICE_URL = 'http://ephemeris.test';
    process.env.EPHEMERIS_SERVICE_API_KEY = 'test-api-key';
    fetchMock = vi.fn(async (url) => {
      if (String(url).includes('ephemeris')) {
        return {
          ok: true,
          json: async () => ({
            julianDay: 2448026.5,
            ascendantLongitude: 15,
            planetLongitudes: {
              SUN: 10, MOON: 40, MARS: 70, MERCURY: 100,
              JUPITER: 130, VENUS: 160, SATURN: 190, RAHU: 220,
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: 'text', text: 'Generated reading text.' }] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await getPool().query('TRUNCATE kundalis, users, ai_readings, ai_reading_usage RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await closePool();
  });

  it('returns 401 without a token', async () => {
    const app = createApp();
    const response = await request(app).get('/api/me/kundalis/1/reading');
    expect(response.status).toBe(401);
  }, 20000);

  it('returns 404 for a malformed id', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'malformed@example.com');
    const response = await request(app)
      .get('/api/me/kundalis/not-a-number/reading')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(404);
  }, 20000);

  it("returns 404 for another user's kundali", async () => {
    const app = createApp();
    const tokenA = await registerAndLogin(app, 'a@example.com');
    const tokenB = await registerAndLogin(app, 'b@example.com');
    const kundaliId = await createKundali(app, tokenA);

    const response = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(response.status).toBe(404);
  }, 20000);

  it('returns 400 for an invalid area', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'badarea@example.com');
    const kundaliId = await createKundali(app, token);

    const response = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading?area=finance`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(400);
  }, 20000);

  it('generates and returns a reading, defaulting to the overview area', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'gen@example.com');
    const kundaliId = await createKundali(app, token);

    const response = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.area).toBe('overview');
    expect(response.body.content).toBe('Generated reading text.');
    expect(response.body.cached).toBe(false);
  }, 20000);

  it('returns a cached reading on the second request without calling the API again', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'cache@example.com');
    const kundaliId = await createKundali(app, token);

    await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading?area=career`)
      .set('Authorization', `Bearer ${token}`);
    const anthropicCallsAfterFirst = fetchMock.mock.calls.filter((c) => !String(c[0]).includes('ephemeris')).length;

    const second = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading?area=career`)
      .set('Authorization', `Bearer ${token}`);

    expect(second.status).toBe(200);
    expect(second.body.cached).toBe(true);
    expect(second.body.content).toBe('Generated reading text.');
    const anthropicCallsAfterSecond = fetchMock.mock.calls.filter((c) => !String(c[0]).includes('ephemeris')).length;
    expect(anthropicCallsAfterSecond).toBe(anthropicCallsAfterFirst);
  }, 20000);

  it('caches overview and career readings independently for the same kundali', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'areas@example.com');
    const kundaliId = await createKundali(app, token);

    await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading?area=overview`)
      .set('Authorization', `Bearer ${token}`);
    const careerResponse = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading?area=career`)
      .set('Authorization', `Bearer ${token}`);

    expect(careerResponse.status).toBe(200);
    expect(careerResponse.body.cached).toBe(false);
  }, 20000);

  it('returns 429 after 10 new generations in a day, without counting cache hits', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'limit@example.com');
    const kundaliId = await createKundali(app, token);
    const areas = ['overview', 'career', 'marriage', 'health', 'wealth'];

    // 5 distinct-area generations, then re-request the same 5 (cache hits, free).
    for (const area of areas) {
      const r = await request(app)
        .get(`/api/me/kundalis/${kundaliId}/reading?area=${area}`)
        .set('Authorization', `Bearer ${token}`);
      expect(r.status).toBe(200);
    }
    for (const area of areas) {
      const r = await request(app)
        .get(`/api/me/kundalis/${kundaliId}/reading?area=${area}`)
        .set('Authorization', `Bearer ${token}`);
      expect(r.body.cached).toBe(true);
    }

    // A second kundali lets us generate 5 more distinct-area readings (10 total for the day).
    const kundaliId2 = await createKundali(app, token);
    for (const area of areas) {
      const r = await request(app)
        .get(`/api/me/kundalis/${kundaliId2}/reading?area=${area}`)
        .set('Authorization', `Bearer ${token}`);
      expect(r.status).toBe(200);
    }

    // 11th distinct generation for the day is rejected.
    const kundaliId3 = await createKundali(app, token);
    const overLimit = await request(app)
      .get(`/api/me/kundalis/${kundaliId3}/reading?area=overview`)
      .set('Authorization', `Bearer ${token}`);
    expect(overLimit.status).toBe(429);
  }, 30000);

  it('returns 502 and caches nothing when the Anthropic API call fails', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'fail@example.com');
    const kundaliId = await createKundali(app, token);

    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('ephemeris')) {
        return {
          ok: true,
          json: async () => ({
            julianDay: 2448026.5,
            ascendantLongitude: 15,
            planetLongitudes: {
              SUN: 10, MOON: 40, MARS: 70, MERCURY: 100,
              JUPITER: 130, VENUS: 160, SATURN: 190, RAHU: 220,
            },
          }),
        };
      }
      return { ok: false, status: 500, json: async () => ({ error: { message: 'overloaded' } }) };
    });

    const response = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(502);

    const { rows } = await getPool().query('SELECT * FROM ai_readings WHERE kundali_id = $1', [kundaliId]);
    expect(rows).toHaveLength(0);
  }, 20000);
});
