const DASHA_SEQUENCE = [
  { lord: 'KETU', years: 7 },
  { lord: 'VENUS', years: 20 },
  { lord: 'SUN', years: 6 },
  { lord: 'MOON', years: 10 },
  { lord: 'MARS', years: 7 },
  { lord: 'RAHU', years: 18 },
  { lord: 'JUPITER', years: 16 },
  { lord: 'SATURN', years: 19 },
  { lord: 'MERCURY', years: 17 },
];

const YOGINI_SEQUENCE = [
  { name: 'MANGALA', lord: 'MOON', years: 1 },
  { name: 'PINGALA', lord: 'SUN', years: 2 },
  { name: 'DHANYA', lord: 'JUPITER', years: 3 },
  { name: 'BHRAMARI', lord: 'MARS', years: 4 },
  { name: 'BHADRIKA', lord: 'MERCURY', years: 5 },
  { name: 'ULKA', lord: 'SATURN', years: 6 },
  { name: 'SIDDHA', lord: 'VENUS', years: 7 },
  { name: 'SANKATA', lord: 'RAHU', years: 8 },
];

const TOTAL_YEARS = 120;
const YOGINI_TOTAL_YEARS = 36;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const NAKSHATRA_SPAN = 360 / 27;

// Sub-periods of any period follow the same sequence starting from the parent
// lord, each sized proportionally to its lord's mahadasha years. The top level
// is the same rule applied to the full 120-year cycle, so one recursive
// builder covers mahadasha -> antardasha -> pratyantardasha (depth 3).
function buildPeriods(startLordIndex, startMs, lengthMs, depth) {
  const periods = [];
  let cursor = startMs;
  for (let i = 0; i < 9; i += 1) {
    const lordIndex = (startLordIndex + i) % 9;
    const entry = DASHA_SEQUENCE[lordIndex];
    const periodLengthMs = (lengthMs * entry.years) / TOTAL_YEARS;
    const period = {
      lord: entry.lord,
      start: new Date(cursor).toISOString(),
      end: new Date(cursor + periodLengthMs).toISOString(),
    };
    if (depth > 1) {
      period.subPeriods = buildPeriods(lordIndex, cursor, periodLengthMs, depth - 1);
    }
    periods.push(period);
    cursor += periodLengthMs;
  }
  return periods;
}

function computeDashaCycle(moonLongitude, birthUtcMs, totalYears, depth) {
  const nakshatraIndex = Math.floor(moonLongitude / NAKSHATRA_SPAN) % 27;
  const fractionElapsed = (moonLongitude % NAKSHATRA_SPAN) / NAKSHATRA_SPAN;
  const firstLordIndex = nakshatraIndex % 9;
  const scale = totalYears / TOTAL_YEARS;
  const firstLordYears = DASHA_SEQUENCE[firstLordIndex].years * scale;
  const cycleStartMs = birthUtcMs - fractionElapsed * firstLordYears * YEAR_MS;

  return {
    balanceYears: (1 - fractionElapsed) * firstLordYears,
    mahadashas: buildPeriods(firstLordIndex, cycleStartMs, totalYears * YEAR_MS, depth),
  };
}

function computeVimshottariDasha(moonLongitude, birthUtcMs) {
  return computeDashaCycle(moonLongitude, birthUtcMs, TOTAL_YEARS, 3);
}

const TRIBHAGI_TOTAL_YEARS = TOTAL_YEARS / 3;

function computeTribhagiDasha(moonLongitude, birthUtcMs) {
  return computeDashaCycle(moonLongitude, birthUtcMs, TRIBHAGI_TOTAL_YEARS, 3);
}

function buildYoginiPeriods(startIndex, startMs, lengthMs, depth) {
  const periods = [];
  let cursor = startMs;
  for (let i = 0; i < 8; i += 1) {
    const yoginiIndex = (startIndex + i) % 8;
    const entry = YOGINI_SEQUENCE[yoginiIndex];
    const periodLengthMs = (lengthMs * entry.years) / YOGINI_TOTAL_YEARS;
    const period = {
      name: entry.name,
      lord: entry.lord,
      start: new Date(cursor).toISOString(),
      end: new Date(cursor + periodLengthMs).toISOString(),
    };
    if (depth > 1) {
      period.subPeriods = buildYoginiPeriods(yoginiIndex, cursor, periodLengthMs, depth - 1);
    }
    periods.push(period);
    cursor += periodLengthMs;
  }
  return periods;
}

function computeYoginiDasha(moonLongitude, birthUtcMs) {
  const nakshatraIndex = Math.floor(moonLongitude / NAKSHATRA_SPAN) % 27;
  const nakshatraNumber = nakshatraIndex + 1;
  const fractionElapsed = (moonLongitude % NAKSHATRA_SPAN) / NAKSHATRA_SPAN;
  const remainder = (nakshatraNumber + 3) % 8;
  const firstYoginiIndex = (remainder === 0 ? 8 : remainder) - 1;
  const firstYoginiYears = YOGINI_SEQUENCE[firstYoginiIndex].years;
  const cycleStartMs = birthUtcMs - fractionElapsed * firstYoginiYears * YEAR_MS;

  return {
    balanceYears: (1 - fractionElapsed) * firstYoginiYears,
    mahadashas: buildYoginiPeriods(firstYoginiIndex, cycleStartMs, YOGINI_TOTAL_YEARS * YEAR_MS, 2),
  };
}

export { computeVimshottariDasha, computeTribhagiDasha, computeYoginiDasha, DASHA_SEQUENCE };
