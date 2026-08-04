import { describe, it, expect } from 'vitest';
import {
  PLANET_NAMES_NE, RASHI_NAMES_NE, NAKSHATRA_NAMES_NE, ORDINAL_LORD_SUFFIX_NE,
  formatDegree, toDevanagariDigits,
} from '../../src/ai/nepaliNames.js';

describe('nepaliNames', () => {
  it('has a Nepali name for all 9 planet keys', () => {
    expect(PLANET_NAMES_NE.SUN).toBe('सूर्य');
    expect(PLANET_NAMES_NE.MOON).toBe('चन्द्र');
    expect(PLANET_NAMES_NE.MARS).toBe('मंगल');
    expect(PLANET_NAMES_NE.MERCURY).toBe('बुध');
    expect(PLANET_NAMES_NE.JUPITER).toBe('बृहस्पति');
    expect(PLANET_NAMES_NE.VENUS).toBe('शुक्र');
    expect(PLANET_NAMES_NE.SATURN).toBe('शनि');
    expect(PLANET_NAMES_NE.RAHU).toBe('राहु');
    expect(PLANET_NAMES_NE.KETU).toBe('केतु');
  });

  it('has 12 rashi names in Mesha..Meena order', () => {
    expect(RASHI_NAMES_NE).toHaveLength(12);
    expect(RASHI_NAMES_NE[0]).toBe('मेष');
    expect(RASHI_NAMES_NE[9]).toBe('मकर');
    expect(RASHI_NAMES_NE[11]).toBe('मीन');
  });

  it('has 27 nakshatra names', () => {
    expect(NAKSHATRA_NAMES_NE).toHaveLength(27);
    expect(NAKSHATRA_NAMES_NE[4]).toBe('मृगशिरा');
    expect(NAKSHATRA_NAMES_NE[26]).toBe('रेवती');
  });

  it('has 12 ordinal lord suffixes, house 1 = लग्नेश, house 12 = द्वादशेश', () => {
    expect(ORDINAL_LORD_SUFFIX_NE).toHaveLength(12);
    expect(ORDINAL_LORD_SUFFIX_NE[0]).toBe('लग्नेश');
    expect(ORDINAL_LORD_SUFFIX_NE[1]).toBe('द्वितीयेश');
    expect(ORDINAL_LORD_SUFFIX_NE[11]).toBe('द्वादशेश');
  });

  it('toDevanagariDigits converts ASCII digits', () => {
    expect(toDevanagariDigits(6)).toBe('६');
    expect(toDevanagariDigits('30')).toBe('३०');
    expect(toDevanagariDigits(0)).toBe('०');
  });

  it('formatDegree formats a fractional degree as Devanagari degree-minute text', () => {
    expect(formatDegree(6.5)).toBe('६°३०′');
    expect(formatDegree(0)).toBe('०°००′');
    expect(formatDegree(29.999999)).toBe('३०°००′');
  });
});
