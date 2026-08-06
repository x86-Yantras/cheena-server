# Griha Pravesh (Combustion Check) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `griha-pravesh` as a 4th task type to `GET /api/muhurta/task-search`, with a Venus/Jupiter combustion (Tara Asta) check unique to this task type.

**Architecture:** `swissephService.js` gains a `computePlanetSpeed` accessor mirroring the existing `computePlanetLongitude` cache pattern. `taskMuhurtaCalculator.js` gains a pure `isCombust`/`angularSeparation` helper, a `griha-pravesh` entry in `TASK_RULES` with a `requiresCombustionCheck` flag, and `scoreDay`/`snapshotPanchangaAtSunrise` are extended to conditionally include the 6th check — the other 3 task types' 5-check scoring is untouched.

**Tech Stack:** Node.js, Luxon, Vitest, Supertest — no new dependencies. Depends on the sibling `kundali-ephemeris-service` plan (`docs/superpowers/plans/2026-08-06-planet-speed.md`) exposing `planetSpeeds` — Tasks 1-2 here are fully unit-testable against mocks without that plan deployed; only Task 3's live integration test needs it live.

## Global Constraints

- Combustion orbs: Venus 10° direct / 8° retrograde (`speed < 0`), Jupiter 11° regardless of motion direction.
- A planet is combust when its angular separation from the Sun is LESS THAN its orb (exclusive — separation exactly equal to the orb is not combust).
- `angularSeparation` must take the shorter arc (handle the 360°/0° wrap) — e.g. Sun at 359°, planet at 2° → 3° separation, not 357°.
- Griha Pravesh is avoided when EITHER Venus or Jupiter is combust (not "and").
- `requiresCombustionCheck` gates the 6th check — `marriage`/`business`/`travel` must NEVER gain a `'Combustion'` entry in their `checks` array, regardless of what combustion data is computed or passed around internally.
- Verified reference (computed directly against `swisseph-wasm`, Kathmandu 27.7172/85.3240, sunrise-time): **2026-08-01** — Jupiter separation from Sun ≈ 1.83° (well under its 11° orb) → Jupiter combust. **2026-08-14** — Jupiter separation ≈ 11.42° (just over 11°) → not combust. Venus stays around 45-46° separation on both dates (nowhere near combust) — these two dates isolate the Jupiter combustion check specifically.

---

### Task 1: `computePlanetSpeed` in `swissephService.js`

**Files:**
- Modify: `src/swissephService.js`
- Test: `test/swissephService.test.js`

**Interfaces:**
- Produces: `computePlanetSpeed(jd, sweConst) => Promise<number>`, exported alongside the existing `computePlanetLongitude`. Mirrors that function's cache-miss error behavior exactly.
- Consumes: nothing new — depends on `computeJulianDay` (already exists) now also caching `planetSpeeds` from the ephemeris service's response (once the sibling plan lands; this task's own tests mock the HTTP response directly, so it doesn't need that plan deployed).

- [ ] **Step 1: Write the failing tests**

The existing `MOCK_RESPONSE` in `test/swissephService.test.js` needs a `planetSpeeds` field added:

```js
const MOCK_RESPONSE = {
  julianDay: 2451545.0,
  ascendantLongitude: 123.456,
  planetLongitudes: {
    SUN: 10.1, MOON: 20.2, MARS: 30.3, MERCURY: 40.4,
    JUPITER: 50.5, VENUS: 60.6, SATURN: 70.7, RAHU: 80.8,
  },
  planetSpeeds: {
    SUN: 0.98, MOON: 13.2, MARS: 0.5, MERCURY: 1.1,
    JUPITER: -0.13, VENUS: 1.26, SATURN: 0.03, RAHU: -0.05,
  },
  bhavaMadhyas: [5, 35, 65, 95, 125, 155, 185, 215, 245, 275, 305, 335],
};
```

Update the import line to include `computePlanetSpeed`:
```js
import { getSwe, resolveUtc, computeJulianDay, computeAscendantLongitude, computePlanetLongitude, computePlanetSpeed, computeBhavaMadhyas } from '../src/swissephService.js';
```

