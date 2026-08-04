import { describe, it, expect } from 'vitest';
import { computeHouseLords, computeLordOf, computeFunctionalNature, computeDignity } from '../../src/ai/chartSummary.js';

describe('computeHouseLords', () => {
  it('for a Makara (Capricorn, index 9) lagna, house 1 is ruled by Saturn and house 4 by Mars', () => {
    const houseLords = computeHouseLords(9);
    expect(houseLords).toHaveLength(12);
    expect(houseLords[0]).toEqual({ house: 1, rashiIndex: 9, lord: 'SATURN' });
    expect(houseLords[3]).toEqual({ house: 4, rashiIndex: 0, lord: 'MARS' });
    expect(houseLords[11]).toEqual({ house: 12, rashiIndex: 8, lord: 'JUPITER' });
  });

  it('for a Mesha (Aries, index 0) lagna, house 1 is ruled by Mars', () => {
    const houseLords = computeHouseLords(0);
    expect(houseLords[0]).toEqual({ house: 1, rashiIndex: 0, lord: 'MARS' });
  });
});

describe('computeLordOf', () => {
  it('Venus rules houses 5 and 10 from a Makara lagna (Vrishabha=5th, Tula=10th)', () => {
    // Makara lagna index 9: house 5 rashi = (9+5-1)%12=13%12=1 (Vrishabha), house 10 rashi=(9+10-1)%12=18%12=6 (Tula)
    expect(computeLordOf('VENUS', 9)).toEqual([5, 10]);
  });

  it('Saturn rules houses 1 and 2 from a Makara lagna (Makara=1st, Kumbha=2nd)', () => {
    expect(computeLordOf('SATURN', 9)).toEqual([1, 2]);
  });

  it('returns an empty array for a planet that rules no house from this lagna (Rahu/Ketu never rule)', () => {
    expect(computeLordOf('RAHU', 9)).toEqual([]);
  });
});

describe('computeFunctionalNature', () => {
  it('Venus ruling 5th+10th (kendra+trikona) from Makara lagna is Yogakaraka', () => {
    expect(computeFunctionalNature('VENUS', [5, 10])).toBe('Yogakaraka');
  });

  it('a planet ruling only a kendra (e.g. 4th) is Benefic', () => {
    expect(computeFunctionalNature('X', [4])).toBe('Benefic');
  });

  it('a planet ruling only a trikona (e.g. 5th) is Benefic', () => {
    expect(computeFunctionalNature('X', [5])).toBe('Benefic');
  });

  it('a planet ruling only 3rd/6th/11th is Malefic', () => {
    expect(computeFunctionalNature('X', [6])).toBe('Malefic');
    expect(computeFunctionalNature('X', [11])).toBe('Malefic');
  });

  it('a planet ruling only 2nd or 7th (and no kendra/trikona) is Maraka', () => {
    expect(computeFunctionalNature('X', [2])).toBe('Maraka');
    expect(computeFunctionalNature('X', [7])).toBe('Maraka');
  });

  it('a planet ruling nothing (Rahu/Ketu) is Neutral', () => {
    expect(computeFunctionalNature('RAHU', [])).toBe('Neutral');
  });
});

describe('computeDignity', () => {
  it('Sun in Mesha (index 0) is Exalted', () => {
    expect(computeDignity('SUN', 0)).toBe('Exalted');
  });

  it('Sun in Tula (index 6, 180deg from Mesha) is Debilitated', () => {
    expect(computeDignity('SUN', 6)).toBe('Debilitated');
  });

  it('Sun in Simha (index 4, its own sign) is OwnSign', () => {
    expect(computeDignity('SUN', 4)).toBe('OwnSign');
  });

  it('Sun in an unrelated sign is Neutral', () => {
    expect(computeDignity('SUN', 2)).toBe('Neutral');
  });

  it('Sun in Karka (Moon-ruled, and Moon is a natural friend of Sun) is Friend', () => {
    expect(computeDignity('SUN', 3)).toBe('Friend');
  });

  it('Sun in Tula (Venus-ruled, and Venus is a natural enemy of Sun) is Debilitated, not Enemy', () => {
    // Tula(6) is Sun's debilitation sign — Debilitated must take priority over Enemy.
    expect(computeDignity('SUN', 6)).toBe('Debilitated');
  });

  it('Sun in Kumbha (Saturn-ruled, and Saturn is a natural enemy of Sun) is Enemy', () => {
    expect(computeDignity('SUN', 10)).toBe('Enemy');
  });

  it('Rahu (no friendship data) in any non-exalted/non-debilitated/non-own sign is Neutral', () => {
    expect(computeDignity('RAHU', 5)).toBe('Neutral');
  });
});
