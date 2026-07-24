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

describe('/api/me/kundalis', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    process.env.JWT_SECRET = 'test-secret';
    await runMigrations();
  });

  beforeEach(() => {
    process.env.EPHEMERIS_SERVICE_URL = 'http://ephemeris.test';
    process.env.EPHEMERIS_SERVICE_API_KEY = 'test-api-key';
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

  afterEach(async () => {
    vi.unstubAllGlobals();
    await getPool().query('TRUNCATE kundalis, users RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await closePool();
  });

  it('returns 401 without a token', async () => {
    const app = createApp();
    const response = await request(app).get('/api/me/kundalis');
    expect(response.status).toBe(401);
  }, 20000);

  it('saves and lists a kundali for the authenticated user', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'save@example.com');

    const createResponse = await request(app)
      .post('/api/me/kundalis')
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload);
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.result.planets).toHaveLength(9);

    const listResponse = await request(app)
      .get('/api/me/kundalis')
      .set('Authorization', `Bearer ${token}`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0].label).toBe('Self');
  }, 20000);

  it("returns 404 fetching another user's kundali by id", async () => {
    const app = createApp();
    const tokenA = await registerAndLogin(app, 'a@example.com');
    const tokenB = await registerAndLogin(app, 'b@example.com');

    const createResponse = await request(app)
      .post('/api/me/kundalis')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(validPayload);
    const kundaliId = createResponse.body.id;

    const response = await request(app)
      .get(`/api/me/kundalis/${kundaliId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(response.status).toBe(404);
  }, 20000);

  it('deletes a kundali owned by the requester', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'del@example.com');
    const createResponse = await request(app)
      .post('/api/me/kundalis')
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload);
    const kundaliId = createResponse.body.id;

    const deleteResponse = await request(app)
      .delete(`/api/me/kundalis/${kundaliId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteResponse.status).toBe(204);

    const getResponse = await request(app)
      .get(`/api/me/kundalis/${kundaliId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getResponse.status).toBe(404);
  }, 20000);

  it('returns 404 for a malformed id on GET', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'malformed-get@example.com');
    const response = await request(app)
      .get('/api/me/kundalis/not-a-number')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(404);
  }, 20000);

  it('returns 404 for a malformed id on DELETE', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'malformed-delete@example.com');
    const response = await request(app)
      .delete('/api/me/kundalis/not-a-number')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(404);
  }, 20000);

  it('returns 400 for an invalid payload', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'invalid@example.com');
    const response = await request(app)
      .post('/api/me/kundalis')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload, label: '' });
    expect(response.status).toBe(400);
  }, 20000);

  it('returns 400 when name is missing', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'noname@example.com');
    const response = await request(app)
      .post('/api/me/kundalis')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload, name: '' });
    expect(response.status).toBe(400);
  }, 20000);

  it('persists and returns the name field', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'name@example.com');
    const createResponse = await request(app)
      .post('/api/me/kundalis')
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload);
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.name).toBe('Aarav Sharma');

    const listResponse = await request(app)
      .get('/api/me/kundalis')
      .set('Authorization', `Bearer ${token}`);
    expect(listResponse.body[0].name).toBe('Aarav Sharma');
  }, 20000);

  it('updates the label and name of a kundali owned by the requester', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'edit@example.com');
    const createResponse = await request(app)
      .post('/api/me/kundalis')
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload);
    const kundaliId = createResponse.body.id;

    const patchResponse = await request(app)
      .patch(`/api/me/kundalis/${kundaliId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Sister', name: 'Priya Sharma' });
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.label).toBe('Sister');
    expect(patchResponse.body.name).toBe('Priya Sharma');

    const getResponse = await request(app)
      .get(`/api/me/kundalis/${kundaliId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getResponse.body.label).toBe('Sister');
    expect(getResponse.body.name).toBe('Priya Sharma');
  }, 20000);

  it("returns 404 editing another user's kundali", async () => {
    const app = createApp();
    const tokenA = await registerAndLogin(app, 'editA@example.com');
    const tokenB = await registerAndLogin(app, 'editB@example.com');
    const createResponse = await request(app)
      .post('/api/me/kundalis')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(validPayload);
    const kundaliId = createResponse.body.id;

    const response = await request(app)
      .patch(`/api/me/kundalis/${kundaliId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ label: 'Sister', name: 'Priya Sharma' });
    expect(response.status).toBe(404);
  }, 20000);

  it('returns 400 when editing with an empty label or name', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'edit-invalid@example.com');
    const createResponse = await request(app)
      .post('/api/me/kundalis')
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload);
    const kundaliId = createResponse.body.id;

    const response = await request(app)
      .patch(`/api/me/kundalis/${kundaliId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: '', name: 'Priya Sharma' });
    expect(response.status).toBe(400);
  }, 20000);

  it('returns 404 for a malformed id on PATCH', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'malformed-patch@example.com');
    const response = await request(app)
      .patch('/api/me/kundalis/not-a-number')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Sister', name: 'Priya Sharma' });
    expect(response.status).toBe(404);
  }, 20000);
});
