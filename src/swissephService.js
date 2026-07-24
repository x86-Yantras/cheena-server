import tzlookup from 'tz-lookup';
import { DateTime } from 'luxon';

const SWE_CONSTANTS = {
  SE_SUN: 'SUN',
  SE_MOON: 'MOON',
  SE_MARS: 'MARS',
  SE_MERCURY: 'MERCURY',
  SE_JUPITER: 'JUPITER',
  SE_VENUS: 'VENUS',
  SE_SATURN: 'SATURN',
  SE_MEAN_NODE: 'RAHU',
};

const CACHE_TTL_MS = 30000;
const ephemerisCache = new Map();

function cacheEphemerisResponse(jd, response) {
  ephemerisCache.set(jd, response);
  const timer = setTimeout(() => ephemerisCache.delete(jd), CACHE_TTL_MS);
  timer.unref?.();
}

async function getSwe() {
  return SWE_CONSTANTS;
}

function resolveUtc(dateStr, timeStr, latitude, longitude, timezone) {
  const zone = timezone || tzlookup(latitude, longitude);
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const local = DateTime.fromObject({ year, month, day, hour, minute, second: 0 }, { zone });
  if (!local.isValid) {
    throw new Error(`Invalid date/time/timezone: ${local.invalidReason} ${local.invalidExplanation ?? ''}`.trim());
  }
  return local.toUTC();
}

async function computeJulianDay(dateStr, timeStr, latitude, longitude, timezone) {
  const response = await fetch(`${process.env.EPHEMERIS_SERVICE_URL}/v1/ephemeris`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.EPHEMERIS_SERVICE_API_KEY,
    },
    body: JSON.stringify({
      date: dateStr,
      time: timeStr,
      latitude,
      longitude,
      timezone,
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || `Ephemeris service returned ${response.status}`);
  }
  cacheEphemerisResponse(body.julianDay, body);
  return body.julianDay;
}

async function computeAscendantLongitude(jd, latitude, longitude) {
  const cached = ephemerisCache.get(jd);
  if (!cached) {
    throw new Error(`No cached ephemeris response for julian day ${jd}. computeJulianDay must be called first.`);
  }
  return cached.ascendantLongitude;
}

async function computePlanetLongitude(jd, sweConst) {
  const cached = ephemerisCache.get(jd);
  if (!cached) {
    throw new Error(`No cached ephemeris response for julian day ${jd}. computeJulianDay must be called first.`);
  }
  return cached.planetLongitudes[sweConst];
}

export { getSwe, resolveUtc, computeJulianDay, computeAscendantLongitude, computePlanetLongitude };
