import { DateTime } from 'luxon';
import tzlookup from 'tz-lookup';
import { getSwe, computeJulianDay, computePlanetLongitude } from './swissephService.js';
import { computePanchang, karanaNameForIndex } from './panchangCalculator.js';
import { computeSunriseSunset } from './sunTimesService.js';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function parseHHmm(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function formatMinutes(totalMinutes) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function weekdayFromDate(dateStr, latitude, longitude, timezone) {
  const zone = timezone || tzlookup(latitude, longitude);
  const localDate = DateTime.fromISO(dateStr, { zone });
  // Luxon's weekday is 1=Monday..7=Sunday; WEEKDAYS is 0=sunday-indexed.
  return WEEKDAYS[localDate.weekday % 7];
}

function dayPartWindow(sunriseMin, sunsetMin, index, totalParts) {
  const partDuration = (sunsetMin - sunriseMin) / totalParts;
  return {
    start: sunriseMin + partDuration * (index - 1),
    end: sunriseMin + partDuration * index,
  };
}

const RAHU_KAAL_INDEX = { sunday: 8, monday: 2, tuesday: 7, wednesday: 5, thursday: 6, friday: 4, saturday: 3 };
const YAMAGANDA_INDEX = { sunday: 5, monday: 4, tuesday: 3, wednesday: 2, thursday: 1, friday: 7, saturday: 6 };
const GULIKA_KAAL_INDEX = { sunday: 7, monday: 6, tuesday: 5, wednesday: 4, thursday: 3, friday: 2, saturday: 1 };

function computeRahuKaal(weekday, sunriseMin, sunsetMin) {
  const window = dayPartWindow(sunriseMin, sunsetMin, RAHU_KAAL_INDEX[weekday], 8);
  return { name: 'Rahu Kaal', ...window, type: 'inauspicious' };
}

function computeYamaganda(weekday, sunriseMin, sunsetMin) {
  const window = dayPartWindow(sunriseMin, sunsetMin, YAMAGANDA_INDEX[weekday], 8);
  return { name: 'Yamaganda', ...window, type: 'inauspicious' };
}

function computeGulikaKaal(weekday, sunriseMin, sunsetMin) {
  const window = dayPartWindow(sunriseMin, sunsetMin, GULIKA_KAAL_INDEX[weekday], 8);
  return { name: 'Gulika Kaal', ...window, type: 'inauspicious' };
}

function computeAbhijitMuhurta(weekday, sunriseMin, sunsetMin) {
  const window = dayPartWindow(sunriseMin, sunsetMin, 8, 15);
  const result = { name: 'Abhijit Muhurta', ...window, type: 'auspicious' };
  if (weekday === 'wednesday') {
    result.note = 'Traditionally considered weak/void on Wednesdays';
  }
  return result;
}

function computeBrahmaMuhurta(sunriseMin) {
  return { name: 'Brahma Muhurta', start: sunriseMin - 96, end: sunriseMin - 48, type: 'auspicious' };
}

const CHOGHADIYA_NATURE = {
  Amrit: 'auspicious', Shubh: 'auspicious', Labh: 'auspicious',
  Chal: 'neutral',
  Udveg: 'inauspicious', Rog: 'inauspicious', Kaal: 'inauspicious',
};
const CHOGHADIYA_LORD = {
  Amrit: 'Moon', Shubh: 'Jupiter', Labh: 'Mercury', Chal: 'Venus',
  Udveg: 'Sun', Rog: 'Mars', Kaal: 'Saturn',
};
const CHOGHADIYA_CYCLE = ['Udveg', 'Chal', 'Labh', 'Amrit', 'Kaal', 'Shubh', 'Rog'];
const DAY_START_CHOGHADIYA = {
  sunday: 'Udveg', monday: 'Amrit', tuesday: 'Rog', wednesday: 'Labh',
  thursday: 'Shubh', friday: 'Chal', saturday: 'Kaal',
};

function choghadiyaSequence(startName, count) {
  const startIndex = CHOGHADIYA_CYCLE.indexOf(startName);
  return Array.from({ length: count }, (_, i) => CHOGHADIYA_CYCLE[(startIndex + i) % 7]);
}

function toChoghadiyaSlot(name, window) {
  return { name, ...window, nature: CHOGHADIYA_NATURE[name], lord: CHOGHADIYA_LORD[name] };
}

function computeChoghadiya(weekday, sunriseMin, sunsetMin, nextSunriseMin) {
  const dayNames = choghadiyaSequence(DAY_START_CHOGHADIYA[weekday], 8);
  const day = dayNames.map((name, i) => toChoghadiyaSlot(name, dayPartWindow(sunriseMin, sunsetMin, i + 1, 8)));

  const nightStartIndex = (CHOGHADIYA_CYCLE.indexOf(dayNames[7]) + 1) % 7;
  const nightNames = choghadiyaSequence(CHOGHADIYA_CYCLE[nightStartIndex], 8);
  const night = nightNames.map((name, i) => toChoghadiyaSlot(name, dayPartWindow(sunsetMin, nextSunriseMin, i + 1, 8)));

  return { day, night };
}

const VISHTI_KARANA_NAME = 'Vishti';

async function karanaIndexAt(dateStr, timeStr, latitude, longitude, timezone) {
  const swe = await getSwe();
  const jd = await computeJulianDay(dateStr, timeStr, latitude, longitude, timezone);
  const sunLongitude = await computePlanetLongitude(jd, swe.SE_SUN);
  const moonLongitude = await computePlanetLongitude(jd, swe.SE_MOON);
  return computePanchang({ sunLongitude, moonLongitude }).karana.karanaHalfIndex;
}

// Core boundary-stitching logic, independent of how a karana index at a given
// minute-of-day is looked up. `karanaIndexLookup` is `(minuteOfDay) => Promise<number>`.
// Exported (with a leading underscore) purely so tests can inject a synthetic
// lookup and verify the stitching logic without a real ephemeris call.
async function _computeBhadraWindowsFromKaranaLookup(karanaIndexLookup, sunriseMin, sunsetMin) {
  const startIndex = await karanaIndexLookup(sunriseMin);
  const endIndex = await karanaIndexLookup(sunsetMin);

  const boundaries = [sunriseMin];
  for (let boundary = startIndex + 1; boundary <= endIndex; boundary++) {
    let lo = boundaries[boundaries.length - 1];
    let hi = sunsetMin;
    while (hi - lo > 0.01) {
      const mid = (lo + hi) / 2;
      const index = await karanaIndexLookup(mid);
      if (index < boundary) lo = mid; else hi = mid;
    }
    boundaries.push(hi);
  }
  boundaries.push(sunsetMin);

  const windows = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const segmentIndex = startIndex + i;
    if (karanaNameForIndex(segmentIndex) === VISHTI_KARANA_NAME) {
      windows.push({ name: 'Bhadra (Vishti Karana)', start: boundaries[i], end: boundaries[i + 1], type: 'inauspicious' });
    }
  }
  return windows;
}

