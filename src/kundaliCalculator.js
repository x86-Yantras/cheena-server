import { getSwe, computeJulianDay, computeAscendantLongitude, computePlanetLongitude, computeBhavaMadhyas, resolveUtc } from './swissephService.js';
import { computeVimshottariDasha } from './dashaCalculator.js';
import { computeYogaDosha } from './yogaCalculator.js';
import { computePanchang } from './panchangCalculator.js';
import { RASHI_NAMES, NAKSHATRA_NAMES, PLANET_DEFS } from './astro-data.js';

const NAKSHATRA_SPAN = 360 / 27;
const PADA_SPAN = NAKSHATRA_SPAN / 4;

function rashiFromLongitude(longitude) {
  const rashiIndex = Math.floor(longitude / 30) % 12;
  const degreeInRashi = longitude % 30;
  return { rashiIndex, rashiName: RASHI_NAMES[rashiIndex], degreeInRashi };
}

function navamsaRashiIndex(longitude) {
  return Math.floor(longitude / (30 / 9)) % 12;
}

const HORA_LEO_INDEX = 4;
const HORA_CANCER_INDEX = 3;

function horaRashiIndex(longitude) {
  const signIndex = Math.floor(longitude / 30) % 12;
  const degreeInSign = longitude % 30;
  const isOddSign = signIndex % 2 === 0; // Mesha(0), Mithuna(2), ... are classically "odd" signs
  const isFirstHalf = degreeInSign < 15;
  if (isOddSign) return isFirstHalf ? HORA_LEO_INDEX : HORA_CANCER_INDEX;
  return isFirstHalf ? HORA_CANCER_INDEX : HORA_LEO_INDEX;
}

function angularMidpoint(a, b) {
  const signedDiff = ((b - a + 540) % 360) - 180; // shortest signed arc from a to b, in (-180, 180]
  return (a + signedDiff / 2 + 360) % 360;
}

function isValidBhavaMadhyas(madhyas) {
  return Array.isArray(madhyas) && madhyas.length === 12 && madhyas.every((m) => Number.isFinite(m));
}

function bhavaHouseFromLongitude(longitude, madhyas) {
  const boundaries = madhyas.map((madhya, i) => angularMidpoint(madhyas[(i - 1 + 12) % 12], madhya));
  const normalizedLongitude = ((longitude % 360) + 360) % 360;
  for (let house = 1; house <= 12; house++) {
    const start = boundaries[house - 1];
    const end = boundaries[house % 12];
    const span = ((end - start) + 360) % 360;
    const offset = ((normalizedLongitude - start) + 360) % 360;
    if (offset < span) return house;
  }
  return 12;
}

function nakshatraFromLongitude(longitude) {
  const nakshatraIndex = Math.floor(longitude / NAKSHATRA_SPAN) % 27;
  const positionInNakshatra = longitude % NAKSHATRA_SPAN;
  const pada = Math.floor(positionInNakshatra / PADA_SPAN) + 1;
  return { nakshatraIndex, nakshatraName: NAKSHATRA_NAMES[nakshatraIndex], pada };
}

function houseFromRashi(rashiIndex, ascendantRashiIndex) {
  return ((rashiIndex - ascendantRashiIndex + 12) % 12) + 1;
}

async function calculateKundali({ date, time, latitude, longitude, timezone }) {
  const swe = await getSwe();
  const jd = await computeJulianDay(date, time, latitude, longitude, timezone);

  const ascendantLongitude = await computeAscendantLongitude(jd, latitude, longitude);
  const ascendantRashi = rashiFromLongitude(ascendantLongitude);
  const ascendantNavamsaRashiIndex = navamsaRashiIndex(ascendantLongitude);
  const ascendantHoraRashiIndex = horaRashiIndex(ascendantLongitude);
  const rawBhavaMadhyas = await computeBhavaMadhyas(jd, latitude, longitude);
  // Graceful degrade (not a throw) when bhavaMadhyas is absent (upstream
  // ephemeris service hasn't shipped the field yet) or malformed (present
  // but not exactly 12 finite numbers) — in both cases we omit bhavchalit
  // from the response rather than serving a silently wrong house (see
  // bhavaHouseFromLongitude's NaN-comparison fallback) or 500ing the whole
  // kundali request over one optional field.
  const bhavaMadhyas = isValidBhavaMadhyas(rawBhavaMadhyas) ? rawBhavaMadhyas : undefined;

  const planets = [];
  for (const planetDef of PLANET_DEFS) {
    let planetLongitude;
    if (planetDef.key === 'KETU') {
      const rahu = planets.find((p) => p.key === 'RAHU');
      planetLongitude = (rahu.longitude + 180) % 360;
    } else {
      planetLongitude = await computePlanetLongitude(jd, swe[planetDef.sweKey]);
    }
    const rashi = rashiFromLongitude(planetLongitude);
    const nakshatra = nakshatraFromLongitude(planetLongitude);
    const house = houseFromRashi(rashi.rashiIndex, ascendantRashi.rashiIndex);
    const navamsaIndex = navamsaRashiIndex(planetLongitude);
    const navamsaHouse = houseFromRashi(navamsaIndex, ascendantNavamsaRashiIndex);
    const horaIndex = horaRashiIndex(planetLongitude);
    const horaHouse = houseFromRashi(horaIndex, ascendantHoraRashiIndex);
    planets.push({
      key: planetDef.key,
      name: planetDef.name,
      abbreviation: planetDef.abbreviation,
      longitude: planetLongitude,
      ...rashi,
      ...nakshatra,
      house,
      navamsa: {
        rashiIndex: navamsaIndex,
        rashiName: RASHI_NAMES[navamsaIndex],
        house: navamsaHouse,
      },
      hora: {
        rashiIndex: horaIndex,
        rashiName: RASHI_NAMES[horaIndex],
        house: horaHouse,
      },
      ...(bhavaMadhyas !== undefined && {
        bhavchalit: {
          house: bhavaHouseFromLongitude(planetLongitude, bhavaMadhyas),
        },
      }),
    });
  }

  const moon = planets.find((p) => p.key === 'MOON');
  const sun = planets.find((p) => p.key === 'SUN');
  const birthUtcMs = resolveUtc(date, time, latitude, longitude, timezone).toMillis();
  const dasha = computeVimshottariDasha(moon.longitude, birthUtcMs);
  const panchang = computePanchang({ sunLongitude: sun.longitude, moonLongitude: moon.longitude });

  return {
    julianDay: jd,
    ascendant: {
      longitude: ascendantLongitude,
      ...ascendantRashi,
      navamsa: {
        rashiIndex: ascendantNavamsaRashiIndex,
        rashiName: RASHI_NAMES[ascendantNavamsaRashiIndex],
      },
      hora: {
        rashiIndex: ascendantHoraRashiIndex,
        rashiName: RASHI_NAMES[ascendantHoraRashiIndex],
      },
      ...(bhavaMadhyas !== undefined && {
        bhavchalit: {
          house: 1,
        },
      }),
    },
    planets,
    dasha,
    yogaDosha: computeYogaDosha({ planets, ascendant: ascendantRashi }),
    panchang,
  };
}

export { calculateKundali, rashiFromLongitude, nakshatraFromLongitude, houseFromRashi, navamsaRashiIndex, horaRashiIndex, bhavaHouseFromLongitude };
