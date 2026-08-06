import { describe, it, expect } from 'vitest';
import { HORA_LORD_SEQUENCE, WEEKDAY_STARTING_HORA_LORD, horaLordForSegment, scoreHoraSegment, computeGeneralMuhurta, minuteOfDayToDateTime } from '../src/generalMuhurtaCalculator.js';

describe('horaLordForSegment', () => {
  it('segment 0 on each weekday matches that weekday\'s starting lord', () => {
    for (const [weekday, expectedLord] of Object.entries(WEEKDAY_STARTING_HORA_LORD)) {
      expect(horaLordForSegment(weekday, 0)).toBe(expectedLord);
    }
  });

  it('cycles through all 7 lords in HORA_LORD_SEQUENCE order starting from the weekday lord', () => {
    // Saturday starts at SATURN, which is HORA_LORD_SEQUENCE[0].
    expect(horaLordForSegment('saturday', 0)).toBe('SATURN');
    expect(horaLordForSegment('saturday', 1)).toBe('JUPITER');
    expect(horaLordForSegment('saturday', 2)).toBe('MARS');
    expect(horaLordForSegment('saturday', 3)).toBe('SUN');
    expect(horaLordForSegment('saturday', 4)).toBe('VENUS');
    expect(horaLordForSegment('saturday', 5)).toBe('MERCURY');
    expect(horaLordForSegment('saturday', 6)).toBe('MOON');
  });

  it('wraps the 7-cycle correctly across segment 7 and continues uninterrupted into the night half (segments 12-23)', () => {
    // Saturday: segment 7 = HORA_LORD_SEQUENCE[7 % 7] = HORA_LORD_SEQUENCE[0] = SATURN again.
    expect(horaLordForSegment('saturday', 7)).toBe('SATURN');
    // Segment 11 (last day segment): 11 % 7 = 4 -> HORA_LORD_SEQUENCE[4] = VENUS.
    expect(horaLordForSegment('saturday', 11)).toBe('VENUS');
    // Segment 12 (first night segment) continues the SAME cycle, does not restart: 12 % 7 = 5 -> MERCURY.
    expect(horaLordForSegment('saturday', 12)).toBe('MERCURY');
    // Segment 23 (last night segment): 23 % 7 = 2 -> MARS.
    expect(horaLordForSegment('saturday', 23)).toBe('MARS');
  });

  it('verified real-world reference: Saturday segment 11 is VENUS, segment 7 is SATURN', () => {
    // Cross-checked directly against swisseph-wasm for Kathmandu, 2026-08-01 (a Saturday), while writing this plan.
    expect(horaLordForSegment('saturday', 11)).toBe('VENUS');
    expect(horaLordForSegment('saturday', 7)).toBe('SATURN');
  });
});

describe('scoreHoraSegment', () => {
  it('favorable hora + exalted lagna lord: both pass, score 100', () => {
    const result = scoreHoraSegment({ horaLord: 'VENUS', lagnaLordDignity: 'exalted' });
    expect(result.score).toBe(100);
    expect(result.checks).toEqual([
      { name: 'Hora', pass: true, reason: 'VENUS hora is favorable' },
      { name: 'Lagna Lord Strength', pass: true, reason: 'Lagna lord is exalted' },
    ]);
  });

  it('unfavorable hora + debilitated lagna lord: both fail, score 0', () => {
    const result = scoreHoraSegment({ horaLord: 'SATURN', lagnaLordDignity: 'debilitated' });
    expect(result.score).toBe(0);
    expect(result.checks).toEqual([
      { name: 'Hora', pass: false, reason: 'SATURN hora is unfavorable' },
      { name: 'Lagna Lord Strength', pass: false, reason: 'Lagna lord is debilitated' },
    ]);
  });

  it('favorable hora + debilitated lagna lord: one passes, score 50', () => {
    const result = scoreHoraSegment({ horaLord: 'JUPITER', lagnaLordDignity: 'debilitated' });
    expect(result.score).toBe(50);
  });

  it('unfavorable hora + own-sign lagna lord: one passes, score 50', () => {
    const result = scoreHoraSegment({ horaLord: 'MARS', lagnaLordDignity: 'own-sign' });
    expect(result.score).toBe(50);
  });

  it('neutral lagna lord dignity counts as passing (only debilitated fails)', () => {
    const result = scoreHoraSegment({ horaLord: 'MOON', lagnaLordDignity: 'neutral' });
    expect(result.score).toBe(100);
  });
});

describe('minuteOfDayToDateTime', () => {
  it('rounds the total minute BEFORE splitting into hour/minute, avoiding invalid "HH:60" timestamps', () => {
    // Previously the buggy code independently floored the hour and rounded the
    // minute remainder, producing hour=16, minute=Math.round(59.583)=60 -> "16:60".
    const result = minuteOfDayToDateTime('2026-09-11', 1019.583, 'Asia/Kathmandu');
    expect(result.timeStr).toBe('17:00');
    expect(result.dateStr).toBe('2026-09-11');
  });

  it('rounds up into the next day when the fractional minute pushes past 1440', () => {
    const result = minuteOfDayToDateTime('2026-09-11', 1439.6, 'Asia/Kathmandu');
    expect(result.dateStr).toBe('2026-09-12');
    expect(result.timeStr).toBe('00:00');
  });

  it('handles a simple whole-number minute-of-day value', () => {
    const result = minuteOfDayToDateTime('2026-01-01', 600, 'UTC');
    expect(result.dateStr).toBe('2026-01-01');
    expect(result.timeStr).toBe('10:00');
  });
});

describe('computeGeneralMuhurta — live integration (Kathmandu)', () => {
  it('finds a score-100 window on 2026-08-01 matching the verified best segment (Venus hora, exalted Jupiter lagna lord)', async () => {
    const result = await computeGeneralMuhurta('2026-08-01', '2026-08-01', 27.7172, 85.3240, 'Asia/Kathmandu');
    expect(result.task).toBe('general');
    const day = result.windows[0];
    expect(day.date).toBe('2026-08-01');
    expect(day.score).toBe(100);
    expect(day.bestWindow.planetLord).toBe('VENUS');
    expect(day.horaSegments).toHaveLength(24);
  }, 30000);

  it('the day\'s segment 7 scores 0 (Saturn hora, debilitated Venus lagna lord), verified independently', async () => {
    const result = await computeGeneralMuhurta('2026-08-01', '2026-08-01', 27.7172, 85.3240, 'Asia/Kathmandu');
    const day = result.windows[0];
    expect(day.horaSegments[7].planetLord).toBe('SATURN');
    expect(day.horaSegments[7].score).toBe(0);
  }, 30000);

  it('horaSegments stays chronological (start times strictly increasing)', async () => {
    const result = await computeGeneralMuhurta('2026-08-01', '2026-08-01', 27.7172, 85.3240, 'Asia/Kathmandu');
    const segments = result.windows[0].horaSegments;
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].start > segments[i - 1].start).toBe(true);
    }
  }, 30000);

  it('regression: 2026-09-11 (the date that reproduced the HH:60 bug live) does not throw and returns 24 segments', async () => {
    const result = await computeGeneralMuhurta('2026-09-11', '2026-09-11', 27.7172, 85.3240, 'Asia/Kathmandu');
    const day = result.windows[0];
    expect(day.date).toBe('2026-09-11');
    expect(day.horaSegments).toHaveLength(24);
  }, 30000);
});
