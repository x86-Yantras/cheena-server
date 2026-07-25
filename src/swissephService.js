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
// Planet longitudes are geocentric: identical for every observer at a given
// julian day, so they're safely shared across concurrent requests that
// happen to land on the same instant. The ascendant is NOT — it depends on
// latitude/longitude too — so a jd-only cache key would let two concurrent
// requests for the same instant but different locations clobber each
// other's ascendant. Cache the two independently, keyed accordingly.
const planetLongitudesCache = new Map(); // jd -> planetLongitudes
const ascendantCache = new Map(); // `${jd}|${latitude}|${longitude}` -> ascendantLongitude
const bhavaMadhyasCache = new Map(); // `${jd}|${latitude}|${longitude}` -> bhavaMadhyas[]

function scheduleEviction(cache, key) {
  const timer = setTimeout(() => cache.delete(key), CACHE_TTL_MS);
  timer.unref?.();
}

function ascendantCacheKey(jd, latitude, longitude) {
  return `${jd}|${latitude}|${longitude}`;
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
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Ephemeris service returned ${response.status} with an unparsable body`);
  }
  if (!response.ok) {
    throw new Error(body.error || `Ephemeris service returned ${response.status}`);
  }
  const { julianDay, ascendantLongitude, planetLongitudes, bhavaMadhyas } = body;
  planetLongitudesCache.set(julianDay, planetLongitudes);
  scheduleEviction(planetLongitudesCache, julianDay);
  const ascKey = ascendantCacheKey(julianDay, latitude, longitude);
  ascendantCache.set(ascKey, ascendantLongitude);
  scheduleEviction(ascendantCache, ascKey);
  bhavaMadhyasCache.set(ascKey, bhavaMadhyas);
  scheduleEviction(bhavaMadhyasCache, ascKey);
  return julianDay;
}

async function computeAscendantLongitude(jd, latitude, longitude) {
  const ascKey = ascendantCacheKey(jd, latitude, longitude);
  const cached = ascendantCache.get(ascKey);
  if (cached === undefined) {
    throw new Error(`No cached ascendant for julian day ${jd} at (${latitude}, ${longitude}). computeJulianDay must be called first with the same coordinates.`);
  }
  return cached;
}

async function computePlanetLongitude(jd, sweConst) {
  const cached = planetLongitudesCache.get(jd);
  if (!cached) {
    throw new Error(`No cached ephemeris response for julian day ${jd}. computeJulianDay must be called first.`);
  }
  return cached[sweConst];
}

async function computeBhavaMadhyas(jd, latitude, longitude) {
  const key = ascendantCacheKey(jd, latitude, longitude);
  if (!bhavaMadhyasCache.has(key)) {
    throw new Error(`No cached bhava madhyas for julian day ${jd} at (${latitude}, ${longitude}). computeJulianDay must be called first with the same coordinates.`);
  }
  // The key can be present with value `undefined` when computeJulianDay was
  // called but the cached ephemeris response never included bhavaMadhyas
  // (e.g. backend deployed ahead of the ephemeris service). That's a real,
  // graceful "field not available yet" case, distinct from the error above.
  return bhavaMadhyasCache.get(key);
}

export { getSwe, resolveUtc, computeJulianDay, computeAscendantLongitude, computePlanetLongitude, computeBhavaMadhyas };
