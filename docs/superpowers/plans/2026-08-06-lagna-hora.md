# Lagna/Hora (General Muhurta) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `general` as a 5th task type to `GET /api/muhurta/task-search`, scoring each day's 24 Hora (planetary hour) segments for auspiciousness using Hora-lord favorability and Lagna-lord dignity.

**Architecture:** New dedicated module `src/generalMuhurtaCalculator.js` (does not extend `taskMuhurtaCalculator.js` — this task type's nested per-day/per-segment response shape differs structurally from the other 4 task types' flat day-list). New dignity tables added to `src/matchData.js`, generalizing the existing Mars-only own-sign/exaltation pattern (used for Manglik dosha) to all 7 classical grahas. Reuses `dayPartWindow`/`parseHHmm`/`weekdayFromDate` from `src/muhurtaCalculator.js` and `computeSunriseSunset`/`computeJulianDay`/`computeAscendantLongitude`/`computePlanetLongitude` from existing services, unchanged.

**Tech Stack:** Node.js, Luxon, Vitest, Supertest — no new dependencies.

## Global Constraints

- Hora lord sequence (fixed Chaldean order, cycles continuously across all 24 segments per day — day segments 0-11 then night segments 12-23 continue the SAME cycle, do not restart at sunset): `['SATURN', 'JUPITER', 'MARS', 'SUN', 'VENUS', 'MERCURY', 'MOON']`.
- Weekday starting Hora lord: `{ sunday: 'SUN', monday: 'MOON', tuesday: 'MARS', wednesday: 'MERCURY', thursday: 'JUPITER', friday: 'VENUS', saturday: 'SATURN' }`.
- Favorable Hora lords: `['MOON', 'MERCURY', 'JUPITER', 'VENUS']`. Unfavorable: `['SUN', 'MARS', 'SATURN']`.
- Rashi indices are `0=Mesha(Aries)..11=Meena(Pisces)`, matching `RASHI_NAMES` in `astro-data.js` and the existing `RASHI_LORDS` array in `matchData.js` — verified: `RASHI_LORDS = ['MARS', 'VENUS', 'MERCURY', 'MOON', 'SUN', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN', 'SATURN', 'JUPITER']`.
- Dignity tables (verified consistent with the existing `MARS_OWN_RASHIS = [0, 7]` and `MARS_EXALTED_RASHI = 9` in `matchData.js` — both must agree with the new tables' Mars entries):
  ```js
  const PLANET_OWN_RASHIS = {
    SUN: [4], MOON: [3], MARS: [0, 7], MERCURY: [2, 5],
    JUPITER: [8, 11], VENUS: [1, 6], SATURN: [9, 10],
  };
  const PLANET_EXALTATION_RASHI = {
    SUN: 0, MOON: 1, MARS: 9, MERCURY: 5, JUPITER: 3, VENUS: 11, SATURN: 6,
  };
  const PLANET_DEBILITATION_RASHI = {
    SUN: 6, MOON: 7, MARS: 3, MERCURY: 11, JUPITER: 9, VENUS: 5, SATURN: 0,
  };
  ```
- Dignity classification: exalted or own-sign → **pass** (strong); debilitated → **fail** (weak); neutral → **pass** (average — only debilitation is a specific weakness). No combustion folded into this check.
- A day's reported score is its best-scoring Hora segment's score. `horaSegments` stays chronological within a day; `bestWindow` is the highest-scoring segment, ties broken by earliest start time.
- Verified reference (Kathmandu 27.7172/85.3240, 2026-08-01, a Saturday — computed directly against `swisseph-wasm` before writing this plan, using `houses_ex(jd, SEFLG_SIDEREAL, lat, lon, 'P')` for the ascendant, matching this repo's existing ascendant computation exactly):
  - **Segment index 11** (day segment, ~17:47-18:53 local): Hora lord VENUS (favorable), ascendant rashi 8 (Dhanu/Sagittarius), lagna lord JUPITER, Jupiter's own longitude in rashi 3 (Karka/Cancer) = **exalted** (`PLANET_EXALTATION_RASHI.JUPITER === 3`). Both checks pass → **score 100**.
  - **Segment index 7** (day segment, ~13:24-14:30 local): Hora lord SATURN (unfavorable), ascendant rashi 6 (Tula/Libra), lagna lord VENUS, Venus's own longitude in rashi 5 (Kanya/Virgo) = **debilitated** (`PLANET_DEBILITATION_RASHI.VENUS === 5`). Both checks fail → **score 0**.
  - Day-half segment index `i` (0-11) start time: `sunriseMin + i * (sunsetMin - sunriseMin) / 12`, with `sunriseMin = 5*60+44` and `sunsetMin = 18*60+53` for this date/location (from prior session's verified sunrise/sunset).

---

### Task 1: Dignity tables and classifier in `matchData.js`

**Files:**
- Modify: `src/matchData.js`
- Test: `test/matchData.test.js` (check if this file exists first; if not, create it following the style of other pure-data test files in this repo, e.g. `test/taskMuhurtaCalculator.test.js`'s plain `describe`/`it` structure)

**Interfaces:**
- Produces: `PLANET_OWN_RASHIS`, `PLANET_EXALTATION_RASHI`, `PLANET_DEBILITATION_RASHI` (exported constants, exact shape in Global Constraints), and `classifyDignity(planet, rashiIndex) => 'exalted' | 'own-sign' | 'debilitated' | 'neutral'`, exported. Consumed by Task 3's `generalMuhurtaCalculator.js`.

- [ ] **Step 1: Write the failing tests**

Check whether `test/matchData.test.js` already exists (`ls test/matchData.test.js`). If it exists, read it fully first and append in its existing style. If it doesn't exist, create it with:

```js
import { describe, it, expect } from 'vitest';
import {
  RASHI_LORDS, MARS_OWN_RASHIS, MARS_EXALTED_RASHI,
  PLANET_OWN_RASHIS, PLANET_EXALTATION_RASHI, PLANET_DEBILITATION_RASHI,
  classifyDignity,
} from '../src/matchData.js';

describe('planet dignity tables', () => {
  it('the new Mars entries agree with the existing Manglik-dosha Mars tables', () => {
    expect(PLANET_OWN_RASHIS.MARS).toEqual(MARS_OWN_RASHIS);
    expect(PLANET_EXALTATION_RASHI.MARS).toBe(MARS_EXALTED_RASHI);
  });

  it('every rashi lord in RASHI_LORDS has an entry in all three dignity tables', () => {
    const uniqueLords = [...new Set(RASHI_LORDS)];
    for (const lord of uniqueLords) {
      expect(PLANET_OWN_RASHIS[lord]).toBeDefined();
      expect(PLANET_EXALTATION_RASHI[lord]).toBeDefined();
      expect(PLANET_DEBILITATION_RASHI[lord]).toBeDefined();
    }
  });
});

describe('classifyDignity', () => {
  it('classifies Jupiter exalted in Karka (rashi 3)', () => {
    expect(classifyDignity('JUPITER', 3)).toBe('exalted');
  });

  it('classifies Jupiter debilitated in Makara (rashi 9)', () => {
    expect(classifyDignity('JUPITER', 9)).toBe('debilitated');
  });

  it('classifies Jupiter own-sign in Dhanu (rashi 8) and Meena (rashi 11)', () => {
    expect(classifyDignity('JUPITER', 8)).toBe('own-sign');
    expect(classifyDignity('JUPITER', 11)).toBe('own-sign');
  });

  it('classifies Jupiter neutral elsewhere (e.g. rashi 0)', () => {
    expect(classifyDignity('JUPITER', 0)).toBe('neutral');
  });

  it('classifies Venus debilitated in Kanya (rashi 5)', () => {
    expect(classifyDignity('VENUS', 5)).toBe('debilitated');
  });

  it('classifies Venus exalted in Meena (rashi 11)', () => {
    expect(classifyDignity('VENUS', 11)).toBe('exalted');
  });

  it('classifies Sun exalted in Mesha (rashi 0) and debilitated in Tula (rashi 6)', () => {
    expect(classifyDignity('SUN', 0)).toBe('exalted');
    expect(classifyDignity('SUN', 6)).toBe('debilitated');
  });

  it('classifies Saturn own-sign in Makara (rashi 9) and Kumbha (rashi 10)', () => {
    expect(classifyDignity('SATURN', 9)).toBe('own-sign');
    expect(classifyDignity('SATURN', 10)).toBe('own-sign');
  });

  it('classifies Mercury own-sign in Mithuna (rashi 2) and Kanya (rashi 5)', () => {
    expect(classifyDignity('MERCURY', 2)).toBe('own-sign');
    expect(classifyDignity('MERCURY', 5)).toBe('own-sign');
  });

  it('classifies Moon own-sign in Karka (rashi 3) and exalted in Vrishabha (rashi 1)', () => {
    expect(classifyDignity('MOON', 3)).toBe('own-sign');
    expect(classifyDignity('MOON', 1)).toBe('exalted');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/matchData.test.js`
Expected: FAIL — `PLANET_OWN_RASHIS`, `PLANET_EXALTATION_RASHI`, `PLANET_DEBILITATION_RASHI`, `classifyDignity` are not exported from `../src/matchData.js` yet.

- [ ] **Step 3: Implement in `src/matchData.js`**

Add after the existing `MANGAL_DOSHA_HOUSES`/`MARS_OWN_RASHIS`/`MARS_EXALTED_RASHI` block:

```js
// Own-sign, exaltation, and debilitation rashis for all 7 classical grahas
// (Rahu/Ketu own no rashi classically, so they have no entries here).
// Rashi indices are 0=Mesha..11=Meena, matching RASHI_LORDS above. The Mars
// entries intentionally duplicate MARS_OWN_RASHIS/MARS_EXALTED_RASHI above
// (used for Manglik dosha cancellation) -- verified equal in tests so the
// two independently-authored tables can never silently disagree.
const PLANET_OWN_RASHIS = {
  SUN: [4], MOON: [3], MARS: [0, 7], MERCURY: [2, 5],
  JUPITER: [8, 11], VENUS: [1, 6], SATURN: [9, 10],
};
const PLANET_EXALTATION_RASHI = {
  SUN: 0, MOON: 1, MARS: 9, MERCURY: 5, JUPITER: 3, VENUS: 11, SATURN: 6,
};
const PLANET_DEBILITATION_RASHI = {
  SUN: 6, MOON: 7, MARS: 3, MERCURY: 11, JUPITER: 9, VENUS: 5, SATURN: 0,
};

function classifyDignity(planet, rashiIndex) {
  if (rashiIndex === PLANET_EXALTATION_RASHI[planet]) return 'exalted';
  if (PLANET_OWN_RASHIS[planet].includes(rashiIndex)) return 'own-sign';
  if (rashiIndex === PLANET_DEBILITATION_RASHI[planet]) return 'debilitated';
  return 'neutral';
}
```

Update the file's final `export` statement to include `PLANET_OWN_RASHIS, PLANET_EXALTATION_RASHI, PLANET_DEBILITATION_RASHI, classifyDignity` alongside the existing exports.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/matchData.test.js`
Expected: PASS (all new tests)

- [ ] **Step 5: Run the full existing matchmaking test suite to confirm no regression**

Run: `npx vitest run test/matchData.test.js test/kundaliMatch.test.js` (check `ls test/*match*` first for the exact existing test file name(s) that import from `matchData.js`, and include all of them in this command)
Expected: PASS, unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/matchData.js test/matchData.test.js
git commit -m "feat: add planet dignity tables (own-sign/exaltation/debilitation) for Lagna Lord Strength"
```

---

### Task 2: Hora lord sequencing and pure scoring in `generalMuhurtaCalculator.js`

**Files:**
- Create: `src/generalMuhurtaCalculator.js`
- Test: `test/generalMuhurtaCalculator.test.js`

**Interfaces:**
- Produces: `HORA_LORD_SEQUENCE`, `WEEKDAY_STARTING_HORA_LORD`, `FAVORABLE_HORA_LORDS` (exported constants); `horaLordForSegment(weekday, segmentIndex) => string` (0-indexed, 0-23, returns one of the 7 planet names); `scoreHoraSegment({ horaLord, lagnaLordDignity }) => { score, reasons, warnings, checks }` (pure, no I/O). Consumed by Task 3 in the same file.
- Consumes: nothing new — pure logic only, no I/O, no imports beyond what's needed for the constants themselves.

- [ ] **Step 1: Write the failing tests**

Create `test/generalMuhurtaCalculator.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { HORA_LORD_SEQUENCE, WEEKDAY_STARTING_HORA_LORD, horaLordForSegment, scoreHoraSegment } from '../src/generalMuhurtaCalculator.js';

describe('horaLordForSegment', () => {
  it('segment 0 on each weekday matches that weekday\'s starting lord', () => {
    for (const [weekday, expectedLord] of Object.entries(WEEKDAY_STARTING_HORA_LORD)) {
      expect(horaLordForSegment(weekday, 0)).toBe(expectedLord);
    }
  });

  it('cycles through all 7 lords in HORA_LORD_SEQUENCE order starting from the weekday lord', () => {
    // Saturday starts at SATURN, which is HORA_LORD_SEQUENCE[0].
    expect(horaLordForSegment('saturday', 0)).toBe('SATURN');
    expect(horaLordForSegment('saturday', 1)).toBe('JUPITER');
    expect(horaLordForSegment('saturday', 2)).toBe('MARS');
    expect(horaLordForSegment('saturday', 3)).toBe('SUN');
    expect(horaLordForSegment('saturday', 4)).toBe('VENUS');
    expect(horaLordForSegment('saturday', 5)).toBe('MERCURY');
    expect(horaLordForSegment('saturday', 6)).toBe('MOON');
  });

  it('wraps the 7-cycle correctly across segment 7 and continues uninterrupted into the night half (segments 12-23)', () => {
    // Saturday: segment 7 = HORA_LORD_SEQUENCE[7 % 7] = HORA_LORD_SEQUENCE[0] = SATURN again.
    expect(horaLordForSegment('saturday', 7)).toBe('SATURN');
    // Segment 11 (last day segment): 11 % 7 = 4 -> HORA_LORD_SEQUENCE[4] = VENUS.
    expect(horaLordForSegment('saturday', 11)).toBe('VENUS');
    // Segment 12 (first night segment) continues the SAME cycle, does not restart: 12 % 7 = 5 -> MERCURY.
    expect(horaLordForSegment('saturday', 12)).toBe('MERCURY');
    // Segment 23 (last night segment): 23 % 7 = 2 -> MARS.
    expect(horaLordForSegment('saturday', 23)).toBe('MARS');
  });

  it('verified real-world reference: Saturday segment 11 is VENUS, segment 7 is SATURN', () => {
    // Cross-checked directly against swisseph-wasm for Kathmandu, 2026-08-01 (a Saturday), while writing this plan.
    expect(horaLordForSegment('saturday', 11)).toBe('VENUS');
    expect(horaLordForSegment('saturday', 7)).toBe('SATURN');
  });
});

describe('scoreHoraSegment', () => {
  it('favorable hora + exalted lagna lord: both pass, score 100', () => {
    const result = scoreHoraSegment({ horaLord: 'VENUS', lagnaLordDignity: 'exalted' });
    expect(result.score).toBe(100);
    expect(result.checks).toEqual([
      { name: 'Hora', pass: true, reason: 'VENUS hora is favorable' },
      { name: 'Lagna Lord Strength', pass: true, reason: 'Lagna lord is exalted' },
    ]);
  });

  it('unfavorable hora + debilitated lagna lord: both fail, score 0', () => {
    const result = scoreHoraSegment({ horaLord: 'SATURN', lagnaLordDignity: 'debilitated' });
    expect(result.score).toBe(0);
    expect(result.checks).toEqual([
      { name: 'Hora', pass: false, reason: 'SATURN hora is unfavorable' },
      { name: 'Lagna Lord Strength', pass: false, reason: 'Lagna lord is debilitated' },
    ]);
  });

  it('favorable hora + debilitated lagna lord: one passes, score 50', () => {
    const result = scoreHoraSegment({ horaLord: 'JUPITER', lagnaLordDignity: 'debilitated' });
    expect(result.score).toBe(50);
  });

  it('unfavorable hora + own-sign lagna lord: one passes, score 50', () => {
    const result = scoreHoraSegment({ horaLord: 'MARS', lagnaLordDignity: 'own-sign' });
    expect(result.score).toBe(50);
  });

  it('neutral lagna lord dignity counts as passing (only debilitated fails)', () => {
    const result = scoreHoraSegment({ horaLord: 'MOON', lagnaLordDignity: 'neutral' });
    expect(result.score).toBe(100);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/generalMuhurtaCalculator.test.js`
Expected: FAIL — `src/generalMuhurtaCalculator.js` does not exist yet.

- [ ] **Step 3: Implement `src/generalMuhurtaCalculator.js`**

```js
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

export { HORA_LORD_SEQUENCE, WEEKDAY_STARTING_HORA_LORD, FAVORABLE_HORA_LORDS, horaLordForSegment, scoreHoraSegment };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/generalMuhurtaCalculator.test.js`
Expected: PASS (all 10 new tests)

- [ ] **Step 5: Commit**

```bash
git add src/generalMuhurtaCalculator.js test/generalMuhurtaCalculator.test.js
git commit -m "feat: add Hora lord sequencing and pure Hora-segment scoring"
```

---

### Task 3: Wire full computation, validator, and route

**Files:**
- Modify: `src/generalMuhurtaCalculator.js`
- Modify: `src/validators/taskMuhurtaInput.js`
- Modify: `src/routes/muhurtaTaskSearch.js`
- Modify: `test/generalMuhurtaCalculator.test.js`
- Modify: `test/validators/taskMuhurtaInput.test.js`
- Modify: `test/routes/muhurtaTaskSearch.route.test.js`

**Interfaces:**
- Consumes from Task 1: `classifyDignity` from `src/matchData.js`, plus `RASHI_LORDS` (already exported there). From Task 2: `horaLordForSegment`, `scoreHoraSegment`.
- Consumes existing: `computeSunriseSunset` (`src/sunTimesService.js`), `dayPartWindow`, `parseHHmm`, `weekdayFromDate` (`src/muhurtaCalculator.js`), `getSwe`, `computeJulianDay`, `computeAscendantLongitude`, `computePlanetLongitude` (`src/swissephService.js`), `rashiFromLongitude` (`src/kundaliCalculator.js`).
- Produces: `computeGeneralMuhurta(fromDateStr, toDateStr, latitude, longitude, timezone) => Promise<{task, dateRange, windows}>`, exported from `src/generalMuhurtaCalculator.js`. `VALID_TASKS` gains `'general'`. The route dispatches to this function when `task === 'general'`.

- [ ] **Step 1: Write the failing tests**

Append to `test/generalMuhurtaCalculator.test.js`. First extend the import line to include `computeGeneralMuhurta`:
```js
import { HORA_LORD_SEQUENCE, WEEKDAY_STARTING_HORA_LORD, horaLordForSegment, scoreHoraSegment, computeGeneralMuhurta } from '../src/generalMuhurtaCalculator.js';
```

```js
describe('computeGeneralMuhurta — live integration (Kathmandu)', () => {
  it('finds a score-100 window on 2026-08-01 matching the verified best segment (Venus hora, exalted Jupiter lagna lord)', async () => {
    const result = await computeGeneralMuhurta('2026-08-01', '2026-08-01', 27.7172, 85.3240, 'Asia/Kathmandu');
    expect(result.task).toBe('general');
    const day = result.windows[0];
    expect(day.date).toBe('2026-08-01');
    expect(day.score).toBe(100);
    expect(day.bestWindow.planetLord).toBe('VENUS');
    expect(day.horaSegments).toHaveLength(24);
  }, 30000);

  it('the day\'s segment 7 scores 0 (Saturn hora, debilitated Venus lagna lord), verified independently', async () => {
    const result = await computeGeneralMuhurta('2026-08-01', '2026-08-01', 27.7172, 85.3240, 'Asia/Kathmandu');
    const day = result.windows[0];
    expect(day.horaSegments[7].planetLord).toBe('SATURN');
    expect(day.horaSegments[7].score).toBe(0);
  }, 30000);

  it('horaSegments stays chronological (start times strictly increasing)', async () => {
    const result = await computeGeneralMuhurta('2026-08-01', '2026-08-01', 27.7172, 85.3240, 'Asia/Kathmandu');
    const segments = result.windows[0].horaSegments;
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].start > segments[i - 1].start).toBe(true);
    }
  }, 30000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `EPHEMERIS_SERVICE_URL=<your live ephemeris URL> EPHEMERIS_SERVICE_API_KEY=<copy from .env> npx vitest run test/generalMuhurtaCalculator.test.js`
Expected: FAIL — `computeGeneralMuhurta` is not exported yet.

- [ ] **Step 3: Implement in `src/generalMuhurtaCalculator.js`**

Add these imports at the top of the file:
```js
import { DateTime } from 'luxon';
import tzlookup from 'tz-lookup';
import { computeSunriseSunset } from './sunTimesService.js';
import { dayPartWindow, parseHHmm, weekdayFromDate } from './muhurtaCalculator.js';
import { getSwe, computeJulianDay, computeAscendantLongitude, computePlanetLongitude } from './swissephService.js';
import { rashiFromLongitude } from './kundaliCalculator.js';
import { RASHI_LORDS, classifyDignity } from './matchData.js';
```

Add these functions after `scoreHoraSegment`:

```js
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
      };
    }));
    segments.push(...batchResults);
  }
  return segments;
}

function pickBestWindow(segments) {
  return segments.reduce((best, segment) => (segment.score > best.score ? segment : best), segments[0]);
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
```

Update the file's final `export` statement to include `computeGeneralMuhurta`.

**Note for the implementer:** days are processed sequentially (not batched across days like `computeTaskMuhurta`'s `CONCURRENCY` pattern) because each day already issues up to 24 concurrent ephemeris calls (`CONCURRENCY = 5` per day, so up to 5 in flight per day) — batching days on top would multiply concurrent load unnecessarily for a task type that's already the most ephemeris-call-heavy of the five. This is an intentional deviation from `computeTaskMuhurta`'s per-day batching; note it in your report but it is not a defect.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `EPHEMERIS_SERVICE_URL=<your live ephemeris URL> EPHEMERIS_SERVICE_API_KEY=<copy from .env> npx vitest run test/generalMuhurtaCalculator.test.js`
Expected: PASS (all tests including the 3 new live-integration ones)

- [ ] **Step 5: Write the failing validator test**

Read `src/validators/taskMuhurtaInput.js` and `test/validators/taskMuhurtaInput.test.js` first. Add to the test file:

```js
  it('accepts general as a valid task', () => {
    expect(validateTaskMuhurtaInput({ ...validQuery, task: 'general' })).toEqual([]);
  });
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run test/validators/taskMuhurtaInput.test.js`
Expected: FAIL — `general` not yet in `VALID_TASKS`.

- [ ] **Step 7: Implement in `src/validators/taskMuhurtaInput.js`**

Change:
```js
const VALID_TASKS = ['marriage', 'business', 'travel', 'griha-pravesh'];
```
to:
```js
const VALID_TASKS = ['marriage', 'business', 'travel', 'griha-pravesh', 'general'];
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run test/validators/taskMuhurtaInput.test.js`
Expected: PASS

- [ ] **Step 9: Write the failing route test**

Read `src/routes/muhurtaTaskSearch.js` first. Append to `test/routes/muhurtaTaskSearch.route.test.js`:

```js
  it('dispatches to computeGeneralMuhurta and returns the nested Hora-segment shape for task=general', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta/task-search').query({
      task: 'general', from: '2026-08-01', to: '2026-08-01', latitude: 27.7172, longitude: 85.3240, timezone: 'Asia/Kathmandu',
    });
    expect(res.status).toBe(200);
    expect(res.body.task).toBe('general');
    const day = res.body.windows[0];
    expect(day.horaSegments).toHaveLength(24);
    expect(day.bestWindow).toBeDefined();
  }, 30000);
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `EPHEMERIS_SERVICE_URL=<your live ephemeris URL> EPHEMERIS_SERVICE_API_KEY=<copy from .env> npx vitest run test/routes/muhurtaTaskSearch.route.test.js`
Expected: FAIL — the route always calls `computeTaskMuhurta`, which doesn't know about `'general'` and will throw or produce the wrong shape (`TASK_RULES['general']` is `undefined` in `taskMuhurtaCalculator.js`, so `scoreDay` would throw reading `taskRules.nakshatras`).

- [ ] **Step 11: Implement in `src/routes/muhurtaTaskSearch.js`**

```js
import { Router } from 'express';
import { computeTaskMuhurta } from '../taskMuhurtaCalculator.js';
import { computeGeneralMuhurta } from '../generalMuhurtaCalculator.js';
import { validateTaskMuhurtaInput } from '../validators/taskMuhurtaInput.js';
import logger from '../logger.js';

const router = Router();

router.get('/', async (req, res, next) => {
  const errors = validateTaskMuhurtaInput(req.query);
  if (errors.length > 0) {
    res.status(400).json({ error: errors.join('; ') });
    return;
  }
  try {
    const { task, from, to } = req.query;
    const latitude = Number(req.query.latitude);
    const longitude = Number(req.query.longitude);
    const timezone = req.query.timezone;
    const result = task === 'general'
      ? await computeGeneralMuhurta(from, to, latitude, longitude, timezone)
      : await computeTaskMuhurta(task, from, to, latitude, longitude, timezone);
    res.json(result);
  } catch (err) {
    logger.error(err, 'Failed to compute task muhurta');
    next(err);
  }
});

export default router;
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `EPHEMERIS_SERVICE_URL=<your live ephemeris URL> EPHEMERIS_SERVICE_API_KEY=<copy from .env> npx vitest run test/routes/muhurtaTaskSearch.route.test.js`
Expected: PASS (all tests including the new one)

- [ ] **Step 13: Run the full test suite**

Run: `EPHEMERIS_SERVICE_URL=<your live ephemeris URL> EPHEMERIS_SERVICE_API_KEY=<copy from .env> npx vitest run`
Expected: PASS for all tests except the pre-existing, unrelated DB-connection failures (no test database available in sandboxed environments).

- [ ] **Step 14: Commit**

```bash
git add src/generalMuhurtaCalculator.js src/validators/taskMuhurtaInput.js src/routes/muhurtaTaskSearch.js test/generalMuhurtaCalculator.test.js test/validators/taskMuhurtaInput.test.js test/routes/muhurtaTaskSearch.route.test.js
git commit -m "feat: wire computeGeneralMuhurta into the general task type, validator, and route"
```

## Self-Review Notes

- **Spec coverage:** Hora lord sequencing (weekday start + 7-cycle, day-to-night uninterrupted) ✅ (Task 2), favorability table ✅ (Task 2), dignity tables generalized from Mars-only to all 7 grahas with consistency check against the existing Mars tables ✅ (Task 1), Lagna Lord Strength scoring semantics (exalted/own pass, debilitated fail, neutral pass) ✅ (Task 2), nested day/segment/bestWindow response shape ✅ (Task 3), day sorted by best-segment score descending ✅ (Task 3's `computeGeneralMuhurta`), chronological `horaSegments` ✅ (verified by a dedicated test), `VALID_TASKS` gains `'general'` ✅ (Task 3), route dispatch ✅ (Task 3), live-verified real reference segments (score 100 and score 0) ✅ (Task 3).
- **No placeholders:** all steps contain full code and concrete, pre-verified test constants (computed directly against real `swisseph-wasm` output while writing this plan, using the exact `houses_ex`/`calc_ut` calls this repo's `swissephService.js` already relies on).
- **Type consistency:** `classifyDignity(planet, rashiIndex)`'s signature matches between Task 1's definition/tests and Task 3's usage. `horaLordForSegment(weekday, segmentIndex)` and `scoreHoraSegment({horaLord, lagnaLordDignity})` match between Task 2's definitions/tests and Task 3's usage in `scoreSegmentAt`. `computeGeneralMuhurta`'s return shape matches between Task 3's own tests and the route test's expectations.
- **Naming collision check:** confirmed `horaRashiIndex` (D2 Hora divisional chart, `kundaliCalculator.js`) is untouched by this plan and unrelated to the new `generalMuhurtaCalculator.js` module — no import or naming overlap between the two.
