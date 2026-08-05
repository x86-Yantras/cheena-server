import { describe, it, expect } from 'vitest';
import { TASK_RULES, scoreDay } from '../src/taskMuhurtaCalculator.js';

function snapshot({ tithiIndex, tithiName, yogaName, karanaName, nakshatraName, pada, weekday }) {
  return {
    tithi: { tithiIndex, tithiName },
    yoga: { yogaName },
    karana: { karanaName },
    nakshatra: { nakshatraName, pada },
    weekday,
  };
}

describe('TASK_RULES', () => {
  it('uses "Mula" (not "Moola") for the marriage nakshatra list, matching astro-data.js spelling', () => {
    expect(TASK_RULES.marriage.nakshatras).toContain('Mula');
    expect(TASK_RULES.marriage.nakshatras).not.toContain('Moola');
  });
});

describe('scoreDay — marriage, 2026-07-17 (Friday), verified: Tritiya, Magha pada 2, Vyatipata, Gara', () => {
  const daySnapshot = snapshot({
    tithiIndex: 2, tithiName: 'Tritiya',
    yogaName: 'Vyatipata',
    karanaName: 'Gara',
    nakshatraName: 'Magha', pada: 2,
    weekday: 'friday',
  });

  it('scores 80 (4 of 5 checks pass; Yoga fails on Vyatipata)', () => {
    const result = scoreDay(daySnapshot, TASK_RULES.marriage);
    expect(result.score).toBe(80);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/vyatipata/i);
    expect(result.reasons).toHaveLength(4);
  });
});

describe('scoreDay — Magha pada exclusion (pure, synthetic — no live date needed)', () => {
  it('Magha pada 1 fails the Nakshatra check for marriage even though Magha is otherwise favorable', () => {
    const daySnapshot = snapshot({
      tithiIndex: 2, tithiName: 'Tritiya', yogaName: 'Shubha', karanaName: 'Bava',
      nakshatraName: 'Magha', pada: 1, weekday: 'monday',
    });
    const result = scoreDay(daySnapshot, TASK_RULES.marriage);
    expect(result.score).toBe(80); // 4 of 5 pass, Nakshatra fails
    expect(result.warnings.some((w) => /magha/i.test(w))).toBe(true);
  });

  it('Magha pada 2 passes the Nakshatra check for marriage (same nakshatra, different pada)', () => {
    const daySnapshot = snapshot({
      tithiIndex: 2, tithiName: 'Tritiya', yogaName: 'Shubha', karanaName: 'Bava',
      nakshatraName: 'Magha', pada: 2, weekday: 'monday',
    });
    const result = scoreDay(daySnapshot, TASK_RULES.marriage);
    expect(result.score).toBe(100);
  });
});

describe('scoreDay — 2026-08-11 (Tuesday), verified: Chaturdashi (Rikta), Punarvasu pada 4, Siddhi, Vishti', () => {
  const daySnapshot = snapshot({
    tithiIndex: 13, tithiName: 'Chaturdashi',
    yogaName: 'Siddhi',
    karanaName: 'Vishti',
    nakshatraName: 'Punarvasu', pada: 4,
    weekday: 'tuesday',
  });

  it.each(['marriage', 'business', 'travel'])('scores 20 for %s (only Yoga passes: Rikta tithi, unfavorable nakshatra, Vishti karana, unfavorable weekday all fail)', (task) => {
    const result = scoreDay(daySnapshot, TASK_RULES[task]);
    expect(result.score).toBe(20);
    expect(result.reasons).toHaveLength(1);
    expect(result.warnings).toHaveLength(4);
  });
});

describe('scoreDay — 2026-08-17 (Monday), verified: Panchami, Chitra pada 1, Shubha, Balava', () => {
  const daySnapshot = snapshot({
    tithiIndex: 4, tithiName: 'Panchami',
    yogaName: 'Shubha',
    karanaName: 'Balava',
    nakshatraName: 'Chitra', pada: 1,
    weekday: 'monday',
  });

  it('scores 100 for business (Chitra favors business, Monday favors business)', () => {
    const result = scoreDay(daySnapshot, TASK_RULES.business);
    expect(result.score).toBe(100);
    expect(result.warnings).toHaveLength(0);
  });

  it('scores 80 for travel (Chitra does not favor travel; everything else passes)', () => {
    const result = scoreDay(daySnapshot, TASK_RULES.travel);
    expect(result.score).toBe(80);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/chitra/i);
  });
});
