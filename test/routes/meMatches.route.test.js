import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { getPool, closePool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST || 'postgres://postgres:postgres@localhost:5433/kundali_test';

const groomInput = { date: '1990-05-15', time: '14:30', latitude: 40.7128, longitude: -74.006 };
const brideInput = { date: '1992-08-20', time: '09:15', latitude: 28.6139, longitude: 77.209 };

async function registerAndLogin(app, email) {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'hunter22222' });
  return response.body.token;
}

describe('/api/me/matches', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    process.env.JWT_SECRET = 'test-secret';
    await runMigrations();
  });

  afterEach(async () => {
    await getPool().query('TRUNCATE matches, kundalis, users RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await closePool();
  });

  it('returns 401 without a token', async () => {
    const app = createApp();
    const response = await request(app).get('/api/me/matches');
    expect(response.status).toBe(401);
  }, 20000);

  it('creates a match from two fresh-entry sides and lists it', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'milan@example.com');

    const createResponse = await request(app)
      .post('/api/me/matches')
      .set('Authorization', `Bearer ${token}`)
      .send({ groomLabel: 'Ravi', brideLabel: 'Sita', groom: groomInput, bride: brideInput });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.groomLabel).toBe('Ravi');
    expect(createResponse.body.brideLabel).toBe('Sita');
    expect(createResponse.body.groomKundaliId).toBeNull();
    expect(createResponse.body.report.ashtakoot.maxPoints).toBe(36);
    expect(createResponse.body.report.verdict.totalPoints).toBeGreaterThanOrEqual(0);

    const listResponse = await request(app)
      .get('/api/me/matches')
      .set('Authorization', `Bearer ${token}`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0]).toMatchObject({ groomLabel: 'Ravi', brideLabel: 'Sita' });
    expect(typeof listResponse.body[0].totalPoints).toBe('number');
  }, 30000);

  it('creates a match using a saved kundali for one side', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'saved-side@example.com');

    const savedKundali = await request(app)
      .post('/api/me/kundalis')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Groom Self', ...groomInput });

    const createResponse = await request(app)
      .post('/api/me/matches')
      .set('Authorization', `Bearer ${token}`)
      .send({
        groomLabel: 'Ravi',
        brideLabel: 'Sita',
        groom: { kundaliId: savedKundali.body.id },
        bride: brideInput,
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.groomKundaliId).toBe(savedKundali.body.id);
    expect(createResponse.body.groomInput.date).toBe(groomInput.date);
  }, 30000);

  it("returns 404 when the saved kundali side isn't owned by the requester", async () => {
    const app = createApp();
    const tokenA = await registerAndLogin(app, 'owner@example.com');
    const tokenB = await registerAndLogin(app, 'other@example.com');

    const savedKundali = await request(app)
      .post('/api/me/kundalis')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ label: 'Self', ...groomInput });

    const response = await request(app)
      .post('/api/me/matches')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        groomLabel: 'Ravi',
        brideLabel: 'Sita',
        groom: { kundaliId: savedKundali.body.id },
        bride: brideInput,
      });

    expect(response.status).toBe(404);
  }, 30000);

  it('returns 400 for an invalid fresh-entry side', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'invalid-side@example.com');

    const response = await request(app)
      .post('/api/me/matches')
      .set('Authorization', `Bearer ${token}`)
      .send({ groomLabel: 'Ravi', brideLabel: 'Sita', groom: { ...groomInput, date: 'not-a-date' }, bride: brideInput });

    expect(response.status).toBe(400);
  }, 20000);

  it('returns 400 for a non-integer kundaliId', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'bad-kundali-id@example.com');

    const response = await request(app)
      .post('/api/me/matches')
      .set('Authorization', `Bearer ${token}`)
      .send({
        groomLabel: 'Ravi',
        brideLabel: 'Sita',
        groom: { kundaliId: 'not-a-number' },
        bride: brideInput,
      });

    expect(response.status).toBe(400);
  }, 20000);

  it('returns 400 for a missing label', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'no-label@example.com');

    const response = await request(app)
      .post('/api/me/matches')
      .set('Authorization', `Bearer ${token}`)
      .send({ groomLabel: '', brideLabel: 'Sita', groom: groomInput, bride: brideInput });

    expect(response.status).toBe(400);
  }, 20000);

  it('fetches and deletes a match by id', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'delete-match@example.com');

    const createResponse = await request(app)
      .post('/api/me/matches')
      .set('Authorization', `Bearer ${token}`)
      .send({ groomLabel: 'Ravi', brideLabel: 'Sita', groom: groomInput, bride: brideInput });
    const matchId = createResponse.body.id;

    const getResponse = await request(app)
      .get(`/api/me/matches/${matchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.id).toBe(matchId);

    const deleteResponse = await request(app)
      .delete(`/api/me/matches/${matchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteResponse.status).toBe(204);

    const getAfterDelete = await request(app)
      .get(`/api/me/matches/${matchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getAfterDelete.status).toBe(404);
  }, 30000);

  it('returns 404 for a malformed id', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'malformed-match@example.com');
    const response = await request(app)
      .get('/api/me/matches/not-a-number')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(404);
  }, 20000);
});
