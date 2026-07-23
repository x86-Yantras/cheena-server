import { describe, it, expect } from 'vitest';
import { computeYogaDosha } from '../src/yogaCalculator.js';

// Builds a full 9-planet chart from partial placements. Unspecified planets
// are parked in distinct rashis that trigger nothing.
function buildChart(overrides = {}, ascendantRashiIndex = 0) {
  const defaults = {
    SUN: { rashiIndex: 2 },
    MOON: { rashiIndex: 4 },
    MARS: { rashiIndex: 5 },
    MERCURY: { rashiIndex: 1 },
    JUPITER: { rashiIndex: 6 },
    VENUS: { rashiIndex: 8 },
    SATURN: { rashiIndex: 11 },
    RAHU: { rashiIndex: 3 },
    KETU: { rashiIndex: 9 },
  };
  const planets = Object.entries(defaults).map(([key, base]) => {
    const merged = { key, ...base, ...(overrides[key] || {}) };
    if (merged.longitude === undefined) merged.longitude = merged.rashiIndex * 30 + 15;
    merged.house = ((merged.rashiIndex - ascendantRashiIndex + 12) % 12) + 1;
    return merged;
  });
  return { planets, ascendant: { rashiIndex: ascendantRashiIndex } };
}

function find(result, list, key) {
  return result[list].find((item) => item.key === key);
}

describe('computeYogaDosha', () => {
  it('detects Gajakesari when Jupiter is in a kendra from the Moon', () => {
    const chart = buildChart({ MOON: { rashiIndex: 0 }, JUPITER: { rashiIndex: 6 } });
    expect(find(computeYogaDosha(chart), 'yogas', 'gajakesari').present).toBe(true);
  });

  it('does not detect Gajakesari when Jupiter is in a trikona from the Moon', () => {
    const chart = buildChart({ MOON: { rashiIndex: 0 }, JUPITER: { rashiIndex: 4 } });
    expect(find(computeYogaDosha(chart), 'yogas', 'gajakesari').present).toBe(false);
  });

  it('detects Budhaditya and Chandra-Mangal conjunctions', () => {
    const chart = buildChart({
      SUN: { rashiIndex: 7 }, MERCURY: { rashiIndex: 7 },
      MOON: { rashiIndex: 2 }, MARS: { rashiIndex: 2 },
    });
    const result = computeYogaDosha(chart);
    expect(find(result, 'yogas', 'budhaditya').present).toBe(true);
    expect(find(result, 'yogas', 'chandraMangal').present).toBe(true);
  });

  it('detects Hamsa when Jupiter is exalted in a kendra from lagna', () => {
    // Ascendant Mesha; Jupiter in Karka (exalted) = house 4.
    const chart = buildChart({ JUPITER: { rashiIndex: 3 } }, 0);
    expect(find(computeYogaDosha(chart), 'yogas', 'hamsa').present).toBe(true);
  });

  it('does not detect Hamsa when exalted Jupiter is outside a kendra', () => {
    // Ascendant Vrishabha; Jupiter in Karka = house 3.
    const chart = buildChart({ JUPITER: { rashiIndex: 3 } }, 1);
    expect(find(computeYogaDosha(chart), 'yogas', 'hamsa').present).toBe(false);
  });

  it('detects Kemadruma when no planet flanks the Moon', () => {
    const chart = buildChart({
      MOON: { rashiIndex: 0 }, MERCURY: { rashiIndex: 2 }, SATURN: { rashiIndex: 9 },
    });
    expect(find(computeYogaDosha(chart), 'yogas', 'kemadruma').present).toBe(true);
  });

  it('cancels Kemadruma when Venus sits in the 2nd from the Moon', () => {
    const chart = buildChart({ MOON: { rashiIndex: 0 }, VENUS: { rashiIndex: 1 } });
    expect(find(computeYogaDosha(chart), 'yogas', 'kemadruma').present).toBe(false);
  });

  it('detects Raja yoga when a kendra lord and trikona lord are conjunct', () => {
    // Ascendant Mesha: 9th lord Jupiter (Dhanu), 10th lord Saturn (Makara).
    const chart = buildChart({ JUPITER: { rashiIndex: 2 }, SATURN: { rashiIndex: 2 } }, 0);
    expect(find(computeYogaDosha(chart), 'yogas', 'rajaYoga').present).toBe(true);
  });

  it('detects Mangal dosha for Mars in the 7th house', () => {
    // Ascendant Mesha; Mars in Tula = house 7.
    const chart = buildChart({ MARS: { rashiIndex: 6 } }, 0);
    expect(find(computeYogaDosha(chart), 'doshas', 'mangal').present).toBe(true);
  });

  it('does not detect Mangal dosha for Mars in the 3rd house', () => {
    const chart = buildChart({ MARS: { rashiIndex: 2 } }, 0);
    expect(find(computeYogaDosha(chart), 'doshas', 'mangal').present).toBe(false);
  });

  it('detects Kaal Sarpa when all seven planets sit on one side of the nodal axis', () => {
    const chart = buildChart({
      RAHU: { longitude: 0, rashiIndex: 0 },
      KETU: { longitude: 180, rashiIndex: 6 },
      SUN: { longitude: 20, rashiIndex: 0 },
      MOON: { longitude: 50, rashiIndex: 1 },
      MARS: { longitude: 80, rashiIndex: 2 },
      MERCURY: { longitude: 110, rashiIndex: 3 },
      JUPITER: { longitude: 140, rashiIndex: 4 },
      VENUS: { longitude: 160, rashiIndex: 5 },
      SATURN: { longitude: 170, rashiIndex: 5 },
    });
    expect(find(computeYogaDosha(chart), 'doshas', 'kaalSarpa').present).toBe(true);
  });

  it('does not detect Kaal Sarpa when planets straddle the axis', () => {
    const chart = buildChart({
      RAHU: { longitude: 0, rashiIndex: 0 },
      KETU: { longitude: 180, rashiIndex: 6 },
      SUN: { longitude: 20, rashiIndex: 0 },
      SATURN: { longitude: 200, rashiIndex: 6 },
    });
    expect(find(computeYogaDosha(chart), 'doshas', 'kaalSarpa').present).toBe(false);
  });

  it('detects Grahan and Guru Chandal doshas from nodal conjunctions', () => {
    const chart = buildChart({
      SUN: { rashiIndex: 3 }, RAHU: { rashiIndex: 3 }, JUPITER: { rashiIndex: 3 },
    });
    const result = computeYogaDosha(chart);
    expect(find(result, 'doshas', 'grahan').present).toBe(true);
    expect(find(result, 'doshas', 'guruChandal').present).toBe(true);
  });
});
