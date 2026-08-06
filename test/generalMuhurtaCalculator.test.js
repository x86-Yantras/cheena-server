import { describe, it, expect } from 'vitest';
import { HORA_LORD_SEQUENCE, WEEKDAY_STARTING_HORA_LORD, horaLordForSegment, scoreHoraSegment } from '../src/generalMuhurtaCalculator.js';

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
