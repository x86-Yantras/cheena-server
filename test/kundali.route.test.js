import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('POST /api/kundali', () => {
  const validPayload = { date: '1990-05-15', time: '14:30', latitude: 40.7128, longitude: -74.006 };

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
});
