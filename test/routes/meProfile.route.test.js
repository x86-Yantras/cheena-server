import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { getPool, closePool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST || 'postgres://postgres:postgres@localhost:5433/kundali_test';

async function registerAndLogin(app, email) {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'hunter22222' });
  return response.body.token;
}

describe('/api/me/profile', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    process.env.JWT_SECRET = 'test-secret';
    await runMigrations();
  });

  afterEach(async () => {
    await getPool().query('TRUNCATE users RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await closePool();
  });

  it('returns 401 without a token on GET', async () => {
    const app = createApp();
    const response = await request(app).get('/api/me/profile');
    expect(response.status).toBe(401);
  });

  it('returns 401 without a token on PATCH', async () => {
    const app = createApp();
    const response = await request(app).patch('/api/me/profile').send({ name: 'Jane' });
    expect(response.status).toBe(401);
  });

  it('GET returns the profile with a null name for a fresh user', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'profile1@example.com');
    const response = await request(app)
      .get('/api/me/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: expect.any(String), email: 'profile1@example.com', name: null });
  });

  it('PATCH updates the name and it is reflected on a subsequent GET', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'profile2@example.com');
    const patchResponse = await request(app)
      .patch('/api/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jane Doe' });
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.name).toBe('Jane Doe');

    const getResponse = await request(app)
      .get('/api/me/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(getResponse.body.name).toBe('Jane Doe');
  });

  it('PATCH rejects an empty name with 400', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'profile3@example.com');
    const response = await request(app)
      .patch('/api/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '   ' });
    expect(response.status).toBe(400);
  });

  it('PATCH rejects a name longer than 100 characters with 400', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'profile7@example.com');
    const response = await request(app)
      .patch('/api/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'a'.repeat(101) });
    expect(response.status).toBe(400);
  });

  it('PATCH /password changes the password so the old one no longer logs in', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'profile4@example.com');
    const response = await request(app)
      .patch('/api/me/profile/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'hunter22222', newPassword: 'newpassword123' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'profile4@example.com', password: 'hunter22222' });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'profile4@example.com', password: 'newpassword123' });
    expect(newLogin.status).toBe(200);
  });

  it('PATCH /password returns 401 for a wrong current password', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'profile5@example.com');
    const response = await request(app)
      .patch('/api/me/profile/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrongpassword', newPassword: 'newpassword123' });
    expect(response.status).toBe(401);
  });

  it('PATCH /password returns 400 for a short new password', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'profile6@example.com');
    const response = await request(app)
      .patch('/api/me/profile/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'hunter22222', newPassword: 'short' });
    expect(response.status).toBe(400);
  });
});
