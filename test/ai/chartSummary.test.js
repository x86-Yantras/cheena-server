import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeHouseLords, computeLordOf, computeFunctionalNature, computeDignity, computeNeechaBhanga, isVargottama, computeIsCombust, computeIsRetrograde } from '../../src/ai/chartSummary.js';

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

describe('computeNeechaBhanga', () => {
  it('cancels debilitation when the exaltation-sign lord sits in a kendra from lagna', () => {
    // Saturn (SATURN) debilitated in Mesha (index 0, since exaltation is Tula=6, debilitation=0).
    // Exaltation sign Tula(6) lord = VENUS (RASHI_LORDS[6]).
    // Ascendant Makara(9): Venus's houses are 5,10 -> both are in TRIKONA/KENDRA. House 10 is a kendra.
    const allPlanets = [{ key: 'VENUS', house: 10 }];
    expect(computeNeechaBhanga('SATURN', 0, 9, allPlanets)).toBe(true);
  });

  it('does not cancel when neither exaltation-lord nor debilitation-lord is in a kendra', () => {
    const allPlanets = [{ key: 'VENUS', house: 3 }, { key: 'MARS', house: 5 }];
    // Debilitation sign of Saturn is Mesha(0), lord = MARS. Neither Venus(3) nor Mars(5) in kendra.
    expect(computeNeechaBhanga('SATURN', 0, 9, allPlanets)).toBe(false);
  });
});

describe('isVargottama', () => {
  it('is true when D1 and D9 rashi indices match', () => {
    expect(isVargottama(3, 3)).toBe(true);
  });

  it('is false when they differ', () => {
    expect(isVargottama(3, 7)).toBe(false);
  });
});

describe('computeIsCombust', () => {
  it('Mercury within 12 degrees of the Sun is combust', () => {
    expect(computeIsCombust('MERCURY', 100, 95)).toBe(true);
  });

  it('Mercury 20 degrees from the Sun is not combust', () => {
    expect(computeIsCombust('MERCURY', 100, 80)).toBe(false);
  });

  it('handles the 0/360 wraparound', () => {
    expect(computeIsCombust('VENUS', 2, 358)).toBe(true); // 4 degrees apart across the wrap
  });

  it('the Sun itself is never combust', () => {
    expect(computeIsCombust('SUN', 100, 100)).toBe(false);
  });
});

describe('computeIsRetrograde', () => {
  beforeEach(() => {
    process.env.EPHEMERIS_SERVICE_URL = 'http://ephemeris.test';
    process.env.EPHEMERIS_SERVICE_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is retrograde when longitude one day earlier was greater (planet moved backward)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        julianDay: 2451544.0,
        ascendantLongitude: 0,
        planetLongitudes: { SATURN: 195 }, // was at 195 yesterday, is at 190 today -> moved backward
      }),
    }));
    const result = await computeIsRetrograde({
      dateStr: '2000-01-02', timeStr: '12:00', latitude: 0, longitude: 0, timezone: 'UTC',
      planetKey: 'SATURN', currentLongitude: 190, swe: { SATURN: 'SATURN' },
    });
    expect(result).toBe(true);
  });

  it('is not retrograde when longitude one day earlier was smaller (planet moved forward)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        julianDay: 2451544.0,
        ascendantLongitude: 0,
        planetLongitudes: { JUPITER: 100 },
      }),
    }));
    const result = await computeIsRetrograde({
      dateStr: '2000-01-02', timeStr: '12:00', latitude: 0, longitude: 0, timezone: 'UTC',
      planetKey: 'JUPITER', currentLongitude: 101, swe: { JUPITER: 'JUPITER' },
    });
    expect(result).toBe(false);
  });

  it('handles the 0/360 wraparound correctly (near Mesha point)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        julianDay: 2451544.0,
        ascendantLongitude: 0,
        planetLongitudes: { SATURN: 359 },
      }),
    }));
    const result = await computeIsRetrograde({
      dateStr: '2000-01-02', timeStr: '12:00', latitude: 0, longitude: 0, timezone: 'UTC',
      planetKey: 'SATURN', currentLongitude: 1, swe: { SATURN: 'SATURN' },
    });
    expect(result).toBe(false); // 359 -> 1 is forward motion across the wrap, not retrograde
  });

  it('returns null when the ephemeris call fails, instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await computeIsRetrograde({
      dateStr: '2000-01-02', timeStr: '12:00', latitude: 0, longitude: 0, timezone: 'UTC',
      planetKey: 'SATURN', currentLongitude: 190, swe: { SATURN: 'SATURN' },
    });
    expect(result).toBeNull();
  });
});
