import { getSwe, computeJulianDay, computeAscendantLongitude, computePlanetLongitude } from './swissephService.js';
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
    planets.push({
      key: planetDef.key,
      name: planetDef.name,
      abbreviation: planetDef.abbreviation,
      longitude: planetLongitude,
      ...rashi,
      ...nakshatra,
      house,
    });
  }

  return {
    julianDay: jd,
    ascendant: { longitude: ascendantLongitude, ...ascendantRashi },
    planets,
  };
}

export { calculateKundali, rashiFromLongitude, nakshatraFromLongitude, houseFromRashi, navamsaRashiIndex };
