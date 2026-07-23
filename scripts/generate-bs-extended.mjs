// Generates frontend/src/data/bs-extended.json: BS years 2091-2200 computed
// from solar sankrantis (Sun's sidereal longitude crossing k*30 deg, Lahiri
// ayanamsa) via the same Swiss Ephemeris setup the app uses for charts.
//
// Attribution rule: a BS month begins on the Nepal civil day (UTC+5:45) on
// which its sankranti falls. This yields Baishakh 1, 2091 = 2034-04-14, the
// day after nepali-date-converter's table ends (30 Chaitra 2090 = 2034-04-13).
//
// Official BS tables are Surya Siddhanta-based and committee-adjusted, so a
// modern-ephemeris reconstruction can differ by +/-1 day at month boundaries;
// for years past 2090 BS no official table exists, making this the best
// available data. The UI marks these dates with a trailing asterisk.
//
// Deterministic: fixed 60-iteration bisection, fixed ephemeris. Re-running
// must reproduce the committed JSON byte-for-byte.
//
// Usage: cd backend && node scripts/generate-bs-extended.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getSwe } from '../src/swissephService.js';

const FIRST_BS_YEAR = 2091;
const LAST_BS_YEAR = 2200;
const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60000;
const DAY_MS = 86400000;

const swe = await getSwe();

function sunSiderealLongitude(jd) {
  return swe.degnorm(swe.calc_ut(jd, swe.SE_SUN, swe.SEFLG_SWIEPH | swe.SEFLG_SIDEREAL)[0]);
}

// Julian day at which the Sun's sidereal longitude crosses `target` degrees,
// bisected between jd0 and jd1 (which must bracket exactly one crossing).
function findCrossing(target, jd0, jd1) {
  const signedDistance = (jd) => ((sunSiderealLongitude(jd) - target + 540) % 360) - 180;
  let a = jd0;
  let b = jd1;
  for (let i = 0; i < 60; i++) {
    const mid = (a + b) / 2;
    if (signedDistance(a) < 0 === signedDistance(mid) < 0) {
      a = mid;
    } else {
      b = mid;
    }
  }
  return (a + b) / 2;
}

// Nepal civil day (as UTC-midnight ms) containing the given julian-day instant.
function nepalCivilDayMs(jd) {
  const utcMs = (jd - 2440587.5) * DAY_MS;
  const shifted = new Date(utcMs + NEPAL_OFFSET_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

// Civil day of sankranti k (0 = Mesha, ~April) belonging to the BS year that
// starts in AD `adYear`. Sankrantis 0-8 fall in adYear (Apr-Dec), 9-11 in
// adYear+1 (Jan-Mar).
function sankrantiCivilDayMs(k, adYear) {
  const approxMonth = ((3 + k) % 12) + 1;
  const year = approxMonth >= 4 ? adYear : adYear + 1;
  const jd = findCrossing(
    k * 30,
    swe.julday(year, approxMonth, 3, 0),
    swe.julday(year, approxMonth, 28, 0),
  );
  return nepalCivilDayMs(jd);
}

const years = {};
for (let bsYear = FIRST_BS_YEAR; bsYear <= LAST_BS_YEAR; bsYear++) {
  const adYear = bsYear - 57;
  const starts = [];
  for (let k = 0; k < 12; k++) {
    starts.push(sankrantiCivilDayMs(k, adYear));
  }
  const nextMesha = sankrantiCivilDayMs(0, adYear + 1);
  const months = [];
  for (let k = 0; k < 11; k++) {
    months.push((starts[k + 1] - starts[k]) / DAY_MS);
  }
  months.push((nextMesha - starts[11]) / DAY_MS);
  years[bsYear] = {
    firstDay: new Date(starts[0]).toISOString().slice(0, 10),
    months,
  };
}

const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'frontend', 'src', 'data', 'bs-extended.json');
writeFileSync(outPath, `${JSON.stringify(years, null, 2)}\n`);
console.log(`wrote ${outPath}: BS ${FIRST_BS_YEAR}-${LAST_BS_YEAR}`);
process.exit(0);