Add these tests (following the file's existing pattern — `computeJulianDay` first to populate the cache, then the accessor):

```js
  it('computePlanetSpeed reuses the cached response and maps swe constant names to values', async () => {
    const jd = await computeJulianDay('2000-01-01', '12:00', 51.5074, -0.1278, 'UTC');
    const swe = await getSwe();
    const jupiterSpeed = await computePlanetSpeed(jd, swe.SE_JUPITER);
    const venusSpeed = await computePlanetSpeed(jd, swe.SE_VENUS);
    expect(jupiterSpeed).toBe(-0.13);
    expect(venusSpeed).toBe(1.26);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('computePlanetSpeed throws when called before computeJulianDay for that jd', async () => {
    await expect(computePlanetSpeed(9999999.0, 'JUPITER')).rejects.toThrow(/no cached ephemeris response/i);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/swissephService.test.js`
Expected: FAIL — `computePlanetSpeed` is not exported from `../src/swissephService.js`.

- [ ] **Step 3: Implement in `src/swissephService.js`**

Add the cache declaration alongside the existing `planetLongitudesCache`:
```js
const planetSpeedsCache = new Map(); // jd -> planetSpeeds
```

In `computeJulianDay`, extend the destructure and add the cache-set, alongside the existing `planetLongitudesCache` lines:
```js
  const { julianDay, ascendantLongitude, planetLongitudes, planetSpeeds, bhavaMadhyas } = body;
  planetLongitudesCache.set(julianDay, planetLongitudes);
  scheduleEviction(planetLongitudesCache, julianDay);
  planetSpeedsCache.set(julianDay, planetSpeeds);
  scheduleEviction(planetSpeedsCache, julianDay);
```//
(the existing `ascendantCache`/`bhavaMadhyasCache` lines below stay exactly as they are)

Add the new accessor, mirroring `computePlanetLongitude` exactly:
```js
async function computePlanetSpeed(jd, sweConst) {
  const cached = planetSpeedsCache.get(jd);
  if (!cached) {
    throw new Error(`No cached ephemeris response for julian day ${jd}. computeJulianDay must be called first.`);
  }
  return cached[sweConst];
}
```

Update the file's final export statement:
```js
export { getSwe, resolveUtc, computeJulianDay, computeAscendantLongitude, computePlanetLongitude, computePlanetSpeed, computeBhavaMadhyas };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/swissephService.test.js`
Expected: PASS (all existing tests plus the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/swissephService.js test/swissephService.test.js
git commit -m "feat: add computePlanetSpeed accessor to swissephService"
```

---

### Task 2: `isCombust`/`angularSeparation` + `griha-pravesh` in `TASK_RULES` + `scoreDay` extension

**Files:**
- Modify: `src/taskMuhurtaCalculator.js`
- Modify: `test/taskMuhurtaCalculator.test.js`

**Interfaces:**
- Produces: `angularSeparation(a, b) => number` (0-180, shortest arc), `isCombust(planetLongitude, sunLongitude, speed, planet) => boolean`, `TASK_RULES['griha-pravesh']` with `requiresCombustionCheck: true`, `scoreDay` accepting optional `venusCombust`/`jupiterCombust` fields in its snapshot argument and conditionally adding a `'Combustion'` check only when `taskRules.requiresCombustionCheck` is true.
- Consumes: nothing new in this task — pure logic only, no I/O. Task 3 wires the real data in.

- [ ] **Step 1: Write the failing tests**

Append to `test/taskMuhurtaCalculator.test.js`. First, update the import line to include the new exports (added at the end of Task 2's Step 3, so this import will fail until then — expected):
```js
import { TASK_RULES, scoreDay, angularSeparation, isCombust, /* ...existing imports... */ } from '../src/taskMuhurtaCalculator.js';
```

```js
describe('angularSeparation', () => {
  it('returns the shortest arc, handling the 360/0 wrap', () => {
    expect(angularSeparation(359, 2)).toBeCloseTo(3, 5);
    expect(angularSeparation(2, 359)).toBeCloseTo(3, 5);
  });

  it('returns 0 for identical longitudes', () => {
    expect(angularSeparation(100, 100)).toBe(0);
  });

  it('returns the direct difference when under 180 degrees', () => {
    expect(angularSeparation(10, 40)).toBeCloseTo(30, 5);
  });
});

describe('isCombust', () => {
  it('Venus direct: 9 degrees separation is combust (orb 10)', () => {
    expect(isCombust(9, 0, 1.2, 'VENUS')).toBe(true);
  });

  it('Venus direct: exactly 10 degrees separation is NOT combust (boundary exclusive)', () => {
    expect(isCombust(10, 0, 1.2, 'VENUS')).toBe(false);
  });

  it('Venus direct: 11 degrees separation is not combust', () => {
    expect(isCombust(11, 0, 1.2, 'VENUS')).toBe(false);
  });

  it('Venus retrograde: 7 degrees separation is combust (orb 8)', () => {
    expect(isCombust(7, 0, -0.5, 'VENUS')).toBe(true);
  });

  it('Venus retrograde: exactly 8 degrees separation is NOT combust', () => {
    expect(isCombust(8, 0, -0.5, 'VENUS')).toBe(false);
  });

  it('Jupiter: 10 degrees separation is combust (orb 11, any speed)', () => {
    expect(isCombust(10, 0, 0.1, 'JUPITER')).toBe(true);
  });

  it('Jupiter: exactly 11 degrees separation is NOT combust', () => {
    expect(isCombust(11, 0, 0.1, 'JUPITER')).toBe(false);
  });

  it('Jupiter: 12 degrees separation is not combust', () => {
    expect(isCombust(12, 0, 0.1, 'JUPITER')).toBe(false);
  });

  it('Jupiter retrograde uses the same 11 degree orb as direct (no retrograde-specific value)', () => {
    expect(isCombust(10, 0, -0.1, 'JUPITER')).toBe(true);
    expect(isCombust(11, 0, -0.1, 'JUPITER')).toBe(false);
  });
});

describe('TASK_RULES griha-pravesh', () => {
  it('has requiresCombustionCheck: true, unlike the other 3 task types', () => {
    expect(TASK_RULES['griha-pravesh'].requiresCombustionCheck).toBe(true);
    expect(TASK_RULES.marriage.requiresCombustionCheck).toBeUndefined();
    expect(TASK_RULES.business.requiresCombustionCheck).toBeUndefined();
    expect(TASK_RULES.travel.requiresCombustionCheck).toBeUndefined();
  });

  it('includes the researched nakshatra and weekday lists', () => {
    expect(TASK_RULES['griha-pravesh'].nakshatras).toContain('Rohini');
    expect(TASK_RULES['griha-pravesh'].nakshatras).toContain('Chitra');
    expect(TASK_RULES['griha-pravesh'].weekdays).not.toContain('tuesday');
  });
});

describe('scoreDay with requiresCombustionCheck', () => {
  const baseSnapshot = {
    tithi: { tithiIndex: 4, tithiName: 'Panchami' },
    yoga: { yogaName: 'Shubha' },
    karana: { karanaName: 'Balava' },
    nakshatra: { nakshatraName: 'Rohini', pada: 1 },
    weekday: 'monday',
  };

  it('adds a Combustion check for griha-pravesh when neither planet is combust (score 100, 6 of 6 pass)', () => {
    const result = scoreDay({ ...baseSnapshot, venusCombust: false, jupiterCombust: false }, TASK_RULES['griha-pravesh']);
    expect(result.score).toBe(100);
    expect(result.checks.find((c) => c.name === 'Combustion').pass).toBe(true);
  });

  it('fails the Combustion check for griha-pravesh when Jupiter is combust (score 83, 5 of 6 pass)', () => {
    const result = scoreDay({ ...baseSnapshot, venusCombust: false, jupiterCombust: true }, TASK_RULES['griha-pravesh']);
    expect(result.score).toBe(83);
    expect(result.checks.find((c) => c.name === 'Combustion').pass).toBe(false);
    expect(result.warnings.some((w) => /jupiter/i.test(w))).toBe(true);
  });

  it('does NOT add a Combustion check for marriage, even when combustion fields are present in the snapshot', () => {
    const result = scoreDay({ ...baseSnapshot, venusCombust: true, jupiterCombust: true }, TASK_RULES.marriage);
    expect(result.checks.find((c) => c.name === 'Combustion')).toBeUndefined();
    expect(result.checks).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/taskMuhurtaCalculator.test.js`
Expected: FAIL — `angularSeparation`/`isCombust` not exported, `TASK_RULES['griha-pravesh']` is `undefined`.

- [ ] **Step 3: Implement in `src/taskMuhurtaCalculator.js`**

Add near the top, after the existing `RIKTA_TITHI_INDICES`/`AVOID_YOGA_NAMES` constants:

```js
function angularSeparation(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function isCombust(planetLongitude, sunLongitude, speed, planet) {
  const orb = planet === 'VENUS' ? (speed < 0 ? 8 : 10) : 11; // JUPITER
  return angularSeparation(planetLongitude, sunLongitude) < orb;
}
```

Add to `TASK_RULES` (after the existing `travel` entry):
```js
  'griha-pravesh': {
    nakshatras: ['Rohini', 'Mrigashira', 'Pushya', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Anuradha', 'Uttara Ashadha', 'Uttara Bhadrapada', 'Revati'],
    padaExclusions: {},
    weekdays: ['monday', 'wednesday', 'thursday', 'friday'],
    requiresCombustionCheck: true,
  },
```

Modify `scoreDay`'s signature and body:
```js
function scoreDay({ tithi, yoga, karana, nakshatra, weekday, venusCombust, jupiterCombust }, taskRules) {
  const checks = [
    // ...all 5 existing checks (Tithi, Nakshatra, Yoga, Karana, Vara), completely unchanged...
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
```

Update the file's final `export` statement to include `angularSeparation, isCombust` alongside the existing exports.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/taskMuhurtaCalculator.test.js`
Expected: PASS (all existing tests plus the 16 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/taskMuhurtaCalculator.js test/taskMuhurtaCalculator.test.js
git commit -m "feat: add isCombust/angularSeparation and griha-pravesh TASK_RULES entry"
```

---

### Task 3: Wire combustion into `snapshotPanchangaAtSunrise` + validator + route

**Files:**
- Modify: `src/taskMuhurtaCalculator.js`
- Modify: `src/validators/taskMuhurtaInput.js`
- Modify: `test/taskMuhurtaCalculator.test.js`
- Modify: `test/routes/muhurtaTaskSearch.route.test.js`

**Interfaces:**
- Consumes from Task 1: `computePlanetSpeed`. From Task 2: `isCombust`, `TASK_RULES['griha-pravesh']`.
- Produces: `snapshotPanchangaAtSunrise` now includes `venusCombust`/`jupiterCombust` in its returned object for every task type (computed unconditionally — cheap, no new network calls). `griha-pravesh` accepted by the validator.

- [ ] **Step 1: Write the failing tests**

Append to `test/taskMuhurtaCalculator.test.js`:

```js
describe('snapshotPanchangaAtSunrise includes combustion data', () => {
  it('includes venusCombust and jupiterCombust booleans', async () => {
    const snapshot = await snapshotPanchangaAtSunrise('2026-08-01', 27.7172, 85.3240, 'Asia/Kathmandu');
    expect(typeof snapshot.venusCombust).toBe('boolean');
    expect(typeof snapshot.jupiterCombust).toBe('boolean');
  }, 30000);
});

describe('computeDailyScore — griha-pravesh live integration (Kathmandu)', () => {
  it('flags Jupiter combust on 2026-08-01 (verified: Jupiter ~1.83 deg from Sun, well under its 11 deg orb)', async () => {
    const result = await computeDailyScore('2026-08-01', 27.7172, 85.3240, 'Asia/Kathmandu', TASK_RULES['griha-pravesh']);
    expect(result.checks.find((c) => c.name === 'Combustion').pass).toBe(false);
  }, 30000);

  it('does not flag combustion on 2026-08-14 (verified: Jupiter ~11.42 deg from Sun, just over its 11 deg orb)', async () => {
    const result = await computeDailyScore('2026-08-14', 27.7172, 85.3240, 'Asia/Kathmandu', TASK_RULES['griha-pravesh']);
    expect(result.checks.find((c) => c.name === 'Combustion').pass).toBe(true);
  }, 30000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `EPHEMERIS_SERVICE_URL=<your live ephemeris URL> EPHEMERIS_SERVICE_API_KEY=<copy from .env> npx vitest run test/taskMuhurtaCalculator.test.js`
Expected: FAIL — `snapshot.venusCombust`/`jupiterCombust` are `undefined` (the field doesn't exist in `snapshotPanchangaAtSunrise`'s return yet). Note: this task's live tests require the sibling `kundali-ephemeris-service` plan to be deployed (exposing `planetSpeeds`) — if it isn't yet, these specific tests will fail with a different error (missing `planetSpeeds` in the HTTP response) rather than the expected `undefined` field error; deploy that sibling plan first if so.

- [ ] **Step 3: Implement in `src/taskMuhurtaCalculator.js`**

Add the import for `computePlanetSpeed` and `isCombust` at the top (extend the existing `swissephService.js` import):
```js
import { getSwe, computeJulianDay, computePlanetLongitude, computePlanetSpeed } from './swissephService.js';
```

Modify `snapshotPanchangaAtSunrise`:
```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `EPHEMERIS_SERVICE_URL=<your live ephemeris URL> EPHEMERIS_SERVICE_API_KEY=<copy from .env> npx vitest run test/taskMuhurtaCalculator.test.js`
Expected: PASS (all tests including the 3 new live-integration ones)

- [ ] **Step 5: Write the failing validator/route tests**

Read `src/validators/taskMuhurtaInput.js` and `test/routes/muhurtaTaskSearch.route.test.js` first. Append to the route test file:

```js
  it('accepts griha-pravesh as a valid task', async () => {
    const app = createApp();
    const response = await request(app).get('/api/muhurta/task-search').query({
      task: 'griha-pravesh', from: '2026-08-01', to: '2026-08-01', latitude: 27.7172, longitude: 85.3240, timezone: 'Asia/Kathmandu',
    });
    expect(response.status).toBe(200);
    expect(response.body.windows[0].checks.some((c) => c.name === 'Combustion')).toBe(true);
  }, 30000);
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `EPHEMERIS_SERVICE_URL=<your live ephemeris URL> EPHEMERIS_SERVICE_API_KEY=<copy from .env> npx vitest run test/routes/muhurtaTaskSearch.route.test.js`
Expected: FAIL — 400, `task must be one of: marriage, business, travel` (validator doesn't accept `griha-pravesh` yet).

- [ ] **Step 7: Implement in `src/validators/taskMuhurtaInput.js`**

Change:
```js
const VALID_TASKS = ['marriage', 'business', 'travel'];
```
to:
```js
const VALID_TASKS = ['marriage', 'business', 'travel', 'griha-pravesh'];
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `EPHEMERIS_SERVICE_URL=<your live ephemeris URL> EPHEMERIS_SERVICE_API_KEY=<copy from .env> npx vitest run test/routes/muhurtaTaskSearch.route.test.js`
Expected: PASS (all tests including the new one)

- [ ] **Step 9: Run the full test suite**

Run: `EPHEMERIS_SERVICE_URL=<your live ephemeris URL> EPHEMERIS_SERVICE_API_KEY=<copy from .env> npx vitest run`
Expected: PASS for all tests except the 7 pre-existing, unrelated DB-connection failures (no test database available in sandboxed environments).

- [ ] **Step 10: Commit**

```bash
git add src/taskMuhurtaCalculator.js src/validators/taskMuhurtaInput.js test/taskMuhurtaCalculator.test.js test/routes/muhurtaTaskSearch.route.test.js
git commit -m "feat: wire combustion check into snapshotPanchangaAtSunrise, accept griha-pravesh in validator"
```

## Self-Review Notes

- **Spec coverage:** combustion orbs (Venus 10/8, Jupiter 11) ✅ (Task 2), boundary-exclusive comparison ✅ (Task 2's boundary tests), 360°/0° wrap ✅ (Task 2's `angularSeparation` test), either-planet-combust logic ✅ (`!venusCombust && !jupiterCombust`), `requiresCombustionCheck` gates the 6th check so other task types are unaffected ✅ (Task 2's explicit "does NOT add" test), `griha-pravesh` nakshatra/weekday rules ✅ (Task 2), validator accepts the new task ✅ (Task 3), live-verified real combust/non-combust dates ✅ (Task 3).
- **No placeholders:** all steps contain full code and concrete, pre-verified test constants and dates (computed directly against real `swisseph-wasm` output while writing this plan).
- **Type consistency:** `computePlanetSpeed`'s signature matches between Task 1's definition and Task 3's usage. `isCombust`'s signature matches between Task 2's definition/tests and Task 3's usage in `snapshotPanchangaAtSunrise`. `scoreDay`'s extended snapshot shape (`+venusCombust, +jupiterCombust`) is consistent between Task 2's tests and Task 3's real data wiring.
- **Cross-repo dependency:** Tasks 1-2 need no live ephemeris service at all (Task 1 mocks the HTTP response, Task 2 is pure logic). Only Task 3's `snapshotPanchangaAtSunrise`/live-integration/route tests need the sibling `kundali-ephemeris-service` plan's `planetSpeeds` field deployed — flagged explicitly in Task 3's steps.
