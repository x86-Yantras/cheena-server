import { RASHI_LORDS, EXALTATION_RASHI, OWN_RASHIS } from '../yogaCalculator.js';
import { PLANET_FRIENDSHIP } from '../matchData.js';
import { computeJulianDay, computePlanetLongitude } from '../swissephService.js';
import { PLANET_NAMES_NE, RASHI_NAMES_NE, ORDINAL_LORD_SUFFIX_NE, toDevanagariDigits } from './nepaliNames.js';

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

function findPeriodContaining(periods, nowMs) {
  return periods.find((p) => nowMs >= new Date(p.start).getTime() && nowMs < new Date(p.end).getTime()) || null;
}

function findCurrentDasha(mahadashas, nowMs) {
  const maha = findPeriodContaining(mahadashas, nowMs);
  if (!maha) return { mahadasha: null, antardasha: null, pratyantardasha: null };
  const antar = findPeriodContaining(maha.subPeriods || [], nowMs);
  if (!antar) return { mahadasha: maha.lord, antardasha: null, pratyantardasha: null };
  const pratyantar = findPeriodContaining(antar.subPeriods || [], nowMs);
  return { mahadasha: maha.lord, antardasha: antar.lord, pratyantardasha: pratyantar ? pratyantar.lord : null };
}

function describeDashaLordRole(lordKey, ascendantRashiIndex, planetsByKey) {
  const lordOf = computeLordOf(lordKey, ascendantRashiIndex);
  const houseText = lordOf.map((h) => ORDINAL_LORD_SUFFIX_NE[h - 1]).join('+');
  const planet = planetsByKey[lordKey];
  const placementText = planet ? `भाव ${toDevanagariDigits(planet.house)} मा` : '';
  return [houseText, placementText].filter(Boolean).join(', ');
}

const YOGA_DESCRIPTIONS = {
  gajakesari: { name: 'गजकेसरी योग', effect: 'बुद्धि, सम्मान र नेतृत्व क्षमता बलियो', nature: 'Benefic' },
  budhaditya: { name: 'बुधादित्य योग', effect: 'बुद्धि र सञ्चार क्षमता तीक्ष्ण', nature: 'Benefic' },
  chandraMangal: { name: 'चन्द्र-मंगल योग', effect: 'आर्थिक उद्यमशीलता, तर भावनात्मक अस्थिरताको जोखिम', nature: 'Mixed' },
  ruchaka: { name: 'रुचक महापुरुष योग', effect: 'साहस, नेतृत्व र शारीरिक बल', nature: 'Benefic' },
  bhadra: { name: 'भद्र महापुरुष योग', effect: 'बुद्धिमत्ता र व्यापारिक सफलता', nature: 'Benefic' },
  hamsa: { name: 'हंस महापुरुष योग', effect: 'ज्ञान, आध्यात्मिकता र सम्मान', nature: 'Benefic' },
  malavya: { name: 'मालव्य महापुरुष योग', effect: 'सौन्दर्य, सुख र समृद्धि', nature: 'Benefic' },
  shasha: { name: 'शश महापुरुष योग', effect: 'अनुशासन, अधिकार र दीर्घकालीन सफलता', nature: 'Benefic' },
  kemadruma: { name: 'केमद्रुम दोष', effect: 'संघर्ष र एक्लोपनको भावना, तर आत्मनिर्भरता पनि', nature: 'Malefic' },
  rajaYoga: { name: 'राजयोग', effect: 'उन्नति, अधिकार र सामाजिक प्रतिष्ठा', nature: 'Benefic' },
  mangal: { name: 'मंगल दोष', effect: 'वैवाहिक जीवनमा प्रारम्भिक तनावको सम्भावना', nature: 'Malefic' },
  kaalSarpa: { name: 'कालसर्प दोष', effect: 'जीवनमा बाधा र ढिलाइ, तर असाधारण उपलब्धिको सम्भावना पनि', nature: 'Mixed' },
  grahan: { name: 'ग्रहण दोष', effect: 'मानसिक अस्पष्टता वा आत्मविश्वासमा कमी हुन सक्ने', nature: 'Malefic' },
  guruChandal: { name: 'गुरु-चाण्डाल योग', effect: 'वैचारिक द्वन्द्व, आध्यात्मिकतातर्फ झुकाव', nature: 'Mixed' },
};

function describeYogas(yogaDosha) {
  const present = [...(yogaDosha.yogas || []), ...(yogaDosha.doshas || [])].filter((y) => y.present);
  return present
    .filter((y) => YOGA_DESCRIPTIONS[y.key])
    .map((y) => {
      const desc = YOGA_DESCRIPTIONS[y.key];
      return { name: desc.name, planetsInvolved: [], house: null, effect: desc.effect, nature: desc.nature };
    });
}

function houseBetween(fromRashiIndex, toRashiIndex) {
  return ((toRashiIndex - fromRashiIndex + 12) % 12) + 1;
}

const TRANSIT_PLANETS = ['SATURN', 'JUPITER', 'RAHU', 'KETU'];

async function computeTransits({ moonRashiIndex, ascendantRashiIndex, latitude, longitude, timezone, swe }) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const nowTime = new Date().toISOString().slice(11, 16);
    const jd = await computeJulianDay(today, nowTime, latitude, longitude, timezone);

    const transits = [];
    let rahuLongitude;
    for (const planetKey of TRANSIT_PLANETS) {
      const planetLongitude = planetKey === 'KETU'
        ? (rahuLongitude + 180) % 360
        : await computePlanetLongitude(jd, swe[planetKey]);
      if (planetKey === 'RAHU') rahuLongitude = planetLongitude;

      const rashiIndex = Math.floor(planetLongitude / 30) % 12;
      const houseFromMoon = houseBetween(moonRashiIndex, rashiIndex);
      const houseFromLagna = houseBetween(ascendantRashiIndex, rashiIndex);
      const isRetrograde = planetKey === 'KETU' ? null : await computeIsRetrograde({
        dateStr: today, timeStr: nowTime, latitude, longitude, timezone,
        planetKey, currentLongitude: planetLongitude, swe,
      });

      const isSadeSati = planetKey === 'SATURN' && [12, 1, 2].includes(houseFromMoon);
      const noteParts = [
        `${toDevanagariDigits(houseFromMoon)}म भाव (चन्द्रबाट)`,
        isRetrograde ? 'वक्री' : null,
        planetKey === 'SATURN' ? (isSadeSati ? 'साढेसाती' : 'साढेसाती होइन') : null,
      ].filter(Boolean);

      transits.push({
        planet: PLANET_NAMES_NE[planetKey],
        rashi: RASHI_NAMES_NE[rashiIndex],
        houseFromMoon,
        houseFromLagna,
        isRetrograde,
        note: noteParts.join(', '),
      });
    }
    return transits;
  } catch {
    return [];
  }
}

export { computeHouseLords, computeLordOf, computeFunctionalNature, computeDignity, computeNeechaBhanga, isVargottama, computeIsCombust, computeIsRetrograde, findCurrentDasha, describeDashaLordRole, describeYogas, computeTransits };
