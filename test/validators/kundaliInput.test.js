import { describe, it, expect } from 'vitest';
import { validateKundaliInput } from '../../src/validators/kundaliInput.js';

const validBody = { date: '1990-05-15', time: '14:30', latitude: 40.7128, longitude: -74.006 };

describe('validateKundaliInput', () => {
  it('returns no errors for a valid body', () => {
    expect(validateKundaliInput(validBody)).toEqual([]);
  });

  it('flags a missing date', () => {
    const { date, ...rest } = validBody;
    expect(validateKundaliInput(rest)).toEqual(
      expect.arrayContaining([expect.stringMatching(/date/i)])
    );
  });

  it('flags an out-of-range latitude', () => {
    expect(validateKundaliInput({ ...validBody, latitude: 200 })).toEqual(
      expect.arrayContaining([expect.stringMatching(/latitude/i)])
    );
  });

  it('flags an invalid IANA timezone', () => {
    expect(validateKundaliInput({ ...validBody, timezone: 'Not/AZone' })).toEqual(
      expect.arrayContaining([expect.stringMatching(/timezone/i)])
    );
  });

  it('flags an invalid time format', () => {
    expect(validateKundaliInput({ ...validBody, time: '2:30pm' })).toEqual(
      expect.arrayContaining([expect.stringMatching(/time/i)])
    );
  });

  it('flags an out-of-range longitude', () => {
    expect(validateKundaliInput({ ...validBody, longitude: 200 })).toEqual(
      expect.arrayContaining([expect.stringMatching(/longitude/i)])
    );
  });
});
