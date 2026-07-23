import { describe, it, expect } from 'vitest';
import {
  RASHI_LORDS, VARNA_BY_RASHI, VARNA_RANK,
  VASHYA_GROUP_BY_RASHI, VASHYA_MATRIX,
  YONI_BY_NAKSHATRA, YONI_ENEMY_PAIRS,
  GANA_BY_NAKSHATRA, GANA_MATRIX,
  NADI_BY_NAKSHATRA, PLANET_FRIENDSHIP,
  MANGAL_DOSHA_HOUSES, MARS_OWN_RASHIS, MARS_EXALTED_RASHI,
  DASHA_SANDHI_WINDOW_YEARS,
} from '../src/matchData.js';

describe('matchData', () => {
  it('has 12-entry rashi tables', () => {
    expect(RASHI_LORDS).toHaveLength(12);
    expect(VARNA_BY_RASHI).toHaveLength(12);
    expect(VASHYA_GROUP_BY_RASHI).toHaveLength(12);
  });

  it('has 27-entry nakshatra tables', () => {
    expect(YONI_BY_NAKSHATRA).toHaveLength(27);
    expect(GANA_BY_NAKSHATRA).toHaveLength(27);
    expect(NADI_BY_NAKSHATRA).toHaveLength(27);
  });

  it('maps rashi 0 (Mesha) to Mars lordship, kshatriya varna, chatushpada vashya', () => {
    expect(RASHI_LORDS[0]).toBe('MARS');
    expect(VARNA_BY_RASHI[0]).toBe('kshatriya');
    expect(VASHYA_GROUP_BY_RASHI[0]).toBe('chatushpada');
  });

  it('ranks varna Brahmin highest and Shudra lowest', () => {
    expect(VARNA_RANK.brahmin).toBeGreaterThan(VARNA_RANK.kshatriya);
    expect(VARNA_RANK.kshatriya).toBeGreaterThan(VARNA_RANK.vaishya);
    expect(VARNA_RANK.vaishya).toBeGreaterThan(VARNA_RANK.shudra);
  });

  it('has a symmetric-diagonal vashya matrix with self-pairing at the max (2)', () => {
    for (const group of Object.keys(VASHYA_MATRIX)) {
      expect(VASHYA_MATRIX[group][group]).toBe(2);
    }
  });

  it('has 7 yoni enemy pairs covering 14 distinct animals', () => {
    expect(YONI_ENEMY_PAIRS).toHaveLength(7);
    const animals = new Set(YONI_ENEMY_PAIRS.flat());
    expect(animals.size).toBe(14);
  });

  it('gives Deva-Deva and Manushya-Manushya the max gana score (6)', () => {
    expect(GANA_MATRIX.deva.deva).toBe(6);
    expect(GANA_MATRIX.manushya.manushya).toBe(6);
    expect(GANA_MATRIX.rakshasa.rakshasa).toBe(6);
  });

  it('gives each of the 7 classical grahas a friendship entry', () => {
    for (const planet of ['SUN', 'MOON', 'MARS', 'MERCURY', 'JUPITER', 'VENUS', 'SATURN']) {
      expect(PLANET_FRIENDSHIP[planet]).toBeDefined();
      expect(Array.isArray(PLANET_FRIENDSHIP[planet].friends)).toBe(true);
      expect(Array.isArray(PLANET_FRIENDSHIP[planet].enemies)).toBe(true);
    }
  });

  it('defines the 6 classical Manglik houses and Mars strength rashis', () => {
    expect(MANGAL_DOSHA_HOUSES).toEqual([1, 2, 4, 7, 8, 12]);
    expect(MARS_OWN_RASHIS).toEqual([0, 7]);
    expect(MARS_EXALTED_RASHI).toBe(9);
  });

  it('defines a positive dasha-sandhi window', () => {
    expect(DASHA_SANDHI_WINDOW_YEARS).toBeGreaterThan(0);
  });
});
