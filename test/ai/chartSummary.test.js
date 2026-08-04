import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeHouseLords, computeLordOf, computeFunctionalNature, computeDignity, computeNeechaBhanga, isVargottama, computeIsCombust, computeIsRetrograde, findCurrentDasha, describeDashaLordRole, describeYogas, computeTransits } from '../../src/ai/chartSummary.js';

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

describe('findCurrentDasha', () => {
  const mahadashas = [
    {
      lord: 'JUPITER', start: '2020-01-01T00:00:00.000Z', end: '2036-01-01T00:00:00.000Z',
      subPeriods: [
        {
          lord: 'KETU', start: '2020-01-01T00:00:00.000Z', end: '2021-01-01T00:00:00.000Z',
          subPeriods: [
            { lord: 'SATURN', start: '2020-06-01T00:00:00.000Z', end: '2020-08-01T00:00:00.000Z' },
            { lord: 'MERCURY', start: '2020-08-01T00:00:00.000Z', end: '2020-10-01T00:00:00.000Z' },
          ],
        },
        {
          lord: 'VENUS', start: '2021-01-01T00:00:00.000Z', end: '2023-01-01T00:00:00.000Z',
          subPeriods: [],
        },
      ],
    },
  ];

  it('finds the mahadasha, antardasha, and pratyantardasha containing the given timestamp', () => {
    const nowMs = new Date('2020-07-01T00:00:00.000Z').getTime();
    const result = findCurrentDasha(mahadashas, nowMs);
    expect(result).toEqual({ mahadasha: 'JUPITER', antardasha: 'KETU', pratyantardasha: 'SATURN' });
  });

  it('returns null pratyantardasha when the antardasha has no matching sub-period', () => {
    const nowMs = new Date('2022-01-01T00:00:00.000Z').getTime();
    const result = findCurrentDasha(mahadashas, nowMs);
    expect(result).toEqual({ mahadasha: 'JUPITER', antardasha: 'VENUS', pratyantardasha: null });
  });

  it('returns all nulls when the timestamp is outside every period', () => {
    const nowMs = new Date('2050-01-01T00:00:00.000Z').getTime();
    const result = findCurrentDasha(mahadashas, nowMs);
    expect(result).toEqual({ mahadasha: null, antardasha: null, pratyantardasha: null });
  });
});

describe('describeDashaLordRole', () => {
  it('describes a lord ruling two houses and its current placement', () => {
    // Makara lagna (9): Venus rules 5,10. Placed in house 2.
    const planetsByKey = { VENUS: { house: 2 } };
    expect(describeDashaLordRole('VENUS', 9, planetsByKey)).toBe('पञ्चमेश+दशमेश, भाव २ मा');
  });

  it('describes a single-house lord', () => {
    const planetsByKey = { SATURN: { house: 4 } };
    expect(describeDashaLordRole('SATURN', 9, planetsByKey)).toBe('लग्नेश+द्वितीयेश, भाव ४ मा');
  });

  it('describes a lord that rules no house (Rahu/Ketu) using just its placement', () => {
    const planetsByKey = { RAHU: { house: 8 } };
    expect(describeDashaLordRole('RAHU', 9, planetsByKey)).toBe('भाव ८ मा');
  });
});

describe('describeYogas', () => {
  it('includes only present yogas/doshas with name/effect/nature', () => {
    const yogaDosha = {
      yogas: [{ key: 'gajakesari', present: true }, { key: 'rajaYoga', present: false }],
      doshas: [{ key: 'mangal', present: true }],
    };
    const result = describeYogas(yogaDosha);
    expect(result).toHaveLength(2);
    const keys = result.map((y) => y.name);
    expect(keys).toContain('गजकेसरी योग');
    expect(keys).toContain('मंगल दोष');
    expect(result.every((y) => typeof y.effect === 'string' && y.effect.length > 0)).toBe(true);
  });

  it('returns an empty array when nothing is present', () => {
    const yogaDosha = { yogas: [{ key: 'gajakesari', present: false }], doshas: [] };
    expect(describeYogas(yogaDosha)).toEqual([]);
  });
});

