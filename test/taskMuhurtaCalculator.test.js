import { describe, it, expect, vi } from 'vitest';
import * as sunTimesService from '../src/sunTimesService.js';
import { TASK_RULES, scoreDay, computeDailyScore, computeTaskMuhurta } from '../src/taskMuhurtaCalculator.js';

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

  it('returns a checks array with 5 named entries in order, with Yoga marked as the sole failure', () => {
    const result = scoreDay(daySnapshot, TASK_RULES.marriage);
    expect(result.checks).toHaveLength(5);
    expect(result.checks.map((c) => c.name)).toEqual(['Tithi', 'Nakshatra', 'Yoga', 'Karana', 'Vara']);
    const yogaCheck = result.checks.find((c) => c.name === 'Yoga');
    expect(yogaCheck.pass).toBe(false);
    expect(yogaCheck.reason).toBe(result.warnings[0]);
    expect(result.checks.filter((c) => !c.pass)).toHaveLength(1);
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

describe('computeDailyScore — live integration (Kathmandu, 2026-08-17, Monday)', () => {
  it('matches the pure scoreDay result for business (100) using real ephemeris data', async () => {
    const result = await computeDailyScore('2026-08-17', 27.7172, 85.3240, 'Asia/Kathmandu', TASK_RULES.business);
    expect(result.date).toBe('2026-08-17');
    expect(result.score).toBe(100);
  }, 30000);

  it('matches the pure scoreDay result for travel (80) using real ephemeris data, same date', async () => {
    const result = await computeDailyScore('2026-08-17', 27.7172, 85.3240, 'Asia/Kathmandu', TASK_RULES.travel);
    expect(result.score).toBe(80);
  }, 30000);
});

describe('computeTaskMuhurta (orchestrator)', () => {
  it('returns one window per day in range, sorted by score descending', async () => {
    // 2026-08-17 (Mon, verified business=100) and 2026-08-11 (Tue, verified all-tasks=20)
    // are both inside this range; the orchestrator must sort 100 before 20.
    const result = await computeTaskMuhurta('business', '2026-08-11', '2026-08-17', 27.7172, 85.3240, 'Asia/Kathmandu');
    expect(result.task).toBe('business');
    expect(result.dateRange).toEqual({ from: '2026-08-11', to: '2026-08-17' });
    expect(result.windows).toHaveLength(7); // Aug 11 through Aug 17 inclusive
    expect(result.windows[0].score).toBeGreaterThanOrEqual(result.windows[1].score);
    const aug17 = result.windows.find((w) => w.start === '2026-08-17T00:00');
    const aug11 = result.windows.find((w) => w.start === '2026-08-11T00:00');
    expect(aug17.end).toBe('2026-08-18T00:00');
    expect(aug17.granularity).toBe('day');
    expect(aug11.end).toBe('2026-08-12T00:00');
    expect(aug11.granularity).toBe('day');
    expect(aug17.score).toBe(100);
    expect(aug11.score).toBe(20);
    expect(result.windows[0]).toEqual(aug17); // the 100-score day should sort first
  }, 60000);
});
