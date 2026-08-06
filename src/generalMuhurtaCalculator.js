import { DateTime } from 'luxon';
import tzlookup from 'tz-lookup';
import { computeSunriseSunset } from './sunTimesService.js';
import { dayPartWindow, parseHHmm, weekdayFromDate } from './muhurtaCalculator.js';
import { getSwe, computeJulianDay, computeAscendantLongitude, computePlanetLongitude } from './swissephService.js';
import { rashiFromLongitude } from './kundaliCalculator.js';
import { RASHI_LORDS, classifyDignity } from './matchData.js';

const HORA_LORD_SEQUENCE = ['SATURN', 'JUPITER', 'MARS', 'SUN', 'VENUS', 'MERCURY', 'MOON'];

const WEEKDAY_STARTING_HORA_LORD = {
  sunday: 'SUN', monday: 'MOON', tuesday: 'MARS', wednesday: 'MERCURY',
  thursday: 'JUPITER', friday: 'VENUS', saturday: 'SATURN',
};

const FAVORABLE_HORA_LORDS = ['MOON', 'MERCURY', 'JUPITER', 'VENUS'];

function horaLordForSegment(weekday, segmentIndex) {
  const startIndex = HORA_LORD_SEQUENCE.indexOf(WEEKDAY_STARTING_HORA_LORD[weekday]);
  return HORA_LORD_SEQUENCE[(startIndex + segmentIndex) % 7];
}

function scoreHoraSegment({ horaLord, lagnaLordDignity }) {
  const checks = [
    {
      name: 'Hora',
      pass: FAVORABLE_HORA_LORDS.includes(horaLord),
      passReason: `${horaLord} hora is favorable`,
      failReason: `${horaLord} hora is unfavorable`,
    },
    {
      name: 'Lagna Lord Strength',
      pass: lagnaLordDignity !== 'debilitated',
      passReason: `Lagna lord is ${lagnaLordDignity}`,
      failReason: 'Lagna lord is debilitated',
    },
  ];
  const passed = checks.filter((c) => c.pass);
  return {
    score: Math.round((passed.length / checks.length) * 100),
    reasons: passed.map((c) => c.passReason),
    warnings: checks.filter((c) => !c.pass).map((c) => c.failReason),
    checks: checks.map((c) => ({ name: c.name, pass: c.pass, reason: c.pass ? c.passReason : c.failReason })),
  };
}

