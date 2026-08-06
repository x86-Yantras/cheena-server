import { describe, it, expect, vi } from 'vitest';
import * as sunTimesService from '../src/sunTimesService.js';
import { TASK_RULES, scoreDay, snapshotPanchangaAtSunrise, computeDailyScore, computeTaskMuhurta, angularSeparation, isCombust } from '../src/taskMuhurtaCalculator.js';

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

describe('angularSeparation', () => {
  it('returns the shortest arc, handling the 360/0 wrap', () => {
    expect(angularSeparation(359, 2)).toBeCloseTo(3, 5);
    expect(angularSeparation(2, 359)).toBeCloseTo(3, 5);
  });

  it('returns 0 for identical longitudes', () => {
    expect(angularSeparation(100, 100)).toBe(0);
  });

  it('returns the direct difference when under 180 degrees', () => {
    expect(angularSeparation(10, 40)).toBeCloseTo(30, 5);
  });
});

describe('isCombust', () => {
  it('Venus direct: 9 degrees separation is combust (orb 10)', () => {
    expect(isCombust(9, 0, 1.2, 'VENUS')).toBe(true);
  });

  it('Venus direct: exactly 10 degrees separation is NOT combust (boundary exclusive)', () => {
    expect(isCombust(10, 0, 1.2, 'VENUS')).toBe(false);
  });

  it('Venus direct: 11 degrees separation is not combust', () => {
    expect(isCombust(11, 0, 1.2, 'VENUS')).toBe(false);
  });

  it('Venus retrograde: 7 degrees separation is combust (orb 8)', () => {
    expect(isCombust(7, 0, -0.5, 'VENUS')).toBe(true);
  });

  it('Venus retrograde: exactly 8 degrees separation is NOT combust', () => {
    expect(isCombust(8, 0, -0.5, 'VENUS')).toBe(false);
  });

  it('Jupiter: 10 degrees separation is combust (orb 11, any speed)', () => {
    expect(isCombust(10, 0, 0.1, 'JUPITER')).toBe(true);
  });

  it('Jupiter: exactly 11 degrees separation is NOT combust', () => {
    expect(isCombust(11, 0, 0.1, 'JUPITER')).toBe(false);
  });

  it('Jupiter: 12 degrees separation is not combust', () => {
    expect(isCombust(12, 0, 0.1, 'JUPITER')).toBe(false);
  });

  it('Jupiter retrograde uses the same 11 degree orb as direct (no retrograde-specific value)', () => {
    expect(isCombust(10, 0, -0.1, 'JUPITER')).toBe(true);
    expect(isCombust(11, 0, -0.1, 'JUPITER')).toBe(false);
  });

  it('throws for an unrecognized planet instead of silently applying an orb', () => {
    expect(() => isCombust(5, 0, 0.1, 'MARS')).toThrow(/unsupported planet/i);
    expect(() => isCombust(5, 0, 0.1, 'venus')).toThrow(/unsupported planet/i);
  });
});

describe('TASK_RULES griha-pravesh', () => {
  it('has requiresCombustionCheck: true, unlike the other 3 task types', () => {
    expect(TASK_RULES['griha-pravesh'].requiresCombustionCheck).toBe(true);
    expect(TASK_RULES.marriage.requiresCombustionCheck).toBeUndefined();
    expect(TASK_RULES.business.requiresCombustionCheck).toBeUndefined();
    expect(TASK_RULES.travel.requiresCombustionCheck).toBeUndefined();
  });

  it('includes the researched nakshatra and weekday lists', () => {
    expect(TASK_RULES['griha-pravesh'].nakshatras).toContain('Rohini');
    expect(TASK_RULES['griha-pravesh'].nakshatras).toContain('Chitra');
    expect(TASK_RULES['griha-pravesh'].weekdays).not.toContain('tuesday');
  });
});

describe('scoreDay with requiresCombustionCheck', () => {
  const baseSnapshot = {
    tithi: { tithiIndex: 4, tithiName: 'Panchami' },
    yoga: { yogaName: 'Shubha' },
    karana: { karanaName: 'Balava' },
    nakshatra: { nakshatraName: 'Rohini', pada: 1 },
    weekday: 'monday',
  };

  it('adds a Combustion check for griha-pravesh when neither planet is combust (score 100, 6 of 6 pass)', () => {
    const result = scoreDay({ ...baseSnapshot, venusCombust: false, jupiterCombust: false }, TASK_RULES['griha-pravesh']);
    expect(result.score).toBe(100);
    expect(result.checks.find((c) => c.name === 'Combustion').pass).toBe(true);
  });

  it('fails the Combustion check for griha-pravesh when Jupiter is combust (score 83, 5 of 6 pass)', () => {
    const result = scoreDay({ ...baseSnapshot, venusCombust: false, jupiterCombust: true }, TASK_RULES['griha-pravesh']);
    expect(result.score).toBe(83);
    expect(result.checks.find((c) => c.name === 'Combustion').pass).toBe(false);
    expect(result.warnings.some((w) => /jupiter/i.test(w))).toBe(true);
  });

  it('fails the Combustion check for griha-pravesh when Venus is combust (score 83, 5 of 6 pass)', () => {
    const result = scoreDay({ ...baseSnapshot, venusCombust: true, jupiterCombust: false }, TASK_RULES['griha-pravesh']);
    expect(result.score).toBe(83);
    expect(result.checks.find((c) => c.name === 'Combustion').pass).toBe(false);
    expect(result.warnings.some((w) => /venus/i.test(w))).toBe(true);
  });

  it('does NOT add a Combustion check for marriage, even when combustion fields are present in the snapshot', () => {
    const result = scoreDay({ ...baseSnapshot, venusCombust: true, jupiterCombust: true }, TASK_RULES.marriage);
    expect(result.checks.find((c) => c.name === 'Combustion')).toBeUndefined();
    expect(result.checks).toHaveLength(5);
  });
});

describe('snapshotPanchangaAtSunrise includes combustion data', () => {
  it('includes venusCombust and jupiterCombust booleans', async () => {
    const snapshot = await snapshotPanchangaAtSunrise('2026-08-01', 27.7172, 85.3240, 'Asia/Kathmandu');
    expect(typeof snapshot.venusCombust).toBe('boolean');
    expect(typeof snapshot.jupiterCombust).toBe('boolean');
  }, 30000);
});

describe('computeDailyScore — griha-pravesh live integration (Kathmandu)', () => {
  it('flags Jupiter combust on 2026-08-01 (verified: Jupiter ~1.83 deg from Sun, well under its 11 deg orb)', async () => {
    const result = await computeDailyScore('2026-08-01', 27.7172, 85.3240, 'Asia/Kathmandu', TASK_RULES['griha-pravesh']);
    expect(result.checks.find((c) => c.name === 'Combustion').pass).toBe(false);
  }, 30000);

  it('does not flag combustion on 2026-08-14 (verified: Jupiter ~11.42 deg from Sun, just over its 11 deg orb)', async () => {
    const result = await computeDailyScore('2026-08-14', 27.7172, 85.3240, 'Asia/Kathmandu', TASK_RULES['griha-pravesh']);
    expect(result.checks.find((c) => c.name === 'Combustion').pass).toBe(true);
  }, 30000);
});
