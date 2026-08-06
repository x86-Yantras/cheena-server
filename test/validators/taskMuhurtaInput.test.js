import { describe, it, expect } from 'vitest';
import { validateTaskMuhurtaInput } from '../../src/validators/taskMuhurtaInput.js';

const validQuery = {
  task: 'marriage',
  from: '2026-08-01',
  to: '2026-08-10',
  latitude: 27.7172,
  longitude: 85.324,
};

describe('validateTaskMuhurtaInput', () => {
  it('returns no errors for a valid query', () => {
    expect(validateTaskMuhurtaInput(validQuery)).toEqual([]);
  });

  it('accepts griha-pravesh as a valid task', () => {
    expect(validateTaskMuhurtaInput({ ...validQuery, task: 'griha-pravesh' })).toEqual([]);
  });

  it('flags an unknown task type', () => {
    expect(validateTaskMuhurtaInput({ ...validQuery, task: 'housewarming' })).toEqual(
      expect.arrayContaining([expect.stringMatching(/task must be one of/i)]),
    );
  });

  it('flags a missing from date', () => {
    const { from, ...rest } = validQuery;
    expect(validateTaskMuhurtaInput(rest)).toEqual(
      expect.arrayContaining([expect.stringMatching(/from must be/i)]),
    );
  });

  it('flags to being before from', () => {
    expect(validateTaskMuhurtaInput({ ...validQuery, from: '2026-08-10', to: '2026-08-01' })).toEqual(
      expect.arrayContaining([expect.stringMatching(/to must not be before from/i)]),
    );
  });

  it('flags a date range exceeding 60 days', () => {
    expect(validateTaskMuhurtaInput({ ...validQuery, from: '2026-01-01', to: '2026-12-31' })).toEqual(
      expect.arrayContaining([expect.stringMatching(/must not exceed 60 days/i)]),
    );
  });

  it('flags an out-of-range latitude', () => {
    expect(validateTaskMuhurtaInput({ ...validQuery, latitude: 200 })).toEqual(
      expect.arrayContaining([expect.stringMatching(/latitude/i)]),
    );
  });

  it('flags an out-of-range longitude', () => {
    expect(validateTaskMuhurtaInput({ ...validQuery, longitude: 200 })).toEqual(
      expect.arrayContaining([expect.stringMatching(/longitude/i)]),
    );
  });

  it('flags an invalid IANA timezone', () => {
    expect(validateTaskMuhurtaInput({ ...validQuery, timezone: 'Not/AZone' })).toEqual(
      expect.arrayContaining([expect.stringMatching(/timezone/i)]),
    );
  });

  it('accepts a query with no timezone (optional field)', () => {
    expect(validateTaskMuhurtaInput(validQuery)).toEqual([]);
  });

  it('accepts general as a valid task', () => {
    expect(validateTaskMuhurtaInput({ ...validQuery, task: 'general' })).toEqual([]);
  });
});
