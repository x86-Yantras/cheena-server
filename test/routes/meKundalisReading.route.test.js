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

  it('returns 400 for an unknown provider override', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'badprovider@example.com');
    const kundaliId = await createKundali(app, token);

    const response = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading?provider=bogus`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(400);
  }, 20000);

  it('passes provider/model overrides through and does not cache or count against quota', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'override@example.com');
    const kundaliId = await createKundali(app, token);
    process.env.GEMINI_API_KEY = 'test-gemini-key';

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
      if (String(url).includes('generativelanguage.googleapis.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'A Gemini test reading.' }] }, finishReason: 'STOP' }],
          }),
        };
      }
      // Anthropic (default provider) shape
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: 'text', text: 'Generated reading text.' }] }),
      };
    });

    const overrideResponse = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading?provider=gemini&model=gemini-1.5-pro`)
      .set('Authorization', `Bearer ${token}`);
    expect(overrideResponse.status).toBe(200);
    expect(overrideResponse.body.content).toBe('A Gemini test reading.');
    const [overrideUrl] = fetchMock.mock.calls.find((c) => !String(c[0]).includes('ephemeris'));
    expect(overrideUrl).toContain('gemini-1.5-pro');

    const { rows: cachedRows } = await getPool().query(
      'SELECT * FROM ai_readings WHERE kundali_id = $1 AND area = $2',
      [kundaliId, 'overview']
    );
    expect(cachedRows).toHaveLength(0);

    const usersRes = await getPool().query('SELECT id FROM users WHERE email = $1', ['override@example.com']);
    const usageRows = await getPool().query(
      'SELECT count FROM ai_reading_usage WHERE user_id = $1 AND usage_date = CURRENT_DATE',
      [usersRes.rows[0].id]
    );
    expect(usageRows.rows).toHaveLength(0);

    const defaultResponse = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading`)
      .set('Authorization', `Bearer ${token}`);
    expect(defaultResponse.status).toBe(200);
    expect(defaultResponse.body.cached).toBe(false);
  }, 20000);

  it('treats an empty-string provider/model override as absent (caches and counts against quota)', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'emptyoverride@example.com');
    const kundaliId = await createKundali(app, token);

    const response = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading?provider=&model=`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.cached).toBe(false);

    const { rows } = await getPool().query(
      'SELECT * FROM ai_readings WHERE kundali_id = $1 AND area = $2',
      [kundaliId, 'overview']
    );
    expect(rows).toHaveLength(1);
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

  it('invalidates the cached reading when the kundali is PATCHed with a new result', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'invalidate@example.com');
    const kundaliId = await createKundali(app, token);

    const firstReading = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading`)
      .set('Authorization', `Bearer ${token}`);
    expect(firstReading.body.cached).toBe(false);

    const cachedBefore = await getPool().query(
      'SELECT * FROM ai_readings WHERE kundali_id = $1',
      [kundaliId]
    );
    expect(cachedBefore.rows).toHaveLength(1);

    const kundaliResponse = await request(app)
      .get(`/api/me/kundalis/${kundaliId}`)
      .set('Authorization', `Bearer ${token}`);
    const newResult = { ...kundaliResponse.body.result, julianDay: 1234567 };

    const patchResponse = await request(app)
      .patch(`/api/me/kundalis/${kundaliId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Self', name: 'Aarav Sharma', result: newResult });
    expect(patchResponse.status).toBe(200);

    const cachedAfter = await getPool().query(
      'SELECT * FROM ai_readings WHERE kundali_id = $1',
      [kundaliId]
    );
    expect(cachedAfter.rows).toHaveLength(0);

    const secondReading = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading`)
      .set('Authorization', `Bearer ${token}`);
    expect(secondReading.status).toBe(200);
    expect(secondReading.body.cached).toBe(false);
  }, 20000);

  it('does not invalidate the cached reading when PATCHed without a new result', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'no-invalidate@example.com');
    const kundaliId = await createKundali(app, token);

    await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading`)
      .set('Authorization', `Bearer ${token}`);

    const patchResponse = await request(app)
      .patch(`/api/me/kundalis/${kundaliId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Self Renamed', name: 'Aarav Sharma' });
    expect(patchResponse.status).toBe(200);

    const cachedAfter = await getPool().query(
      'SELECT * FROM ai_readings WHERE kundali_id = $1',
      [kundaliId]
    );
    expect(cachedAfter.rows).toHaveLength(1);
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

  it('returns the winning cached reading when a concurrent request already inserted it (unique-violation race)', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'race@example.com');
    const kundaliId = await createKundali(app, token);

    // Simulate another concurrent request "winning" the generation and inserting
    // its row into ai_readings while our request's Anthropic call is still in flight.
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
      await getPool().query(
        'INSERT INTO ai_readings (kundali_id, area, content) VALUES ($1, $2, $3)',
        [kundaliId, 'overview', 'Winning concurrent reading.']
      );
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: 'text', text: 'Losing generated text.' }] }),
      };
    });

    const response = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.cached).toBe(true);
    expect(response.body.content).toBe('Winning concurrent reading.');

    const { rows } = await getPool().query(
      'SELECT * FROM ai_readings WHERE kundali_id = $1 AND area = $2',
      [kundaliId, 'overview']
    );
    expect(rows).toHaveLength(1);
  }, 20000);

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

  it('does not consume daily quota when the Anthropic API call fails', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'noquota@example.com');
    const kundaliId = await createKundali(app, token);

    // First, a successful generation to establish a baseline usage count.
    await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading?area=overview`)
      .set('Authorization', `Bearer ${token}`);

    const usersRes = await getPool().query('SELECT id FROM users WHERE email = $1', ['noquota@example.com']);
    const userId = usersRes.rows[0].id;
    const before = await getPool().query(
      'SELECT count FROM ai_reading_usage WHERE user_id = $1 AND usage_date = CURRENT_DATE',
      [userId]
    );
    expect(before.rows[0].count).toBe(1);

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
      .get(`/api/me/kundalis/${kundaliId}/reading?area=career`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(502);

    const after = await getPool().query(
      'SELECT count FROM ai_reading_usage WHERE user_id = $1 AND usage_date = CURRENT_DATE',
      [userId]
    );
    expect(after.rows[0].count).toBe(1);
  }, 20000);
});
