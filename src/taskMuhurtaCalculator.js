import { DateTime } from 'luxon';
import tzlookup from 'tz-lookup';
import { computeSunriseSunset } from './sunTimesService.js';
import { getSwe, computeJulianDay, computePlanetLongitude, computePlanetSpeed } from './swissephService.js';
import { computePanchang } from './panchangCalculator.js';
import { nakshatraFromLongitude } from './kundaliCalculator.js';
import { weekdayFromDate } from './muhurtaCalculator.js';

const RIKTA_TITHI_INDICES = [3, 8, 13]; // 0-based tithiInPaksha (tithiIndex % 15): Chaturthi, Navami, Chaturdashi
const AVOID_YOGA_NAMES = ['Vyatipata', 'Vaidhriti'];

function angularSeparation(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

const COMBUSTION_ORBS = {
  VENUS: { direct: 10, retrograde: 8 },
  JUPITER: { direct: 11, retrograde: 11 },
};

function isCombust(planetLongitude, sunLongitude, speed, planet) {
  const orbs = COMBUSTION_ORBS[planet];
  if (!orbs) {
    throw new Error(`isCombust: unsupported planet "${planet}"`);
  }
  const orb = speed < 0 ? orbs.retrograde : orbs.direct;
  return angularSeparation(planetLongitude, sunLongitude) < orb;
}

const TASK_RULES = {
  marriage: {
    nakshatras: ['Rohini', 'Mrigashira', 'Magha', 'Uttara Phalguni', 'Hasta', 'Swati', 'Anuradha', 'Mula', 'Uttara Ashadha', 'Uttara Bhadrapada', 'Revati'],
    padaExclusions: { Magha: [1], Mula: [1], Revati: [4] },
    weekdays: ['monday', 'wednesday', 'thursday', 'friday'],
  },
  business: {
    nakshatras: ['Ashwini', 'Rohini', 'Pushya', 'Hasta', 'Chitra'],
    padaExclusions: {},
    weekdays: ['monday', 'wednesday', 'thursday', 'friday', 'saturday'],
  },
  travel: {
    nakshatras: ['Ashwini', 'Mrigashira', 'Pushya', 'Hasta', 'Anuradha', 'Shravana', 'Revati'],
    padaExclusions: {},
    weekdays: ['monday', 'wednesday', 'thursday', 'friday'],
  },
  'griha-pravesh': {
    nakshatras: ['Rohini', 'Mrigashira', 'Pushya', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Anuradha', 'Uttara Ashadha', 'Uttara Bhadrapada', 'Revati'],
    padaExclusions: {},
    weekdays: ['monday', 'wednesday', 'thursday', 'friday'],
    requiresCombustionCheck: true,
  },
};

function scoreDay({ tithi, yoga, karana, nakshatra, weekday, venusCombust, jupiterCombust }, taskRules) {
  const checks = [
    {
      name: 'Tithi',
      pass: !RIKTA_TITHI_INDICES.includes(tithi.tithiIndex % 15),
      passReason: `${tithi.tithiName} is not a Rikta tithi`,
      failReason: `${tithi.tithiName} is a Rikta tithi`,
    },
    {
      name: 'Nakshatra',
      pass: taskRules.nakshatras.includes(nakshatra.nakshatraName)
        && !(taskRules.padaExclusions[nakshatra.nakshatraName] || []).includes(nakshatra.pada),
      passReason: `${nakshatra.nakshatraName} pada ${nakshatra.pada} favours this task`,
      failReason: `${nakshatra.nakshatraName} pada ${nakshatra.pada} does not favour this task`,
    },
    {
      name: 'Yoga',
      pass: !AVOID_YOGA_NAMES.includes(yoga.yogaName),
      passReason: `${yoga.yogaName} yoga is not inauspicious`,
      failReason: `${yoga.yogaName} yoga should be avoided`,
    },
    {
      name: 'Karana',
      pass: karana.karanaName !== 'Vishti',
      passReason: 'No Vishti karana active',
      failReason: 'Vishti karana (Bhadra) is active',
    },
    {
      name: 'Vara',
      pass: taskRules.weekdays.includes(weekday),
      passReason: `${weekday} is a favourable weekday`,
      failReason: `${weekday} is not an ideal weekday`,
    },
  ];

  if (taskRules.requiresCombustionCheck) {
    checks.push({
      name: 'Combustion',
      pass: !venusCombust && !jupiterCombust,
      passReason: 'Neither Venus nor Jupiter is combust',
      failReason: `${venusCombust ? 'Venus' : ''}${venusCombust && jupiterCombust ? ' and ' : ''}${jupiterCombust ? 'Jupiter' : ''} combust (Tara Asta) — avoid for Griha Pravesh`,
    });
  }

  const passed = checks.filter((c) => c.pass);
  const failed = checks.filter((c) => !c.pass);

  return {
    score: Math.round((passed.length / checks.length) * 100),
    reasons: passed.map((c) => c.passReason),
    warnings: failed.map((c) => c.failReason),
    checks: checks.map((c) => ({ name: c.name, pass: c.pass, reason: c.pass ? c.passReason : c.failReason })),
  };
}

async function snapshotPanchangaAtSunrise(dateStr, latitude, longitude, timezone) {
  const { sunrise } = await computeSunriseSunset(dateStr, latitude, longitude, timezone);
  const swe = await getSwe();
  const jd = await computeJulianDay(dateStr, sunrise, latitude, longitude, timezone);
  const sunLongitude = await computePlanetLongitude(jd, swe.SE_SUN);
  const moonLongitude = await computePlanetLongitude(jd, swe.SE_MOON);
  const venusLongitude = await computePlanetLongitude(jd, swe.SE_VENUS);
  const jupiterLongitude = await computePlanetLongitude(jd, swe.SE_JUPITER);
  const venusSpeed = await computePlanetSpeed(jd, swe.SE_VENUS);
  const jupiterSpeed = await computePlanetSpeed(jd, swe.SE_JUPITER);
  const { tithi, yoga, karana } = computePanchang({ sunLongitude, moonLongitude });
  const nakshatra = nakshatraFromLongitude(moonLongitude);
  const weekday = weekdayFromDate(dateStr, latitude, longitude, timezone);
  const venusCombust = isCombust(venusLongitude, sunLongitude, venusSpeed, 'VENUS');
  const jupiterCombust = isCombust(jupiterLongitude, sunLongitude, jupiterSpeed, 'JUPITER');
  return { tithi, yoga, karana, nakshatra, weekday, venusCombust, jupiterCombust };
}

async function computeDailyScore(dateStr, latitude, longitude, timezone, taskRules) {
  const snapshot = await snapshotPanchangaAtSunrise(dateStr, latitude, longitude, timezone);
  return { date: dateStr, ...scoreDay(snapshot, taskRules) };
}

const CONCURRENCY = 5;

async function computeTaskMuhurta(task, fromDateStr, toDateStr, latitude, longitude, timezone) {
  const taskRules = TASK_RULES[task];
  const zone = timezone || tzlookup(latitude, longitude);
  const totalDays = DateTime.fromISO(toDateStr, { zone }).diff(DateTime.fromISO(fromDateStr, { zone }), 'days').days + 1;
  const dates = Array.from({ length: totalDays }, (_, i) =>
    DateTime.fromISO(fromDateStr, { zone }).plus({ days: i }).toISODate());

  const results = [];
  for (let i = 0; i < dates.length; i += CONCURRENCY) {
    const batch = dates.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((d) => computeDailyScore(d, latitude, longitude, timezone, taskRules)),
    );
    results.push(...batchResults);
  }
  results.sort((a, b) => b.score - a.score);

  return {
    task,
    dateRange: { from: fromDateStr, to: toDateStr },
    windows: results.map((r) => ({
      start: `${r.date}T00:00`,
      end: DateTime.fromISO(r.date, { zone }).plus({ days: 1 }).toFormat("yyyy-MM-dd'T'HH:mm"),
      granularity: 'day',
      score: r.score,
      reasons: r.reasons,
      warnings: r.warnings,
      checks: r.checks,
    })),
  };
}

export { TASK_RULES, scoreDay, snapshotPanchangaAtSunrise, computeDailyScore, computeTaskMuhurta, angularSeparation, isCombust };
