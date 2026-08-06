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

const TOTAL_YEARS = 120;
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

export { computeVimshottariDasha, computeTribhagiDasha, DASHA_SEQUENCE };
