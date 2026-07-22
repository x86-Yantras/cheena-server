import SwissEph from 'swisseph-wasm';
import tzlookup from 'tz-lookup';
import { DateTime } from 'luxon';

let swePromise = null;

function getSwe() {
  if (!swePromise) {
    swePromise = (async () => {
      const swe = new SwissEph();
      await swe.initSwissEph();
      swe.set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0);
      return swe;
    })();
  }
  return swePromise;
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
  const swe = await getSwe();
  const utc = resolveUtc(dateStr, timeStr, latitude, longitude, timezone);
  const hourDecimal = utc.hour + utc.minute / 60 + utc.second / 3600;
  return swe.julday(utc.year, utc.month, utc.day, hourDecimal);
}

async function computeAscendantLongitude(jd, latitude, longitude) {
  const swe = await getSwe();
  const houses = swe.houses_ex(jd, swe.SEFLG_SIDEREAL, latitude, longitude, 'P');
  return swe.degnorm(houses.ascmc[0]);
}

async function computePlanetLongitude(jd, sweConst) {
  const swe = await getSwe();
  const position = swe.calc_ut(jd, sweConst, swe.SEFLG_SWIEPH | swe.SEFLG_SIDEREAL);
  return swe.degnorm(position[0]);
}

export { getSwe, resolveUtc, computeJulianDay, computeAscendantLongitude, computePlanetLongitude };
