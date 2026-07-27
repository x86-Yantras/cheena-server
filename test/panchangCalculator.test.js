import { describe, it, expect } from 'vitest';
import { computePanchang } from '../src/panchangCalculator.js';

describe('computePanchang - tithi', () => {
  it('returns Pratipada, shukla paksha, at 0 degrees elongation', () => {
    const { tithi } = computePanchang({ sunLongitude: 0, moonLongitude: 0 });
    expect(tithi).toEqual({
      tithiIndex: 0,
      paksha: 'shukla',
      tithiName: 'Pratipada',
      degreesElapsed: 0,
      degreesRemaining: 12,
    });
  });

  it('stays on the same tithi just under the 12-degree boundary', () => {
    const { tithi } = computePanchang({ sunLongitude: 0, moonLongitude: 11.99 });
    expect(tithi.tithiIndex).toBe(0);
    expect(tithi.tithiName).toBe('Pratipada');
  });

  it('rolls over to the next tithi exactly at the 12-degree boundary', () => {
    const { tithi } = computePanchang({ sunLongitude: 0, moonLongitude: 12 });
    expect(tithi.tithiIndex).toBe(1);
    expect(tithi.tithiName).toBe('Dwitiya');
    expect(tithi.degreesElapsed).toBe(0);
    expect(tithi.degreesRemaining).toBe(12);
  });

  it('returns Purnima, the last shukla tithi, starting at elongation 168', () => {
    const { tithi } = computePanchang({ sunLongitude: 0, moonLongitude: 168 });
    expect(tithi).toEqual({
      tithiIndex: 14,
      paksha: 'shukla',
      tithiName: 'Purnima',
      degreesElapsed: 0,
      degreesRemaining: 12,
    });
  });

  it('returns krishna Pratipada right at the shukla/krishna boundary (elongation 180)', () => {
    const { tithi } = computePanchang({ sunLongitude: 0, moonLongitude: 180 });
    expect(tithi).toEqual({
      tithiIndex: 15,
      paksha: 'krishna',
      tithiName: 'Pratipada',
      degreesElapsed: 0,
      degreesRemaining: 12,
    });
  });

  it('returns Amavasya just before the elongation wraps back to 0 (elongation 348)', () => {
    const { tithi } = computePanchang({ sunLongitude: 0, moonLongitude: 348 });
    expect(tithi).toEqual({
      tithiIndex: 29,
      paksha: 'krishna',
      tithiName: 'Amavasya',
      degreesElapsed: 0,
      degreesRemaining: 12,
    });
  });

  it('normalizes correctly when moonLongitude is numerically less than sunLongitude', () => {
    // sun at 350, moon at 20 -> elongation = ((20 - 350) + 360) % 360 = 30
    const { tithi } = computePanchang({ sunLongitude: 350, moonLongitude: 20 });
    expect(tithi.tithiIndex).toBe(2);
    expect(tithi.tithiName).toBe('Tritiya');
  });
});

describe('computePanchang - nitya yoga', () => {
  it('returns Vishkambha at yoga-sum 0', () => {
    const { yoga } = computePanchang({ sunLongitude: 0, moonLongitude: 0 });
    expect(yoga).toEqual({ yogaIndex: 0, yogaName: 'Vishkambha' });
  });

  it('returns Saubhagya at yoga-sum 50 (sun 10, moon 40)', () => {
    const { yoga } = computePanchang({ sunLongitude: 10, moonLongitude: 40 });
    expect(yoga).toEqual({ yogaIndex: 3, yogaName: 'Saubhagya' });
  });

  it('returns Vaidhriti (last of 27) just before wrapping back to 0', () => {
    const { yoga } = computePanchang({ sunLongitude: 0, moonLongitude: 359.9 });
    expect(yoga).toEqual({ yogaIndex: 26, yogaName: 'Vaidhriti' });
  });

  it('normalizes when the sun+moon sum exceeds 360', () => {
    // sum = 700 -> 700 % 360 = 340 -> index = floor(340 / (360/27)) = 25 (Indra)
    const { yoga } = computePanchang({ sunLongitude: 350, moonLongitude: 350 });
    expect(yoga.yogaIndex).toBe(25);
    expect(yoga.yogaName).toBe('Indra');
  });
});

describe('computePanchang - karana', () => {
  it('returns Kimstughna at elongation 0 (the single fixed karana at month start)', () => {
    const { karana } = computePanchang({ sunLongitude: 0, moonLongitude: 0 });
    expect(karana).toEqual({ karanaHalfIndex: 0, karanaName: 'Kimstughna' });
  });

  it('returns Bava, the first movable karana, right after Kimstughna', () => {
    const { karana } = computePanchang({ sunLongitude: 0, moonLongitude: 6 });
    expect(karana).toEqual({ karanaHalfIndex: 1, karanaName: 'Bava' });
  });

  it('returns Gara at elongation 30 (sun 10, moon 40)', () => {
    const { karana } = computePanchang({ sunLongitude: 10, moonLongitude: 40 });
    expect(karana).toEqual({ karanaHalfIndex: 5, karanaName: 'Gara' });
  });

  it('cycles the 7 movable karanas correctly into a second lap', () => {
    // karanaHalfIndex 8 -> (8-1) % 7 = 0 -> Bava again
    const { karana } = computePanchang({ sunLongitude: 0, moonLongitude: 48 });
    expect(karana).toEqual({ karanaHalfIndex: 8, karanaName: 'Bava' });
  });

  it('returns the three fixed karanas at the end of the month (indices 57, 58, 59)', () => {
    expect(computePanchang({ sunLongitude: 0, moonLongitude: 342 }).karana)
      .toEqual({ karanaHalfIndex: 57, karanaName: 'Shakuni' });
    expect(computePanchang({ sunLongitude: 0, moonLongitude: 348 }).karana)
      .toEqual({ karanaHalfIndex: 58, karanaName: 'Chatushpada' });
    expect(computePanchang({ sunLongitude: 0, moonLongitude: 354 }).karana)
      .toEqual({ karanaHalfIndex: 59, karanaName: 'Naga' });
  });
});
