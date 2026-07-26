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

describe('AI chat routes', () => {
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
        json: async () => ({ choices: [{ message: { content: 'Generated chat reply.' } }] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await getPool().query(
      'TRUNCATE kundalis, users, ai_readings, ai_reading_usage, ai_chat_messages RESTART IDENTITY CASCADE'
    );
  });

  afterAll(async () => {
    await closePool();
  });

  it('returns 401 without a token', async () => {
    const app = createApp();
    const response = await request(app).get('/api/me/kundalis/1/chat');
    expect(response.status).toBe(401);
  }, 20000);

  it("returns 404 for another user's kundali on GET", async () => {
    const app = createApp();
    const tokenA = await registerAndLogin(app, 'a@example.com');
    const tokenB = await registerAndLogin(app, 'b@example.com');
    const kundaliId = await createKundali(app, tokenA);

    const response = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/chat`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(response.status).toBe(404);
  }, 20000);

  it('returns an empty array when no messages exist yet', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'empty@example.com');
    const kundaliId = await createKundali(app, token);

    const response = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/chat`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  }, 20000);

  it('returns 400 when neither area nor message is provided', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'noinput@example.com');
    const kundaliId = await createKundali(app, token);

    const response = await request(app)
      .post(`/api/me/kundalis/${kundaliId}/chat`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(400);
  }, 20000);

  it('returns 400 for an invalid area', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'badarea@example.com');
    const kundaliId = await createKundali(app, token);

    const response = await request(app)
      .post(`/api/me/kundalis/${kundaliId}/chat`)
      .set('Authorization', `Bearer ${token}`)
      .send({ area: 'finance' });
    expect(response.status).toBe(400);
  }, 20000);

  it('returns 400 for a message over the length limit', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'toolong@example.com');
    const kundaliId = await createKundali(app, token);

    const response = await request(app)
      .post(`/api/me/kundalis/${kundaliId}/chat`)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'x'.repeat(1001) });
    expect(response.status).toBe(400);
  }, 20000);

  it('persists a user/assistant exchange and returns the assistant message', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'chat@example.com');
    const kundaliId = await createKundali(app, token);

    const response = await request(app)
      .post(`/api/me/kundalis/${kundaliId}/chat`)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'When will I get promoted?' });

    expect(response.status).toBe(201);
    expect(response.body.role).toBe('assistant');
    expect(response.body.content).toBe('Generated chat reply.');

    const history = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/chat`)
      .set('Authorization', `Bearer ${token}`);
    expect(history.body).toHaveLength(2);
    expect(history.body[0]).toMatchObject({ role: 'user', content: 'When will I get promoted?' });
    expect(history.body[1]).toMatchObject({ role: 'assistant', content: 'Generated chat reply.' });
  }, 20000);

  it('persists the canonical area prompt as the user message when a topic chip is used', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'topicchip@example.com');
    const kundaliId = await createKundali(app, token);

    const response = await request(app)
      .post(`/api/me/kundalis/${kundaliId}/chat`)
      .set('Authorization', `Bearer ${token}`)
      .send({ area: 'marriage' });

    expect(response.status).toBe(201);

    const history = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/chat`)
      .set('Authorization', `Bearer ${token}`);
    expect(history.body[0].role).toBe('user');
    expect(history.body[0].content).toMatch(/marriage/i);
  }, 20000);

  it('returns 429 after 10 messages in a day', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'chatlimit@example.com');
    const kundaliId = await createKundali(app, token);

    for (let i = 0; i < 10; i += 1) {
      const r = await request(app)
        .post(`/api/me/kundalis/${kundaliId}/chat`)
        .set('Authorization', `Bearer ${token}`)
        .send({ message: `Question ${i}` });
      expect(r.status).toBe(201);
    }

    const overLimit = await request(app)
      .post(`/api/me/kundalis/${kundaliId}/chat`)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'One too many' });
    expect(overLimit.status).toBe(429);
  }, 30000);

  it('does not consume daily quota when the provider call fails', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'chatfail@example.com');
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
      .post(`/api/me/kundalis/${kundaliId}/chat`)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Will this fail?' });
    expect(response.status).toBe(502);

    const usersRes = await getPool().query('SELECT id FROM users WHERE email = $1', ['chatfail@example.com']);
    const usageRows = await getPool().query(
      'SELECT count FROM ai_reading_usage WHERE user_id = $1 AND usage_date = CURRENT_DATE',
      [usersRes.rows[0].id]
    );
    expect(usageRows.rows[0].count).toBe(0);
  }, 20000);

  it('clears chat history when the kundali is PATCHed with a new result', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'chatinvalidate@example.com');
    const kundaliId = await createKundali(app, token);

    await request(app)
      .post(`/api/me/kundalis/${kundaliId}/chat`)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Tell me something.' });

    const kundaliResponse = await request(app)
      .get(`/api/me/kundalis/${kundaliId}`)
      .set('Authorization', `Bearer ${token}`);
    const newResult = { ...kundaliResponse.body.result, julianDay: 1234567 };

    await request(app)
      .patch(`/api/me/kundalis/${kundaliId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Self', name: 'Aarav Sharma', result: newResult });

    const history = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/chat`)
      .set('Authorization', `Bearer ${token}`);
    expect(history.body).toEqual([]);
  }, 20000);
});
