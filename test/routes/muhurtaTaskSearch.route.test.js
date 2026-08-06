import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('GET /api/muhurta/task-search', () => {
  it('returns 400 for an unknown task type', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta/task-search').query({
      task: 'not-a-real-task', from: '2026-08-11', to: '2026-08-17', latitude: 27.7172, longitude: 85.3240,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when "to" is before "from"', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta/task-search').query({
      task: 'business', from: '2026-08-17', to: '2026-08-11', latitude: 27.7172, longitude: 85.3240,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when the date range exceeds 60 days', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta/task-search').query({
      task: 'business', from: '2026-01-01', to: '2026-12-31', latitude: 27.7172, longitude: 85.3240,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a calendar-invalid date', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta/task-search').query({
      task: 'business', from: '2026-02-31', to: '2026-08-17', latitude: 27.7172, longitude: 85.3240,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an empty-string latitude', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta/task-search').query({
      task: 'business', from: '2026-08-11', to: '2026-08-17', latitude: '', longitude: 85.3240,
    });
    expect(res.status).toBe(400);
  });

  it('returns a MuhurtaResult shape for a valid request', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta/task-search').query({
      task: 'business', from: '2026-08-11', to: '2026-08-17', latitude: 27.7172, longitude: 85.3240, timezone: 'Asia/Kathmandu',
    });
    expect(res.status).toBe(200);
    expect(res.body.task).toBe('business');
    expect(res.body.windows).toHaveLength(7);
    expect(res.body.windows[0].score).toBeGreaterThanOrEqual(res.body.windows[6].score);
  }, 60000);

  it('accepts griha-pravesh as a valid task', async () => {
    const app = createApp();
    const response = await request(app).get('/api/muhurta/task-search').query({
      task: 'griha-pravesh', from: '2026-08-01', to: '2026-08-01', latitude: 27.7172, longitude: 85.3240, timezone: 'Asia/Kathmandu',
    });
    expect(response.status).toBe(200);
    expect(response.body.windows[0].checks.some((c) => c.name === 'Combustion')).toBe(true);
  }, 30000);
});
