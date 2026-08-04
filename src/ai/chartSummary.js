import { RASHI_LORDS, EXALTATION_RASHI, OWN_RASHIS } from '../yogaCalculator.js';
import { PLANET_FRIENDSHIP } from '../matchData.js';
import { computeJulianDay, computePlanetLongitude } from '../swissephService.js';

const KENDRA_HOUSES = [1, 4, 7, 10];
const TRIKONA_HOUSES = [1, 5, 9];
const MARAKA_HOUSES = [2, 7];
const MALEFIC_LORD_HOUSES = [3, 6, 11];

function computeHouseLords(ascendantRashiIndex) {
  const houseLords = [];
  for (let house = 1; house <= 12; house += 1) {
    const rashiIndex = (ascendantRashiIndex + house - 1) % 12;
    houseLords.push({ house, rashiIndex, lord: RASHI_LORDS[rashiIndex] });
  }
  return houseLords;
}

function computeLordOf(planetKey, ascendantRashiIndex) {
  const houseLords = computeHouseLords(ascendantRashiIndex);
  return houseLords.filter((h) => h.lord === planetKey).map((h) => h.house);
}

function computeFunctionalNature(planetKey, lordOf) {
  if (lordOf.length === 0) return 'Neutral';
  const isKendra = lordOf.some((h) => KENDRA_HOUSES.includes(h));
  const isTrikona = lordOf.some((h) => TRIKONA_HOUSES.includes(h));
  if (isKendra && isTrikona) return 'Yogakaraka';
  // House 7 is both a kendra and a maraka house — maraka status is checked
  // before the plain kendra/trikona Benefic case so a pure 7th-lord (no
  // trikona) reads as Maraka, not Benefic, matching classical precedence.
  if (lordOf.some((h) => MARAKA_HOUSES.includes(h))) return 'Maraka';
  if (isKendra || isTrikona) return 'Benefic';
  if (lordOf.some((h) => MALEFIC_LORD_HOUSES.includes(h))) return 'Malefic';
  return 'Neutral';
}

function computeDignity(planetKey, rashiIndex) {
  const exaltationRashi = EXALTATION_RASHI[planetKey];
  if (exaltationRashi === undefined) return 'Neutral';
  if (rashiIndex === exaltationRashi) return 'Exalted';
  const debilitationRashi = (exaltationRashi + 6) % 12;
  if (rashiIndex === debilitationRashi) return 'Debilitated';
  if ((OWN_RASHIS[planetKey] || []).includes(rashiIndex)) return 'OwnSign';

  // Friend/Enemy classification based on the natural friendship table.
  // Only applies to the 7 classical grahas (nodes have no friendship data).
  if (PLANET_FRIENDSHIP[planetKey]) {
    const rashiLord = RASHI_LORDS[rashiIndex];
    const friendshipData = PLANET_FRIENDSHIP[planetKey];
    if (friendshipData.friends.includes(rashiLord)) return 'Friend';
    if (friendshipData.enemies.includes(rashiLord)) return 'Enemy';
  }

  return 'Neutral';
}

const COMBUSTION_LIMITS = {
  MERCURY: 12, VENUS: 8, MARS: 17, JUPITER: 11, SATURN: 15, MOON: 12,
};

function computeNeechaBhanga(planetKey, rashiIndex, ascendantRashiIndex, allPlanets) {
  const exaltationRashi = EXALTATION_RASHI[planetKey];
  if (exaltationRashi === undefined) return false;
  const debilitationRashi = (exaltationRashi + 6) % 12;
  if (rashiIndex !== debilitationRashi) return false;

  const exaltationLord = RASHI_LORDS[exaltationRashi];
  const debilitationLord = RASHI_LORDS[debilitationRashi];
  const byKey = Object.fromEntries(allPlanets.map((p) => [p.key, p]));

  const exaltationLordInKendra = byKey[exaltationLord] && KENDRA_HOUSES.includes(byKey[exaltationLord].house);
  const debilitationLordInKendra = byKey[debilitationLord] && KENDRA_HOUSES.includes(byKey[debilitationLord].house);
  return Boolean(exaltationLordInKendra || debilitationLordInKendra);
}

function isVargottama(rashiIndex, navamsaRashiIndex) {
  return rashiIndex === navamsaRashiIndex;
}

function computeIsCombust(planetKey, planetLongitude, sunLongitude) {
  const limit = COMBUSTION_LIMITS[planetKey];
  if (limit === undefined) return false;
  const diff = Math.abs(planetLongitude - sunLongitude);
  const angularDistance = Math.min(diff, 360 - diff);
  return angularDistance < limit;
}

function subtractOneDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function computeIsRetrograde({ dateStr, timeStr, latitude, longitude, timezone, planetKey, currentLongitude, swe }) {
  try {
    const priorDateStr = subtractOneDay(dateStr);
    const jd = await computeJulianDay(priorDateStr, timeStr, latitude, longitude, timezone);
    const priorLongitude = await computePlanetLongitude(jd, swe[planetKey]);
    // Forward motion: current is ahead of prior, allowing for the 0/360 wrap.
    // If the shortest signed arc from prior to current is negative, the planet moved backward.
    const signedArc = ((currentLongitude - priorLongitude + 540) % 360) - 180;
    return signedArc < 0;
  } catch {
    return null;
  }
}

export { computeHouseLords, computeLordOf, computeFunctionalNature, computeDignity, computeNeechaBhanga, isVargottama, computeIsCombust, computeIsRetrograde };