async function computeBhadraWindows(dateStr, sunriseMin, sunsetMin, latitude, longitude, timezone) {
  const lookup = (minuteOfDay) => karanaIndexAt(dateStr, formatMinutes(minuteOfDay), latitude, longitude, timezone);
  return _computeBhadraWindowsFromKaranaLookup(lookup, sunriseMin, sunsetMin);
}

function formatWindow(window) {
  const { start, end, ...rest } = window;
  return { ...rest, start: formatMinutes(start), end: formatMinutes(end) };
}

function formatChoghadiyaSlot(slot) {
  const { start, end, ...rest } = slot;
  return { ...rest, start: formatMinutes(start), end: formatMinutes(end) };
}

function formatDuration(totalMinutes) {
  const rounded = Math.round(totalMinutes);
  return `${Math.floor(rounded / 60)}h ${rounded % 60}m`;
}

async function computeDailyPeriods(dateStr, latitude, longitude, timezone) {
  const zone = timezone || tzlookup(latitude, longitude);
  const { sunrise, sunset } = await computeSunriseSunset(dateStr, latitude, longitude, timezone);
  const nextDateStr = DateTime.fromISO(dateStr, { zone }).plus({ days: 1 }).toISODate();
  const { sunrise: nextSunrise } = await computeSunriseSunset(nextDateStr, latitude, longitude, timezone);

  const sunriseMin = parseHHmm(sunrise);
  const sunsetMin = parseHHmm(sunset);
  const nextSunriseMin = parseHHmm(nextSunrise) + 1440;

  const weekday = weekdayFromDate(dateStr, latitude, longitude, timezone);

  const bhadraWindows = await computeBhadraWindows(dateStr, sunriseMin, sunsetMin, latitude, longitude, timezone);

  const inauspicious = [
    computeRahuKaal(weekday, sunriseMin, sunsetMin),
    computeYamaganda(weekday, sunriseMin, sunsetMin),
    computeGulikaKaal(weekday, sunriseMin, sunsetMin),
    ...bhadraWindows,
  ].map(formatWindow);

  const auspicious = [
    computeAbhijitMuhurta(weekday, sunriseMin, sunsetMin),
    computeBrahmaMuhurta(sunriseMin),
  ].map(formatWindow);

  const { day, night } = computeChoghadiya(weekday, sunriseMin, sunsetMin, nextSunriseMin);

  return {
    date: dateStr,
    weekday,
    sunrise,
    sunset,
    dayDuration: formatDuration(sunsetMin - sunriseMin),
    inauspicious,
    auspicious,
    choghadiya: {
      day: day.map(formatChoghadiyaSlot),
      night: night.map(formatChoghadiyaSlot),
    },
  };
}

export {
  parseHHmm, formatMinutes, weekdayFromDate, dayPartWindow,
  computeRahuKaal, computeYamaganda, computeGulikaKaal,
  computeAbhijitMuhurta, computeBrahmaMuhurta, computeChoghadiya,
  computeBhadraWindows, _computeBhadraWindowsFromKaranaLookup,
  computeDailyPeriods,
};
