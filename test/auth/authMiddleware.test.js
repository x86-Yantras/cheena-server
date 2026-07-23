import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requireAuth } from '../../src/auth/authMiddleware.js';
import { signToken } from '../../src/auth/jwt.js';

function buildTestApp() {
  const app = express();
  app.get('/protected', requireAuth, (req, res) => {
    res.json({ userId: req.userId });
  });
  return app;
}

describe('requireAuth', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const response = await request(buildTestApp()).get('/protected');
    expect(response.status).toBe(401);
  });

  it('returns 401 when the token is invalid', async () => {
    const response = await request(buildTestApp())
      .get('/protected')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(response.status).toBe(401);
  });

  it('attaches userId and calls next for a valid token', async () => {
    const token = signToken({ userId: 7 });
    const response = await request(buildTestApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.userId).toBe(7);
  });
});
