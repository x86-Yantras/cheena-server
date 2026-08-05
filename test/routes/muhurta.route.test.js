import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

vi.mock('../../src/sunTimesService.js', () => ({
  computeSunriseSunset: vi.fn()
    .mockResolvedValueOnce({ sunrise: '05:44', sunset: '19:15' })
    .mockResolvedValueOnce({ sunrise: '05:44', sunset: '19:16' }),
}));

describe('GET /api/muhurta', () => {
  it('returns 400 when latitude is missing', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta').query({ date: '2026-07-27', longitude: 80.452122 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid date format', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta').query({ date: '27-07-2026', latitude: 29.588806, longitude: 80.452122 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a calendar-invalid date', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta').query({ date: '2026-02-31', latitude: 29.588806, longitude: 80.452122 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when latitude is an empty string', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta').query({ date: '2026-07-27', latitude: '', longitude: 80.452122 });
    expect(res.status).toBe(400);
  });

  it('returns a DailyPeriods shape for a valid request', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta').query({
      date: '2026-07-27', latitude: 29.588806, longitude: 80.452122, timezone: 'Asia/Kathmandu',
    });
    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2026-07-27');
    expect(res.body.weekday).toBe('monday');
    expect(Array.isArray(res.body.inauspicious)).toBe(true);
    expect(Array.isArray(res.body.auspicious)).toBe(true);
    expect(res.body.choghadiya.day).toHaveLength(8);
  }, 30000);
});
