import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { getPool, closePool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST || 'postgres://postgres:postgres@localhost:5433/kundali_test';
const validPayload = {
  label: 'Self',
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

  afterEach(async () => {
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

  it('returns 400 for an invalid payload', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'invalid@example.com');
    const response = await request(app)
      .post('/api/me/kundalis')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload, label: '' });
    expect(response.status).toBe(400);
  }, 20000);
});
