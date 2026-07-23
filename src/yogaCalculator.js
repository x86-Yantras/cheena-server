// Classical yogas and doshas computed from sign/house placements only —
// everything here derives from the planet list and ascendant that
// calculateKundali already produces.

const KENDRA_HOUSES = [1, 4, 7, 10];
const TRIKONA_HOUSES = [1, 5, 9];
const MANGAL_DOSHA_HOUSES = [1, 2, 4, 7, 8, 12];

const EXALTATION_RASHI = {
  SUN: 0, MOON: 1, MARS: 9, MERCURY: 5, JUPITER: 3,
  VENUS: 11, SATURN: 6, RAHU: 1, KETU: 7,
};

const OWN_RASHIS = {
  SUN: [4], MOON: [3], MARS: [0, 7], MERCURY: [2, 5], JUPITER: [8, 11],
  VENUS: [1, 6], SATURN: [9, 10], RAHU: [], KETU: [],
};

// Lord of each rashi, 0 = Mesha ... 11 = Meena.
const RASHI_LORDS = [
  'MARS', 'VENUS', 'MERCURY', 'MOON', 'SUN', 'MERCURY',
  'VENUS', 'MARS', 'JUPITER', 'SATURN', 'SATURN', 'JUPITER',
];

const MAHAPURUSHA_YOGAS = [
  { key: 'ruchaka', planet: 'MARS' },
  { key: 'bhadra', planet: 'MERCURY' },
  { key: 'hamsa', planet: 'JUPITER' },
  { key: 'malavya', planet: 'VENUS' },
  { key: 'shasha', planet: 'SATURN' },
];

function houseBetweenRashis(fromRashiIndex, toRashiIndex) {
  return ((toRashiIndex - fromRashiIndex + 12) % 12) + 1;
}

function isStrong(planet) {
  return planet.rashiIndex === EXALTATION_RASHI[planet.key]
    || OWN_RASHIS[planet.key].includes(planet.rashiIndex);
}

function computeYogaDosha({ planets, ascendant }) {
  const byKey = Object.fromEntries(planets.map((p) => [p.key, p]));
  const { SUN: sun, MOON: moon, MARS: mars, MERCURY: mercury, JUPITER: jupiter, RAHU: rahu } = byKey;

  const yogas = [];

  const jupiterHouseFromMoon = houseBetweenRashis(moon.rashiIndex, jupiter.rashiIndex);
  yogas.push({ key: 'gajakesari', present: KENDRA_HOUSES.includes(jupiterHouseFromMoon) });
  yogas.push({ key: 'budhaditya', present: sun.rashiIndex === mercury.rashiIndex });
  yogas.push({ key: 'chandraMangal', present: moon.rashiIndex === mars.rashiIndex });

  for (const { key, planet } of MAHAPURUSHA_YOGAS) {
    const p = byKey[planet];
    yogas.push({ key, present: isStrong(p) && KENDRA_HOUSES.includes(p.house) });
  }

  // Kemadruma: no planet in the 2nd or 12th rashi from the Moon. Sun, Rahu,
  // and Ketu are classically exempt from cancelling it.
  const flankingRashis = [(moon.rashiIndex + 1) % 12, (moon.rashiIndex + 11) % 12];
  const hasFlankingPlanet = planets.some(
    (p) => !['MOON', 'SUN', 'RAHU', 'KETU'].includes(p.key) && flankingRashis.includes(p.rashiIndex),
  );
  yogas.push({ key: 'kemadruma', present: !hasFlankingPlanet });

  // Raja yoga: a kendra lord and a trikona lord conjunct in the same rashi.
  const lordOfHouse = (house) => RASHI_LORDS[(ascendant.rashiIndex + house - 1) % 12];
  const kendraLords = new Set(KENDRA_HOUSES.map(lordOfHouse));
  const trikonaLords = new Set(TRIKONA_HOUSES.map(lordOfHouse));
  let rajaYogaPresent = false;
  for (const kendraLord of kendraLords) {
    for (const trikonaLord of trikonaLords) {
      if (kendraLord !== trikonaLord
        && byKey[kendraLord].rashiIndex === byKey[trikonaLord].rashiIndex) {
        rajaYogaPresent = true;
      }
    }
  }
  yogas.push({ key: 'rajaYoga', present: rajaYogaPresent });

  const doshas = [];

  doshas.push({ key: 'mangal', present: MANGAL_DOSHA_HOUSES.includes(mars.house) });

  // Kaal Sarpa: the seven classical planets all on one side of the Rahu-Ketu axis.
  const sevenPlanets = planets.filter((p) => !['RAHU', 'KETU'].includes(p.key));
  const sides = sevenPlanets.map((p) => ((p.longitude - rahu.longitude + 360) % 360) < 180);
  doshas.push({ key: 'kaalSarpa', present: sides.every(Boolean) || sides.every((s) => !s) });

  const nodeRashis = [byKey.RAHU.rashiIndex, byKey.KETU.rashiIndex];
  doshas.push({
    key: 'grahan',
    present: nodeRashis.includes(sun.rashiIndex) || nodeRashis.includes(moon.rashiIndex),
  });
  doshas.push({ key: 'guruChandal', present: jupiter.rashiIndex === rahu.rashiIndex });

  return { yogas, doshas };
}

export { computeYogaDosha };
