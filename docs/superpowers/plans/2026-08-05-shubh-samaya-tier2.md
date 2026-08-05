# Shubh Samaya Tier 2 (Task-Specific Muhurta) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /api/muhurta/task-search` — score each day in a date range for how favorable it is for Marriage, Business Start, or Travel, using Tithi/Nakshatra/Yoga/Karana/Vara panchanga checks.

**Architecture:** New `src/taskMuhurtaCalculator.js` with a pure `scoreDay(snapshot, taskRules)` (directly unit-testable, no I/O — mirrors Tier 1's `_computeBhadraWindowsFromKaranaLookup` pattern of separating pure logic from the async data-fetch that feeds it) plus an async `snapshotPanchangaAtSunrise` and `computeDailyScore` wrapper, an orchestrator `computeTaskMuhurta` that concurrency-batches per-day scoring across a date range, a new validator, and a new route.

**Tech Stack:** Node.js, Express, Luxon, Vitest, Supertest — no new dependencies. Reuses `sunTimesService.js`, `swissephService.js`, `panchangCalculator.js`, `kundaliCalculator.js`, `muhurtaCalculator.js`'s `weekdayFromDate` — all already exist and are already tested.

## Global Constraints

- Task types: `marriage`, `business`, `travel` only. No `griha-pravesh` (out of scope — needs combustion data not computed).
- Scoring factors: Tithi, Nakshatra (with pada exclusions), Yoga, Karana, Vara only. No Lagna/Hora, no Chandra/Tara bala.
- One score per calendar day (sunrise-time panchanga snapshot), not sub-day windows.
- Date range capped at 60 days inclusive — reject longer ranges with a 400, don't silently compute a slow response.
- Nakshatra names in code MUST exactly match `astro-data.js`'s `NAKSHATRA_NAMES` spelling — in particular **`Mula`**, not `Moola` (the design spec initially had this wrong; already corrected there, but call it out here so nobody reintroduces it from memory).
- Verified reference data (computed directly against the live ephemeris service while writing this plan, Kathmandu 27.7172/85.3240):
  - **2026-08-17 (Monday):** tithi=Panchami (not Rikta), nakshatra=Chitra pada 1, yoga=Shubha, karana=Balava.
  - **2026-08-11 (Tuesday):** tithi=Chaturdashi (Rikta), nakshatra=Punarvasu pada 4, yoga=Siddhi, karana=Vishti.
  - **2026-07-17 (Friday):** tithi=Tritiya (not Rikta), nakshatra=Magha pada 2, yoga=Vyatipata, karana=Gara.

---

### Task 1: `scoreDay` pure logic + `TASK_RULES`

**Files:**
- Create: `src/taskMuhurtaCalculator.js`
- Test: `test/taskMuhurtaCalculator.test.js`

**Interfaces:**
- Produces: `TASK_RULES: { marriage, business, travel }` (each `{ nakshatras: string[], padaExclusions: Record<string, number[]>, weekdays: string[] }`), `scoreDay(snapshot, taskRules) => { score: number, reasons: string[], warnings: string[] }` where `snapshot = { tithi, yoga, karana, nakshatra, weekday }` — `tithi`/`yoga`/`karana` are exactly the shapes `computePanchang` already returns (`{tithiIndex, tithiName, ...}`, `{yogaName}`, `{karanaName}`), `nakshatra` is exactly what `nakshatraFromLongitude` returns (`{nakshatraName, pada, ...}`), `weekday` is a lowercase string.
- Consumes: nothing (pure, no imports beyond the rule-table constants themselves).

- [ ] **Step 1: Write the failing tests**

```js
// test/taskMuhurtaCalculator.test.js
import { describe, it, expect } from 'vitest';
import { TASK_RULES, scoreDay } from '../src/taskMuhurtaCalculator.js';

function snapshot({ tithiIndex, tithiName, yogaName, karanaName, nakshatraName, pada, weekday }) {
  return {
    tithi: { tithiIndex, tithiName },
    yoga: { yogaName },
    karana: { karanaName },
    nakshatra: { nakshatraName, pada },
    weekday,
  };
}

describe('TASK_RULES', () => {
  it('uses "Mula" (not "Moola") for the marriage nakshatra list, matching astro-data.js spelling', () => {
    expect(TASK_RULES.marriage.nakshatras).toContain('Mula');
    expect(TASK_RULES.marriage.nakshatras).not.toContain('Moola');
  });
});

describe('scoreDay — marriage, 2026-07-17 (Friday), verified: Tritiya, Magha pada 2, Vyatipata, Gara', () => {
  const daySnapshot = snapshot({
    tithiIndex: 2, tithiName: 'Tritiya',
    yogaName: 'Vyatipata',
    karanaName: 'Gara',
    nakshatraName: 'Magha', pada: 2,
    weekday: 'friday',
  });

  it('scores 80 (4 of 5 checks pass; Yoga fails on Vyatipata)', () => {
    const result = scoreDay(daySnapshot, TASK_RULES.marriage);
    expect(result.score).toBe(80);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/vyatipata/i);
    expect(result.reasons).toHaveLength(4);
  });
});

describe('scoreDay — Magha pada exclusion (pure, synthetic — no live date needed)', () => {
  it('Magha pada 1 fails the Nakshatra check for marriage even though Magha is otherwise favorable', () => {
    const daySnapshot = snapshot({
      tithiIndex: 2, tithiName: 'Tritiya', yogaName: 'Shubha', karanaName: 'Bava',
      nakshatraName: 'Magha', pada: 1, weekday: 'monday',
    });
    const result = scoreDay(daySnapshot, TASK_RULES.marriage);
    expect(result.score).toBe(80); // 4 of 5 pass, Nakshatra fails
    expect(result.warnings.some((w) => /magha/i.test(w))).toBe(true);
  });

  it('Magha pada 2 passes the Nakshatra check for marriage (same nakshatra, different pada)', () => {
    const daySnapshot = snapshot({
      tithiIndex: 2, tithiName: 'Tritiya', yogaName: 'Shubha', karanaName: 'Bava',
      nakshatraName: 'Magha', pada: 2, weekday: 'monday',
    });
    const result = scoreDay(daySnapshot, TASK_RULES.marriage);
    expect(result.score).toBe(100);
  });
});

describe('scoreDay — 2026-08-11 (Tuesday), verified: Chaturdashi (Rikta), Punarvasu pada 4, Siddhi, Vishti', () => {
  const daySnapshot = snapshot({
    tithiIndex: 13, tithiName: 'Chaturdashi',
    yogaName: 'Siddhi',
    karanaName: 'Vishti',
    nakshatraName: 'Punarvasu', pada: 4,
    weekday: 'tuesday',
  });

  it.each(['marriage', 'business', 'travel'])('scores 20 for %s (only Yoga passes: Rikta tithi, unfavorable nakshatra, Vishti karana, unfavorable weekday all fail)', (task) => {
    const result = scoreDay(daySnapshot, TASK_RULES[task]);
    expect(result.score).toBe(20);
    expect(result.reasons).toHaveLength(1);
    expect(result.warnings).toHaveLength(4);
  });
});

describe('scoreDay — 2026-08-17 (Monday), verified: Panchami, Chitra pada 1, Shubha, Balava', () => {
  const daySnapshot = snapshot({
    tithiIndex: 4, tithiName: 'Panchami',
    yogaName: 'Shubha',
    karanaName: 'Balava',
    nakshatraName: 'Chitra', pada: 1,
    weekday: 'monday',
  });

  it('scores 100 for business (Chitra favors business, Monday favors business)', () => {
    const result = scoreDay(daySnapshot, TASK_RULES.business);
    expect(result.score).toBe(100);
    expect(result.warnings).toHaveLength(0);
  });

  it('scores 80 for travel (Chitra does not favor travel; everything else passes)', () => {
    const result = scoreDay(daySnapshot, TASK_RULES.travel);
    expect(result.score).toBe(80);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/chitra/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/taskMuhurtaCalculator.test.js`
Expected: FAIL — `Cannot find module '../src/taskMuhurtaCalculator.js'`.

- [ ] **Step 3: Implement `TASK_RULES` and `scoreDay` in `src/taskMuhurtaCalculator.js`**

```js
const RIKTA_TITHI_INDICES = [3, 8, 13]; // 0-based tithiInPaksha (tithiIndex % 15): Chaturthi, Navami, Chaturdashi
const AVOID_YOGA_NAMES = ['Vyatipata', 'Vaidhriti'];

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
};

function scoreDay({ tithi, yoga, karana, nakshatra, weekday }, taskRules) {
  const checks = [
    {
      pass: !RIKTA_TITHI_INDICES.includes(tithi.tithiIndex % 15),
      passReason: `${tithi.tithiName} is not a Rikta tithi`,
      failReason: `${tithi.tithiName} is a Rikta tithi`,
    },
    {
      pass: taskRules.nakshatras.includes(nakshatra.nakshatraName)
        && !(taskRules.padaExclusions[nakshatra.nakshatraName] || []).includes(nakshatra.pada),
      passReason: `${nakshatra.nakshatraName} pada ${nakshatra.pada} favours this task`,
      failReason: `${nakshatra.nakshatraName} pada ${nakshatra.pada} does not favour this task`,
    },
    {
      pass: !AVOID_YOGA_NAMES.includes(yoga.yogaName),
      passReason: `${yoga.yogaName} yoga is not inauspicious`,
      failReason: `${yoga.yogaName} yoga should be avoided`,
    },
    {
      pass: karana.karanaName !== 'Vishti',
      passReason: 'No Vishti karana active',
      failReason: 'Vishti karana (Bhadra) is active',
    },
    {
      pass: taskRules.weekdays.includes(weekday),
      passReason: `${weekday} is a favourable weekday`,
      failReason: `${weekday} is not an ideal weekday`,
    },
  ];

  const passed = checks.filter((c) => c.pass);
  const failed = checks.filter((c) => !c.pass);

  return {
    score: Math.round((passed.length / checks.length) * 100),
    reasons: passed.map((c) => c.passReason),
    warnings: failed.map((c) => c.failReason),
  };
}

export { TASK_RULES, scoreDay };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/taskMuhurtaCalculator.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/taskMuhurtaCalculator.js test/taskMuhurtaCalculator.test.js
git commit -m "feat: add TASK_RULES and pure scoreDay logic for task-specific muhurta"
```

---

### Task 2: `snapshotPanchangaAtSunrise` + `computeDailyScore` + `computeTaskMuhurta` orchestrator

**Files:**
- Modify: `src/taskMuhurtaCalculator.js`
- Modify: `test/taskMuhurtaCalculator.test.js`

**Interfaces:**
- Consumes: `computeSunriseSunset` (`src/sunTimesService.js`), `getSwe`/`computeJulianDay`/`computePlanetLongitude` (`src/swissephService.js`), `computePanchang` (`src/panchangCalculator.js`), `nakshatraFromLongitude` (`src/kundaliCalculator.js`), `weekdayFromDate` (`src/muhurtaCalculator.js`) — all already exist and exported.
- Produces: `computeDailyScore(dateStr, latitude, longitude, timezone, taskRules) => Promise<{ date, score, reasons, warnings }>`, `computeTaskMuhurta(task, fromDateStr, toDateStr, latitude, longitude, timezone) => Promise<MuhurtaResult>` where `MuhurtaResult = { task, dateRange: {from, to}, windows: [{start, end, score, reasons, warnings}] }` sorted by score descending. Consumed by Task 3's route.

- [ ] **Step 1: Write the failing tests**

Append to `test/taskMuhurtaCalculator.test.js`:

```js
import { vi } from 'vitest'; // add to existing vitest import if not already present
import * as sunTimesService from '../src/sunTimesService.js';
import { computeDailyScore, computeTaskMuhurta } from '../src/taskMuhurtaCalculator.js'; // add to existing import

describe('computeDailyScore — live integration (Kathmandu, 2026-08-17, Monday)', () => {
  it('matches the pure scoreDay result for business (100) using real ephemeris data', async () => {
    const result = await computeDailyScore('2026-08-17', 27.7172, 85.3240, 'Asia/Kathmandu', TASK_RULES.business);
    expect(result.date).toBe('2026-08-17');
    expect(result.score).toBe(100);
  }, 30000);

  it('matches the pure scoreDay result for travel (80) using real ephemeris data, same date', async () => {
    const result = await computeDailyScore('2026-08-17', 27.7172, 85.3240, 'Asia/Kathmandu', TASK_RULES.travel);
    expect(result.score).toBe(80);
  }, 30000);
});

describe('computeTaskMuhurta (orchestrator)', () => {
  it('returns one window per day in range, sorted by score descending', async () => {
    // 2026-08-17 (Mon, verified business=100) and 2026-08-11 (Tue, verified all-tasks=20)
    // are both inside this range; the orchestrator must sort 100 before 20.
    const result = await computeTaskMuhurta('business', '2026-08-11', '2026-08-17', 27.7172, 85.3240, 'Asia/Kathmandu');
    expect(result.task).toBe('business');
    expect(result.dateRange).toEqual({ from: '2026-08-11', to: '2026-08-17' });
    expect(result.windows).toHaveLength(7); // Aug 11 through Aug 17 inclusive
    expect(result.windows[0].score).toBeGreaterThanOrEqual(result.windows[1].score);
    const aug17 = result.windows.find((w) => w.start === '2026-08-17');
    const aug11 = result.windows.find((w) => w.start === '2026-08-11');
    expect(aug17.score).toBe(100);
    expect(aug11.score).toBe(20);
    expect(result.windows[0]).toEqual(aug17); // the 100-score day should sort first
  }, 60000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `EPHEMERIS_SERVICE_URL=http://172.19.0.3:3100 EPHEMERIS_SERVICE_API_KEY=<copy from .env> npx vitest run test/taskMuhurtaCalculator.test.js`
Expected: FAIL — `computeDailyScore`/`computeTaskMuhurta` not exported.

- [ ] **Step 3: Implement in `src/taskMuhurtaCalculator.js`**

Add imports at the top:
```js
import { DateTime } from 'luxon';
import tzlookup from 'tz-lookup';
import { computeSunriseSunset } from './sunTimesService.js';
import { getSwe, computeJulianDay, computePlanetLongitude } from './swissephService.js';
import { computePanchang } from './panchangCalculator.js';
import { nakshatraFromLongitude } from './kundaliCalculator.js';
import { weekdayFromDate } from './muhurtaCalculator.js';
```

Add after `scoreDay`:

```js
async function snapshotPanchangaAtSunrise(dateStr, latitude, longitude, timezone) {
  const { sunrise } = await computeSunriseSunset(dateStr, latitude, longitude, timezone);
  const swe = await getSwe();
  const jd = await computeJulianDay(dateStr, sunrise, latitude, longitude, timezone);
  const sunLongitude = await computePlanetLongitude(jd, swe.SE_SUN);
  const moonLongitude = await computePlanetLongitude(jd, swe.SE_MOON);
  const { tithi, yoga, karana } = computePanchang({ sunLongitude, moonLongitude });
  const nakshatra = nakshatraFromLongitude(moonLongitude);
  const weekday = weekdayFromDate(dateStr, latitude, longitude, timezone);
  return { tithi, yoga, karana, nakshatra, weekday };
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
      start: r.date,
      end: r.date,
      score: r.score,
      reasons: r.reasons,
      warnings: r.warnings,
    })),
  };
}
```

Update the file's `export` statement to include `snapshotPanchangaAtSunrise, computeDailyScore, computeTaskMuhurta` (keep `TASK_RULES, scoreDay` from Task 1).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `EPHEMERIS_SERVICE_URL=http://172.19.0.3:3100 EPHEMERIS_SERVICE_API_KEY=<copy from .env> npx vitest run test/taskMuhurtaCalculator.test.js`
Expected: PASS (12 tests). Note: these hit the live ephemeris service (unmocked, same pattern as Tier 1's Bhadra integration tests) — if they fail with a connection error rather than an assertion error, the service isn't reachable at that URL; that's an environment issue, note it in the report rather than treating it as a code defect.

- [ ] **Step 5: Commit**

```bash
git add src/taskMuhurtaCalculator.js test/taskMuhurtaCalculator.test.js
git commit -m "feat: add computeDailyScore and computeTaskMuhurta orchestrator"
```

---

### Task 3: Validator + route

**Files:**
- Create: `src/validators/taskMuhurtaInput.js`
- Create: `src/routes/muhurtaTaskSearch.js`
- Modify: `src/app.js`
- Test: `test/routes/muhurtaTaskSearch.route.test.js`

**Interfaces:**
- Consumes: `computeTaskMuhurta` (Task 2).
- Produces: `GET /api/muhurta/task-search` route.

- [ ] **Step 1: Write the failing tests**

```js
// test/routes/muhurtaTaskSearch.route.test.js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('GET /api/muhurta/task-search', () => {
  it('returns 400 for an unknown task type', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta/task-search').query({
      task: 'not-a-real-task', from: '2026-08-11', to: '2026-08-17', latitude: 27.7172, longitude: 85.3240,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when "to" is before "from"', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta/task-search').query({
      task: 'business', from: '2026-08-17', to: '2026-08-11', latitude: 27.7172, longitude: 85.3240,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when the date range exceeds 60 days', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta/task-search').query({
      task: 'business', from: '2026-01-01', to: '2026-12-31', latitude: 27.7172, longitude: 85.3240,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a calendar-invalid date', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta/task-search').query({
      task: 'business', from: '2026-02-31', to: '2026-08-17', latitude: 27.7172, longitude: 85.3240,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an empty-string latitude', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta/task-search').query({
      task: 'business', from: '2026-08-11', to: '2026-08-17', latitude: '', longitude: 85.3240,
    });
    expect(res.status).toBe(400);
  });

  it('returns a MuhurtaResult shape for a valid request', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta/task-search').query({
      task: 'business', from: '2026-08-11', to: '2026-08-17', latitude: 27.7172, longitude: 85.3240, timezone: 'Asia/Kathmandu',
    });
    expect(res.status).toBe(200);
    expect(res.body.task).toBe('business');
    expect(res.body.windows).toHaveLength(7);
    expect(res.body.windows[0].score).toBeGreaterThanOrEqual(res.body.windows[6].score);
  }, 60000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/routes/muhurtaTaskSearch.route.test.js`
Expected: FAIL — 404 (route doesn't exist).

- [ ] **Step 3: Implement `src/validators/taskMuhurtaInput.js`**

```js
import { DateTime, IANAZone } from 'luxon';

const VALID_TASKS = ['marriage', 'business', 'travel'];
const MAX_DATE_RANGE_DAYS = 60;

function validateTaskMuhurtaInput(query) {
  const errors = [];
  const { task, from, to, latitude, longitude, timezone } = query;

  if (!VALID_TASKS.includes(task)) {
    errors.push(`task must be one of: ${VALID_TASKS.join(', ')}`);
  }

  const fromValid = from && /^\d{4}-\d{2}-\d{2}$/.test(from) && DateTime.fromISO(from).isValid;
  const toValid = to && /^\d{4}-\d{2}-\d{2}$/.test(to) && DateTime.fromISO(to).isValid;
  if (!fromValid) errors.push('from must be a valid date in YYYY-MM-DD format');
  if (!toValid) errors.push('to must be a valid date in YYYY-MM-DD format');

  if (fromValid && toValid) {
    const fromDate = DateTime.fromISO(from);
    const toDate = DateTime.fromISO(to);
    if (toDate < fromDate) {
      errors.push('to must not be before from');
    } else {
      const rangeDays = toDate.diff(fromDate, 'days').days + 1;
      if (rangeDays > MAX_DATE_RANGE_DAYS) {
        errors.push(`date range must not exceed ${MAX_DATE_RANGE_DAYS} days`);
      }
    }
  }

  const lat = Number(latitude);
  if (latitude === undefined || String(latitude).trim() === '' || Number.isNaN(lat) || lat < -90 || lat > 90) {
    errors.push('latitude must be a number between -90 and 90');
  }
  const lon = Number(longitude);
  if (longitude === undefined || String(longitude).trim() === '' || Number.isNaN(lon) || lon < -180 || lon > 180) {
    errors.push('longitude must be a number between -180 and 180');
  }
  if (timezone !== undefined && timezone !== null && timezone !== '') {
    if (typeof timezone !== 'string' || !IANAZone.isValidZone(timezone)) {
      errors.push('timezone must be a valid IANA timezone name (e.g. Asia/Kolkata)');
    }
  }

  return errors;
}

export { validateTaskMuhurtaInput };
```

Note: this validator proactively includes the empty-string-coordinate guard and calendar-date validity check that Tier 1's `muhurtaInput.js` initially lacked and had to fix after its final review — don't reintroduce that gap here.

- [ ] **Step 4: Implement `src/routes/muhurtaTaskSearch.js`**

```js
import { Router } from 'express';
import { computeTaskMuhurta } from '../taskMuhurtaCalculator.js';
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
    const result = await computeTaskMuhurta(
      req.query.task,
      req.query.from,
      req.query.to,
      Number(req.query.latitude),
      Number(req.query.longitude),
      req.query.timezone,
    );
    res.json(result);
  } catch (err) {
    logger.error(err, 'Failed to compute task muhurta');
    next(err);
  }
});

export default router;
```

- [ ] **Step 5: Wire the route into `src/app.js`**

Add the import alongside the existing `muhurtaRouter` import:
```js
import muhurtaTaskSearchRouter from './routes/muhurtaTaskSearch.js';
```
Add the mount alongside the existing `/api/muhurta` mount:
```js
app.use('/api/muhurta/task-search', muhurtaTaskSearchRouter);
```

**Important:** this mount must be registered, and Express will match `/api/muhurta/task-search` correctly against both this router (mounted at the more specific path) and the existing `app.use('/api/muhurta', muhurtaRouter)` (mounted at the less specific path) — Express matches path prefixes in registration order, so `/api/muhurta/task-search` must be registered in `app.js` in a way that doesn't get shadowed by the existing `/api/muhurta` mount. Since `muhurtaRouter` only defines a route at its own root (`router.get('/', ...)`, matching exactly `/api/muhurta` with nothing after it), a request to `/api/muhurta/task-search` will NOT match it regardless of registration order (Express only falls through to the next matching middleware if the current one calls `next()`, but a router with no matching inner route already does that implicitly) — but verify this empirically in Step 2/Step 6, don't just trust this reasoning blindly.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `EPHEMERIS_SERVICE_URL=http://172.19.0.3:3100 EPHEMERIS_SERVICE_API_KEY=<copy from .env> npx vitest run test/routes/muhurtaTaskSearch.route.test.js`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add src/validators/taskMuhurtaInput.js src/routes/muhurtaTaskSearch.js src/app.js test/routes/muhurtaTaskSearch.route.test.js
git commit -m "feat: add GET /api/muhurta/task-search route for task-specific muhurta"
```

## Self-Review Notes

- **Spec coverage:** 3 task types ✅ (Task 1's `TASK_RULES`), 5 scoring factors ✅ (Task 1's `scoreDay`), Mula spelling fixed ✅ (Task 1's dedicated test), per-day granularity ✅ (Task 2's `snapshotPanchangaAtSunrise`, one snapshot per day), 60-day range cap ✅ (Task 3's validator), sorted-descending output ✅ (Task 2's orchestrator), empty-string/calendar-date validation gaps from Tier 1 not repeated ✅ (Task 3's validator built with both from the start).
- **Type consistency:** `scoreDay`'s snapshot parameter shape is identical across Task 1's definition, its tests, and Task 2's `snapshotPanchangaAtSunrise` construction of that same shape. `computeTaskMuhurta`'s signature matches between Task 2's definition and Task 3's route usage.
- **No placeholders:** all steps contain full code and concrete, pre-verified test constants (computed live against the real ephemeris service while writing this plan).
- **Cross-repo dependency:** none — this entire plan reuses existing `kundali-backend` modules and the existing (already-live) `/v1/ephemeris` endpoint. It does NOT depend on the newer `/v1/sunrise-sunset` endpoint directly, except transitively via `sunTimesService.js` (already working, already tested).
