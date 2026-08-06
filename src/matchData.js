// Traditional Ashtakoot / Manglik reference tables for kundali milan
// (marriage matching). Rashi indices are 0=Mesha..11=Meena and nakshatra
// indices are 0=Ashwini..26=Revati, matching RASHI_NAMES / NAKSHATRA_NAMES
// in astro-data.js and the rashiIndex / nakshatraIndex fields already
// present on planets in a calculateKundali() result.

const RASHI_LORDS = [
  'MARS', 'VENUS', 'MERCURY', 'MOON', 'SUN', 'MERCURY',
  'VENUS', 'MARS', 'JUPITER', 'SATURN', 'SATURN', 'JUPITER',
];

const VARNA_BY_RASHI = [
  'kshatriya', 'vaishya', 'shudra', 'brahmin', 'kshatriya', 'vaishya',
  'shudra', 'brahmin', 'kshatriya', 'vaishya', 'shudra', 'brahmin',
];
const VARNA_RANK = { brahmin: 4, kshatriya: 3, vaishya: 2, shudra: 1 };

const VASHYA_GROUP_BY_RASHI = [
  'chatushpada', 'chatushpada', 'manava', 'jalachara', 'vanachara', 'manava',
  'manava', 'keeta', 'chatushpada', 'chatushpada', 'manava', 'jalachara',
];
const VASHYA_MATRIX = {
  chatushpada: { chatushpada: 2, manava: 1, jalachara: 1, vanachara: 0, keeta: 1 },
  manava: { chatushpada: 1, manava: 2, jalachara: 1, vanachara: 0.5, keeta: 1 },
  jalachara: { chatushpada: 1, manava: 1, jalachara: 2, vanachara: 0.5, keeta: 1 },
  vanachara: { chatushpada: 0, manava: 0.5, jalachara: 0.5, vanachara: 2, keeta: 0 },
  keeta: { chatushpada: 1, manava: 1, jalachara: 1, vanachara: 0, keeta: 2 },
};

// Yoni animal per nakshatra (Ashwini..Revati).
const YONI_BY_NAKSHATRA = [
  'horse', 'elephant', 'sheep', 'serpent', 'serpent', 'dog', 'cat', 'sheep', 'cat',
  'rat', 'rat', 'cow', 'buffalo', 'tiger', 'buffalo', 'tiger', 'deer', 'deer', 'dog',
  'monkey', 'mongoose', 'monkey', 'lion', 'horse', 'lion', 'cow', 'elephant',
];
// The 14 yoni animals pair up into 7 natural-enemy pairs.
const YONI_ENEMY_PAIRS = [
  ['horse', 'buffalo'], ['elephant', 'lion'], ['sheep', 'monkey'],
  ['serpent', 'mongoose'], ['dog', 'deer'], ['cat', 'rat'], ['cow', 'tiger'],
];

// Gana (temperament class) per nakshatra.
const GANA_BY_NAKSHATRA = [
  'deva', 'manushya', 'rakshasa', 'manushya', 'deva', 'manushya', 'deva', 'deva', 'rakshasa',
  'rakshasa', 'manushya', 'manushya', 'deva', 'rakshasa', 'deva', 'rakshasa', 'deva', 'rakshasa',
  'rakshasa', 'manushya', 'manushya', 'deva', 'rakshasa', 'rakshasa', 'manushya', 'manushya', 'deva',
];
const GANA_MATRIX = {
  deva: { deva: 6, manushya: 5, rakshasa: 1 },
  manushya: { deva: 6, manushya: 6, rakshasa: 0 },
  rakshasa: { deva: 1, manushya: 0, rakshasa: 6 },
};

// Nadi (biological humor) per nakshatra. Verified against two independent
// sources (jagannathhora.com/nadi-dosha-complete-guide and
// astrolight08.wordpress.com/2018/08/24/nakshatra-nadi), which agree:
// Aadi: Ashwini, Ardra, Punarvasu, Uttara Phalguni, Hasta, Jyeshtha, Mula,
//       Shatabhisha, Purva Bhadrapada
// Madhya: Bharani, Mrigashira, Pushya, Purva Phalguni, Chitra, Anuradha,
//         Purva Ashadha, Dhanishta, Uttara Bhadrapada
// Antya: Krittika, Rohini, Ashlesha, Magha, Swati, Vishakha, Uttara Ashadha,
//        Shravana, Revati
// This is a "zigzag" pattern: each consecutive group of 3 nakshatras cycles
// aadi/madhya/antya, alternating forward and reverse direction per group.
const NADI_BY_NAKSHATRA = [
  'aadi', 'madhya', 'antya', 'antya', 'madhya', 'aadi', 'aadi', 'madhya', 'antya',
  'antya', 'madhya', 'aadi', 'aadi', 'madhya', 'antya', 'antya', 'madhya', 'aadi',
  'aadi', 'madhya', 'antya', 'antya', 'madhya', 'aadi', 'aadi', 'madhya', 'antya',
];