describe('computeTransits', () => {
  beforeEach(() => {
    process.env.EPHEMERIS_SERVICE_URL = 'http://ephemeris.test';
    process.env.EPHEMERIS_SERVICE_API_KEY = 'test-api-key';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns TransitSummary entries for Saturn, Jupiter, Rahu, Ketu', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      callCount += 1;
      // First call = "today", second call (from computeIsRetrograde) = "yesterday". Same longitudes for simplicity.
      return {
        ok: true,
        json: async () => ({
          julianDay: 2451545.0 + callCount,
          ascendantLongitude: 0,
          planetLongitudes: { SATURN: 340, JUPITER: 130, RAHU: 40 },
        }),
      };
    }));
    const swe = { SATURN: 'SATURN', JUPITER: 'JUPITER', RAHU: 'RAHU' };
    const transits = await computeTransits({
      moonRashiIndex: 2, ascendantRashiIndex: 9, latitude: 0, longitude: 0, timezone: 'UTC', swe,
    });
    expect(transits).toHaveLength(4); // Saturn, Jupiter, Rahu, Ketu
    const saturnTransit = transits.find((t) => t.planet === 'शनि');
    expect(saturnTransit.houseFromLagna).toBeGreaterThanOrEqual(1);
    expect(saturnTransit.houseFromLagna).toBeLessThanOrEqual(12);
    expect(typeof saturnTransit.note).toBe('string');
  });

  it('returns an empty array when the ephemeris call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const transits = await computeTransits({
      moonRashiIndex: 2, ascendantRashiIndex: 9, latitude: 0, longitude: 0, timezone: 'UTC',
      swe: { SATURN: 'SATURN', JUPITER: 'JUPITER', RAHU: 'RAHU' },
    });
    expect(transits).toEqual([]);
  });
});

// append to kundali-backend/test/ai/chartSummary.test.js
import { summarizeChart, formatChartForPrompt } from '../../src/ai/chartSummary.js';

