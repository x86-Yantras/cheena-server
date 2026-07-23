import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { getPool, closePool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST || 'postgres://postgres:postgres@localhost:5433/kundali_test';

describe('auth routes', () => {
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

  it('registers a new user and returns a token', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'Jane@Example.com', password: 'hunter22222' });
    expect(response.status).toBe(201);
    expect(response.body.token).toBeDefined();
    expect(response.body.user.email).toBe('jane@example.com');
  });

  it('returns 409 when the email is already registered', async () => {
    const app = createApp();
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@example.com', password: 'hunter22222' });
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@example.com', password: 'hunter22222' });
    expect(response.status).toBe(409);
  });

  it('returns 400 for a weak password', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'weak@example.com', password: 'short' });
    expect(response.status).toBe(400);
  });

  it('logs in with correct credentials', async () => {
    const app = createApp();
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'login@example.com', password: 'hunter22222' });
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'hunter22222' });
    expect(response.status).toBe(200);
    expect(response.body.token).toBeDefined();
  });

  it('returns 401 for a wrong password', async () => {
    const app = createApp();
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'wrongpw@example.com', password: 'hunter22222' });
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrongpw@example.com', password: 'nope12345' });
    expect(response.status).toBe(401);
  });
});