// Naisargika (natural) friendship among the 7 classical grahas.
// Relationships are not always symmetric (e.g. Moon considers Mars neutral,
// but Mars considers Moon a friend).
const PLANET_FRIENDSHIP = {
  SUN: { friends: ['MOON', 'MARS', 'JUPITER'], enemies: ['VENUS', 'SATURN'] },
  MOON: { friends: ['SUN', 'MERCURY'], enemies: [] },
  MARS: { friends: ['SUN', 'MOON', 'JUPITER'], enemies: ['MERCURY'] },
  MERCURY: { friends: ['SUN', 'VENUS'], enemies: ['MOON'] },
  JUPITER: { friends: ['SUN', 'MOON', 'MARS'], enemies: ['MERCURY', 'VENUS'] },
  VENUS: { friends: ['MERCURY', 'SATURN'], enemies: ['SUN', 'MOON'] },
  SATURN: { friends: ['MERCURY', 'VENUS'], enemies: ['SUN', 'MOON', 'MARS'] },
};

// Manglik (Mangal) dosha: houses counted from the Lagna, and the rashis
// where Mars is strong enough (own sign / exalted) to cancel the dosha.
const MANGAL_DOSHA_HOUSES = [1, 2, 4, 7, 8, 12];
const MARS_OWN_RASHIS = [0, 7];
const MARS_EXALTED_RASHI = 9;

// Own-sign, exaltation, and debilitation rashis for all 7 classical grahas
// (Rahu/Ketu own no rashi classically, so they have no entries here).
// Rashi indices are 0=Mesha..11=Meena, matching RASHI_LORDS above. The Mars
// entries intentionally duplicate MARS_OWN_RASHIS/MARS_EXALTED_RASHI above
// (used for Manglik dosha cancellation) -- verified equal in tests so the
// two independently-authored tables can never silently disagree.
const PLANET_OWN_RASHIS = {
  SUN: [4], MOON: [3], MARS: [0, 7], MERCURY: [2, 5],
  JUPITER: [8, 11], VENUS: [1, 6], SATURN: [9, 10],
};
const PLANET_EXALTATION_RASHI = {
  SUN: 0, MOON: 1, MARS: 9, MERCURY: 5, JUPITER: 3, VENUS: 11, SATURN: 6,
};
const PLANET_DEBILITATION_RASHI = {
  SUN: 6, MOON: 7, MARS: 3, MERCURY: 11, JUPITER: 9, VENUS: 5, SATURN: 0,
};

function classifyDignity(planet, rashiIndex) {
  if (PLANET_OWN_RASHIS[planet].includes(rashiIndex)) return 'own-sign';
  if (rashiIndex === PLANET_EXALTATION_RASHI[planet]) return 'exalted';
  if (rashiIndex === PLANET_DEBILITATION_RASHI[planet]) return 'debilitated';
  return 'neutral';
}

// Dasha-sandhi (junction): within this many years of a mahadasha boundary.
const DASHA_SANDHI_WINDOW_YEARS = 1;

export {
  RASHI_LORDS,
  VARNA_BY_RASHI, VARNA_RANK,
  VASHYA_GROUP_BY_RASHI, VASHYA_MATRIX,
  YONI_BY_NAKSHATRA, YONI_ENEMY_PAIRS,
  GANA_BY_NAKSHATRA, GANA_MATRIX,
  NADI_BY_NAKSHATRA,
  PLANET_FRIENDSHIP,
  MANGAL_DOSHA_HOUSES, MARS_OWN_RASHIS, MARS_EXALTED_RASHI,
  PLANET_OWN_RASHIS, PLANET_EXALTATION_RASHI, PLANET_DEBILITATION_RASHI,
  classifyDignity,
  DASHA_SANDHI_WINDOW_YEARS,
};