describe('summarizeChart', () => {
  const SAMPLE_RESULT = {
    ascendant: { rashiIndex: 9, longitude: 276.5 }, // Makara, 6.5 degrees in
    planets: [
      { key: 'SUN', rashiIndex: 8, house: 12, longitude: 256.38, navamsa: { rashiIndex: 8 }, nakshatraIndex: 19, pada: 3 },
      { key: 'MOON', rashiIndex: 2, house: 6, longitude: 62.9, navamsa: { rashiIndex: 4 }, nakshatraIndex: 4, pada: 1 },
      { key: 'MARS', rashiIndex: 5, house: 9, longitude: 174.6, navamsa: { rashiIndex: 5 }, nakshatraIndex: 13, pada: 2 },
      { key: 'MERCURY', rashiIndex: 7, house: 11, longitude: 237.58, navamsa: { rashiIndex: 7 }, nakshatraIndex: 17, pada: 4 },
      { key: 'JUPITER', rashiIndex: 10, house: 2, longitude: 328.12, navamsa: { rashiIndex: 10 }, nakshatraIndex: 24, pada: 1 },
      { key: 'VENUS', rashiIndex: 9, house: 1, longitude: 271.68, navamsa: { rashiIndex: 9 }, nakshatraIndex: 20, pada: 3 },
      { key: 'SATURN', rashiIndex: 0, house: 4, longitude: 2.92, navamsa: { rashiIndex: 0 }, nakshatraIndex: 0, pada: 1 },
      { key: 'RAHU', rashiIndex: 4, house: 8, longitude: 130.53, navamsa: { rashiIndex: 4 }, nakshatraIndex: 9, pada: 2 },
      { key: 'KETU', rashiIndex: 10, house: 2, longitude: 310.53, navamsa: { rashiIndex: 10 }, nakshatraIndex: 24, pada: 4 },
    ],
    dasha: {
      mahadashas: [{
        lord: 'JUPITER', start: '2010-01-01T00:00:00.000Z', end: '2026-01-01T00:00:00.000Z',
        subPeriods: [{
          lord: 'KETU', start: '2024-01-01T00:00:00.000Z', end: '2025-01-01T00:00:00.000Z',
          subPeriods: [{ lord: 'SATURN', start: '2020-01-01T00:00:00.000Z', end: '2099-01-01T00:00:00.000Z' }],
        }],
      }],
    },
    yogaDosha: {
      yogas: [{ key: 'malavya', present: true }],
      doshas: [],
    },
  };

  beforeEach(() => {
    process.env.EPHEMERIS_SERVICE_URL = 'http://ephemeris.test';
    process.env.EPHEMERIS_SERVICE_API_KEY = 'test-api-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        julianDay: 2451545.0,
        ascendantLongitude: 0,
        planetLongitudes: { SATURN: 340, JUPITER: 130, RAHU: 40 },
      }),
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('produces a ChartSummary with lagna, planets, houseLords, yogas, dasha, and transits', async () => {
    const summary = await summarizeChart({ result: SAMPLE_RESULT, latitude: 27.7, longitude: 85.3, timezone: 'Asia/Kathmandu' });
    expect(summary.lagna.rashi).toBe('मकर');
    expect(summary.planets).toHaveLength(9);
    expect(summary.houseLords).toHaveLength(12);
    expect(summary.yogas.length).toBeGreaterThan(0);
    expect(summary.dasha.mahadasha).toBeDefined();
    expect(Array.isArray(summary.transits)).toBe(true);
  });

  it('every planet has all PlanetSummary fields', async () => {
    const summary = await summarizeChart({ result: SAMPLE_RESULT, latitude: 27.7, longitude: 85.3, timezone: 'Asia/Kathmandu' });
    for (const p of summary.planets) {
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('rashi');
      expect(p).toHaveProperty('house');
      expect(p).toHaveProperty('lordOfText');
      expect(p).toHaveProperty('functionalNature');
      expect(p).toHaveProperty('dignity');
      expect(p).toHaveProperty('isVargottama');
      expect(p).toHaveProperty('isCombust');
      expect(p).toHaveProperty('strengthNote');
    }
  });
});

describe('formatChartForPrompt', () => {
  it('produces non-empty labelled Nepali text containing lagna, planets, and dasha sections', async () => {
    const summary = {
      lagna: { rashi: 'मकर', degree: '६°३०′', nakshatra: 'उत्तराषाढा', pada: 3, lord: 'शनि' },
      moonRashi: 'मिथुन', sunRashi: 'धनु',
      janmaNakshatra: { name: 'मृगशिरा', pada: 3, lord: 'मंगल' },
      planets: [
        { name: 'शुक्र', rashi: 'मकर', house: 1, degree: '१°४१′', lordOfText: 'पञ्चमेश+दशमेश', functionalNature: 'Yogakaraka', dignity: 'Neutral', isVargottama: true, isCombust: false, strengthNote: 'बलियो' },
      ],
      houseLords: [{ house: 1, rashi: 'मकर', lord: 'शनि', occupants: ['शुक्र'] }],
      yogas: [{ name: 'गजकेसरी योग', effect: 'बुद्धि बलियो', nature: 'Benefic' }],
      dasha: { mahadasha: 'बृहस्पति', antardasha: 'केतु', pratyantardasha: 'शनि', mahaLordRole: 'तृतीयेश', antarLordRole: 'भाव २ मा', pratyantarLordRole: 'लग्नेश' },
      transits: [{ planet: 'शनि', rashi: 'मीन', houseFromMoon: 10, houseFromLagna: 3, isRetrograde: true, note: '१०म भाव, वक्री' }],
    };
    const text = formatChartForPrompt(summary);
    expect(text).toContain('मकर');
    expect(text).toContain('शुक्र');
    expect(text).toContain('बृहस्पति');
    expect(text).toContain('शनि');
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(50);
  });
});