// Converts a minute-of-day value (which may exceed 1440 for a night segment
// that spills past midnight into the next calendar day, matching the same
// minute-of-day coordinate space muhurtaCalculator.js's computeDailyPeriods
// already uses for night Choghadiya) into a { dateStr, timeStr } pair.
function minuteOfDayToDateTime(baseDateStr, minuteOfDay, zone) {
  const dayOffset = Math.floor(minuteOfDay / 1440);
  const minuteWithinDay = ((minuteOfDay % 1440) + 1440) % 1440;
  const hour = Math.floor(minuteWithinDay / 60);
  const minute = Math.round(minuteWithinDay % 60);
  const date = DateTime.fromISO(baseDateStr, { zone }).plus({ days: dayOffset });
  return { dateStr: date.toISODate(), timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

function formatIso(dateStr, timeStr) {
  return `${dateStr}T${timeStr}`;
}

const SWE_KEY_FOR_PLANET = {
  SUN: 'SE_SUN', MOON: 'SE_MOON', MARS: 'SE_MARS', MERCURY: 'SE_MERCURY',
  JUPITER: 'SE_JUPITER', VENUS: 'SE_VENUS', SATURN: 'SE_SATURN',
};

async function scoreSegmentAt(dateStr, timeStr, latitude, longitude, timezone, horaLord) {
  const swe = await getSwe();
  const jd = await computeJulianDay(dateStr, timeStr, latitude, longitude, timezone);
  const ascendantLongitude = await computeAscendantLongitude(jd, latitude, longitude);
  const { rashiIndex } = rashiFromLongitude(ascendantLongitude);
  const lagnaLord = RASHI_LORDS[rashiIndex];
  const lagnaLordLongitude = await computePlanetLongitude(jd, swe[SWE_KEY_FOR_PLANET[lagnaLord]]);
  const { rashiIndex: lagnaLordRashiIndex } = rashiFromLongitude(lagnaLordLongitude);
  const lagnaLordDignity = classifyDignity(lagnaLord, lagnaLordRashiIndex);
  return { ...scoreHoraSegment({ horaLord, lagnaLordDignity }), lagnaLord, lagnaLordDignity };
}

const CONCURRENCY = 5;

async function computeDaySegments(dateStr, latitude, longitude, timezone) {
  const zone = timezone || tzlookup(latitude, longitude);
  const { sunrise, sunset } = await computeSunriseSunset(dateStr, latitude, longitude, timezone);
  const nextDateStr = DateTime.fromISO(dateStr, { zone }).plus({ days: 1 }).toISODate();
  const { sunrise: nextSunrise } = await computeSunriseSunset(nextDateStr, latitude, longitude, timezone);

  const sunriseMin = parseHHmm(sunrise);
  const sunsetMin = parseHHmm(sunset);
  const todayMidnight = DateTime.fromISO(dateStr, { zone });
  const dayLengthMin = todayMidnight.plus({ days: 1 }).diff(todayMidnight, 'minutes').minutes;
  const nextSunriseMin = parseHHmm(nextSunrise) + dayLengthMin;

  const weekday = weekdayFromDate(dateStr, latitude, longitude, timezone);

  const dayWindows = Array.from({ length: 12 }, (_, i) => dayPartWindow(sunriseMin, sunsetMin, i + 1, 12));
  const nightWindows = Array.from({ length: 12 }, (_, i) => dayPartWindow(sunsetMin, nextSunriseMin, i + 1, 12));
  const allWindows = [...dayWindows, ...nightWindows];

  const segments = [];
  for (let i = 0; i < allWindows.length; i += CONCURRENCY) {
    const batch = allWindows.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(async (window, batchOffset) => {
      const segmentIndex = i + batchOffset;
      const horaLord = horaLordForSegment(weekday, segmentIndex);
      const { dateStr: startDateStr, timeStr: startTimeStr } = minuteOfDayToDateTime(dateStr, window.start, zone);
      const scored = await scoreSegmentAt(startDateStr, startTimeStr, latitude, longitude, timezone, horaLord);
      const { dateStr: endDateStr, timeStr: endTimeStr } = minuteOfDayToDateTime(dateStr, window.end, zone);
      return {
        start: formatIso(startDateStr, startTimeStr),
        end: formatIso(endDateStr, endTimeStr),
        planetLord: horaLord,
        score: scored.score,
        checks: scored.checks,
        lagnaLordDignity: scored.lagnaLordDignity,
      };
    }));
    segments.push(...batchResults);
  }
  return segments;
}

// Multiple segments frequently tie on raw score (scoreHoraSegment treats
// "own-sign", "exalted" and "neutral" lagna-lord dignity as an equal pass —
// only "debilitated" fails). When picking a single best window for the day,
// break ties by preferring the strongest lagna-lord placement, so e.g. an
// exalted lagna lord outranks a merely-neutral one at the same score.
const DIGNITY_RANK = { exalted: 3, 'own-sign': 2, neutral: 1, debilitated: 0 };

function pickBestWindow(segments) {
  return segments.reduce((best, segment) => {
    if (segment.score > best.score) return segment;
    if (segment.score === best.score && DIGNITY_RANK[segment.lagnaLordDignity] > DIGNITY_RANK[best.lagnaLordDignity]) {
      return segment;
    }
    return best;
  }, segments[0]);
}

async function computeDailyGeneralScore(dateStr, latitude, longitude, timezone) {
  const horaSegments = await computeDaySegments(dateStr, latitude, longitude, timezone);
  const bestWindow = pickBestWindow(horaSegments);
  return {
    date: dateStr,
    score: bestWindow.score,
    reasons: bestWindow.checks.filter((c) => c.pass).map((c) => `Best window: ${c.reason}`),
    warnings: bestWindow.checks.filter((c) => !c.pass).map((c) => `Best window: ${c.reason}`),
    bestWindow,
    horaSegments,
  };
}

async function computeGeneralMuhurta(fromDateStr, toDateStr, latitude, longitude, timezone) {
  const zone = timezone || tzlookup(latitude, longitude);
  const totalDays = DateTime.fromISO(toDateStr, { zone }).diff(DateTime.fromISO(fromDateStr, { zone }), 'days').days + 1;
  const dates = Array.from({ length: totalDays }, (_, i) =>
    DateTime.fromISO(fromDateStr, { zone }).plus({ days: i }).toISODate());

  const results = [];
  for (const date of dates) {
    results.push(await computeDailyGeneralScore(date, latitude, longitude, timezone));
  }
  results.sort((a, b) => b.score - a.score);

  return {
    task: 'general',
    dateRange: { from: fromDateStr, to: toDateStr },
    windows: results,
  };
}

export {
  HORA_LORD_SEQUENCE, WEEKDAY_STARTING_HORA_LORD, FAVORABLE_HORA_LORDS,
  horaLordForSegment, scoreHoraSegment, computeGeneralMuhurta,
};
