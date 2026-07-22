const RASHI_NAMES = [
  'Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya',
  'Tula', 'Vrishchika', 'Dhanu', 'Makara', 'Kumbha', 'Meena',
];

const NAKSHATRA_NAMES = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
  'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
  'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha',
  'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati',
];

// sweKey is the property name on a live SwissEph instance (e.g. instance['SE_SUN']).
// KETU has sweKey: null because it is not an ephemeris body — it is always
// computed as Rahu's longitude + 180 degrees (see kundaliCalculator.js).
const PLANET_DEFS = [
  { key: 'SUN', name: 'Sun', abbreviation: 'Su', sweKey: 'SE_SUN' },
  { key: 'MOON', name: 'Moon', abbreviation: 'Mo', sweKey: 'SE_MOON' },
  { key: 'MARS', name: 'Mars', abbreviation: 'Ma', sweKey: 'SE_MARS' },
  { key: 'MERCURY', name: 'Mercury', abbreviation: 'Me', sweKey: 'SE_MERCURY' },
  { key: 'JUPITER', name: 'Jupiter', abbreviation: 'Ju', sweKey: 'SE_JUPITER' },
  { key: 'VENUS', name: 'Venus', abbreviation: 'Ve', sweKey: 'SE_VENUS' },
  { key: 'SATURN', name: 'Saturn', abbreviation: 'Sa', sweKey: 'SE_SATURN' },
  { key: 'RAHU', name: 'Rahu', abbreviation: 'Ra', sweKey: 'SE_MEAN_NODE' },
  { key: 'KETU', name: 'Ketu', abbreviation: 'Ke', sweKey: null },
];

export { RASHI_NAMES, NAKSHATRA_NAMES, PLANET_DEFS };
