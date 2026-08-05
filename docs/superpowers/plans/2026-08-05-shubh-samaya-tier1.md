# Shubh Samaya (Muhurta) Tier 1 + Choghadiya Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Tier 1 (Rahu Kaal, Yamaganda, Gulika Kaal, Bhadra, Abhijit Muhurta, Brahma Muhurta) and Tier 1.5 (Choghadiya) of the Shubh Samaya feature, exposed as `GET /api/muhurta`.

**Architecture:** A new `src/sunTimesService.js` (HTTP client to the `kundali-ephemeris-service`'s new `/v1/sunrise-sunset` endpoint — see the sibling repo's plan `kundali-ephemeris-service/docs/superpowers/plans/2026-08-05-sunrise-sunset-endpoint.md`, which must land first). A new `src/muhurtaCalculator.js` (pure functions, mirrors `panchangCalculator.js`'s style) holding all the day-part math, Choghadiya rotation, and a karana-crossing time-search for Bhadra (reusing the existing `swissephService.js` + `panchangCalculator.js`). A new `src/validators/muhurtaInput.js` and `src/routes/muhurta.js` wired into `src/app.js`.

**Tech Stack:** Node.js, Express, Luxon, Vitest, Supertest (all already dependencies — no new packages).

**Dependency:** This plan assumes `kundali-ephemeris-service`'s `POST /v1/sunrise-sunset` endpoint is already deployed and reachable at `process.env.EPHEMERIS_SERVICE_URL`. Task 1 mocks it in tests (same pattern as `swissephService.js`'s tests), so implementation can proceed without a live deployment, but Task 5's full end-to-end manual smoke check needs it live.

## Global Constraints

- Altitude is not passed by this feature — `sunTimesService.js` omits it from the request body, letting the ephemeris service default to `0`.
- Bhadra (Vishti Karana) windows are scoped to **daytime only** (sunrise→sunset). Nighttime Bhadra is out of scope — the `DailyPeriods` output shape has no field for it.
- Choghadiya has no external numeric ground-truth in the source spec (`/home/deathstar/x86/cheena/subha.md`) — only rules. Tests verify internal consistency (rotation order, weekday-start table, day/night boundary continuity), not agreement with a published panchanga. This is a known, accepted gap — do not invent a "verified reference" for Choghadiya that doesn't exist.
- Verified reference for everything else (computed directly with this feature's exact formulas — see each task): Baitadi (29.588806, 80.452122), Monday 2026-07-27, `Asia/Kathmandu`, altitude 0 → sunrise **05:44**, sunset **19:15**, next-day (2026-07-28) sunrise **05:44**.
- Times are represented as **minutes since local midnight** (plain numbers) internally for arithmetic; converted to `"HH:mm"` strings only at each function's public boundary.

---

### Task 1: `sunTimesService.js` — HTTP client for the ephemeris service

**Files:**
- Create: `src/sunTimesService.js`
- Test: `test/sunTimesService.test.js`

**Interfaces:**
- Produces: `computeSunriseSunset(dateStr, latitude, longitude, timezone) => Promise<{ sunrise: string, sunset: string }>` (both `"HH:mm"`). Consumed by Task 5's orchestrator.
- Consumes: `process.env.EPHEMERIS_SERVICE_URL`, `process.env.EPHEMERIS_SERVICE_API_KEY` (both already set for `swissephService.js`'s existing calls — no new env vars).

- [ ] **Step 1: Write the failing test**

```js
// test/sunTimesService.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeSunriseSunset } from '../src/sunTimesService.js';

describe('sunTimesService (HTTP client)', () => {
  let fetchMock;

  beforeEach(() => {
    process.env.EPHEMERIS_SERVICE_URL = 'http://ephemeris.test';
    process.env.EPHEMERIS_SERVICE_API_KEY = 'test-api-key';
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sunrise: '05:44', sunset: '19:15' }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('POSTs to EPHEMERIS_SERVICE_URL/v1/sunrise-sunset with the API key header and returns sunrise/sunset', async () => {
    const result = await computeSunriseSunset('2026-07-27', 29.588806, 80.452122, 'Asia/Kathmandu');
    expect(result).toEqual({ sunrise: '05:44', sunset: '19:15' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://ephemeris.test/v1/sunrise-sunset',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-API-Key': 'test-api-key',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          date: '2026-07-27',
          latitude: 29.588806,
          longitude: 80.452122,
          timezone: 'Asia/Kathmandu',
        }),
      }),
    );
  });

  it('throws a clear error when the service responds with a non-2xx status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid date/time/timezone: bad zone' }),
    });
    await expect(
      computeSunriseSunset('2026-07-27', 29.588806, 80.452122, 'Not/AZone'),
    ).rejects.toThrow(/invalid/i);
  });

  it('throws a clear error when the service responds with an unparsable body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); },
    });
    await expect(
      computeSunriseSunset('2026-07-27', 29.588806, 80.452122, 'Asia/Kathmandu'),
    ).rejects.toThrow(/502/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/sunTimesService.test.js`
Expected: FAIL — `Cannot find module '../src/sunTimesService.js'`.

- [ ] **Step 3: Implement `src/sunTimesService.js`**

```js
async function computeSunriseSunset(dateStr, latitude, longitude, timezone) {
  const response = await fetch(`${process.env.EPHEMERIS_SERVICE_URL}/v1/sunrise-sunset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.EPHEMERIS_SERVICE_API_KEY,
    },
    body: JSON.stringify({ date: dateStr, latitude, longitude, timezone }),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Ephemeris service returned ${response.status} with an unparsable body`);
  }
  if (!response.ok) {
    throw new Error(body.error || `Ephemeris service returned ${response.status}`);
  }
  return { sunrise: body.sunrise, sunset: body.sunset };
}

export { computeSunriseSunset };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/sunTimesService.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/sunTimesService.js test/sunTimesService.test.js
git commit -m "feat: add sunTimesService HTTP client for the ephemeris service's sunrise-sunset endpoint"
```

---

### Task 2: `muhurtaCalculator.js` — foundation helpers + weekday-math periods

**Files:**
- Create: `src/muhurtaCalculator.js`
- Test: `test/muhurtaCalculator.test.js`

**Interfaces:**
- Produces: `parseHHmm(hhmm) => number` (minutes since midnight), `formatMinutes(totalMinutes) => string` (`"HH:mm"`, wraps mod 1440), `weekdayFromDate(dateStr, latitude, longitude, timezone) => string` (lowercase English weekday name; `latitude`/`longitude` are only used as a `tzlookup` fallback when `timezone` is omitted), `computeRahuKaal/computeYamaganda/computeGulikaKaal(weekday, sunriseMin, sunsetMin) => TimeWindow`, `computeAbhijitMuhurta(weekday, sunriseMin, sunsetMin) => TimeWindow`, `computeBrahmaMuhurta(sunriseMin) => TimeWindow`, where `TimeWindow = { name, start, end, type, note? }` with `start`/`end` as **raw minute numbers** (not yet formatted — formatting happens in the Task 5 orchestrator, matching the source spec's `TimeWindow` interface which wants `"HH:mm"` strings at the *API* boundary, not inside the calculator).
- Consumes: nothing (pure, no I/O). `luxon` and `tz-lookup` for `weekdayFromDate`.

- [ ] **Step 1: Write the failing tests**

```js
// test/muhurtaCalculator.test.js
import { describe, it, expect } from 'vitest';
import {
  parseHHmm, formatMinutes, weekdayFromDate,
  computeRahuKaal, computeYamaganda, computeGulikaKaal,
  computeAbhijitMuhurta, computeBrahmaMuhurta,
} from '../src/muhurtaCalculator.js';

// Verified reference: Baitadi (29.588806, 80.452122), Monday 2026-07-27,
// Asia/Kathmandu, altitude 0 -> sunrise 05:44, sunset 19:15.
const SUNRISE_MIN = parseHHmm('05:44'); // 344
const SUNSET_MIN = parseHHmm('19:15'); // 1155

describe('parseHHmm / formatMinutes', () => {
  it('parseHHmm converts "HH:mm" to minutes since midnight', () => {
    expect(parseHHmm('05:44')).toBe(344);
    expect(parseHHmm('19:15')).toBe(1155);
    expect(parseHHmm('00:00')).toBe(0);
  });

  it('formatMinutes converts minutes back to "HH:mm", wrapping negative/overflow', () => {
    expect(formatMinutes(344)).toBe('05:44');
    expect(formatMinutes(1155)).toBe('19:15');
    expect(formatMinutes(-56)).toBe('23:04'); // Brahma Muhurta style negative offset
    expect(formatMinutes(1500)).toBe('01:00'); // past midnight
  });
});

describe('weekdayFromDate', () => {
  it('returns "monday" for 2026-07-27 in Asia/Kathmandu', () => {
    expect(weekdayFromDate('2026-07-27', 0, 0, 'Asia/Kathmandu')).toBe('monday');
  });

  it('returns "sunday" for 2026-08-02 in Asia/Kathmandu', () => {
    expect(weekdayFromDate('2026-08-02', 0, 0, 'Asia/Kathmandu')).toBe('sunday');
  });
});

describe('weekday-math periods (Baitadi, Monday 2026-07-27)', () => {
  it('computeRahuKaal returns 07:25-09:07 for Monday (index 2 of 8)', () => {
    const window = computeRahuKaal('monday', SUNRISE_MIN, SUNSET_MIN);
    expect(window.name).toBe('Rahu Kaal');
    expect(window.type).toBe('inauspicious');
    expect(formatMinutes(window.start)).toBe('07:25');
    expect(formatMinutes(window.end)).toBe('09:07');
  });

  it('computeYamaganda returns 10:48-12:30 for Monday (index 4 of 8)', () => {
    const window = computeYamaganda('monday', SUNRISE_MIN, SUNSET_MIN);
    expect(window.name).toBe('Yamaganda');
    expect(formatMinutes(window.start)).toBe('10:48');
    expect(formatMinutes(window.end)).toBe('12:30');
  });

  it('computeGulikaKaal returns 14:11-15:52 for Monday (index 6 of 8)', () => {
    const window = computeGulikaKaal('monday', SUNRISE_MIN, SUNSET_MIN);
    expect(window.name).toBe('Gulika Kaal');
    expect(formatMinutes(window.start)).toBe('14:11');
    expect(formatMinutes(window.end)).toBe('15:52');
  });

  it('computeAbhijitMuhurta returns 12:02-12:57 (8th of 15 parts), no note on a non-Wednesday', () => {
    const window = computeAbhijitMuhurta('monday', SUNRISE_MIN, SUNSET_MIN);
    expect(window.name).toBe('Abhijit Muhurta');
    expect(window.type).toBe('auspicious');
    expect(formatMinutes(window.start)).toBe('12:02');
    expect(formatMinutes(window.end)).toBe('12:57');
    expect(window.note).toBeUndefined();
  });

  it('computeAbhijitMuhurta flags a note on Wednesday', () => {
    const window = computeAbhijitMuhurta('wednesday', SUNRISE_MIN, SUNSET_MIN);
    expect(window.note).toMatch(/weak|void/i);
  });

  it('computeBrahmaMuhurta returns 04:08-04:56 (96/48 min before sunrise)', () => {
    const window = computeBrahmaMuhurta(SUNRISE_MIN);
    expect(window.name).toBe('Brahma Muhurta');
    expect(window.type).toBe('auspicious');
    expect(formatMinutes(window.start)).toBe('04:08');
    expect(formatMinutes(window.end)).toBe('04:56');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/muhurtaCalculator.test.js`
Expected: FAIL — `Cannot find module '../src/muhurtaCalculator.js'`.

- [ ] **Step 3: Implement the foundation + weekday-math parts of `src/muhurtaCalculator.js`**

```js
import { DateTime } from 'luxon';
import tzlookup from 'tz-lookup';

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

export {
  parseHHmm, formatMinutes, weekdayFromDate, dayPartWindow,
  computeRahuKaal, computeYamaganda, computeGulikaKaal,
  computeAbhijitMuhurta, computeBrahmaMuhurta,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/muhurtaCalculator.test.js`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/muhurtaCalculator.js test/muhurtaCalculator.test.js
git commit -m "feat: add muhurtaCalculator foundation helpers and weekday-math periods (Rahu Kaal, Yamaganda, Gulika, Abhijit, Brahma)"
```

---

### Task 3: `muhurtaCalculator.js` — Choghadiya

**Files:**
- Modify: `src/muhurtaCalculator.js`
- Modify: `test/muhurtaCalculator.test.js`

**Interfaces:**
- Consumes from Task 2: `dayPartWindow`, `formatMinutes` (test only).
- Produces: `computeChoghadiya(weekday, sunriseMin, sunsetMin, nextSunriseMin) => { day: ChoghadiyaSlot[], night: ChoghadiyaSlot[] }` where `ChoghadiyaSlot = { name, start, end, nature, lord }` (`start`/`end` as raw minutes, same convention as Task 2). Consumed by Task 5's orchestrator.

- [ ] **Step 1: Write the failing tests**

Append to `test/muhurtaCalculator.test.js`:

```js
import { computeChoghadiya } from '../src/muhurtaCalculator.js'; // add to the existing import line instead of a new import statement

describe('computeChoghadiya (Baitadi, Monday 2026-07-27, next sunrise 05:44)', () => {
  const NEXT_SUNRISE_MIN = parseHHmm('05:44') + 1440; // 2026-07-28

  it('day sequence starts at Amrit (Monday) and follows the fixed rotation', () => {
    const { day } = computeChoghadiya('monday', SUNRISE_MIN, SUNSET_MIN, NEXT_SUNRISE_MIN);
    expect(day.map((slot) => slot.name)).toEqual(['Amrit', 'Kaal', 'Shubh', 'Rog', 'Udveg', 'Chal', 'Labh', 'Amrit']);
    expect(day).toHaveLength(8);
  });

  it('day slot times match the 8-part division of daytime', () => {
    const { day } = computeChoghadiya('monday', SUNRISE_MIN, SUNSET_MIN, NEXT_SUNRISE_MIN);
    expect(formatMinutes(day[0].start)).toBe('05:44');
    expect(formatMinutes(day[0].end)).toBe('07:25');
    expect(formatMinutes(day[7].start)).toBe('17:34');
    expect(formatMinutes(day[7].end)).toBe('19:15');
  });

  it('each slot carries the correct nature and lord', () => {
    const { day } = computeChoghadiya('monday', SUNRISE_MIN, SUNSET_MIN, NEXT_SUNRISE_MIN);
    expect(day[0]).toMatchObject({ name: 'Amrit', nature: 'auspicious', lord: 'Moon' });
    expect(day[3]).toMatchObject({ name: 'Rog', nature: 'inauspicious', lord: 'Mars' });
    expect(day[4]).toMatchObject({ name: 'Udveg', nature: 'inauspicious', lord: 'Sun' });
  });

  it('night sequence continues the rotation from where day left off (Kaal, after day ends on Amrit)', () => {
    const { night } = computeChoghadiya('monday', SUNRISE_MIN, SUNSET_MIN, NEXT_SUNRISE_MIN);
    expect(night.map((slot) => slot.name)).toEqual(['Kaal', 'Shubh', 'Rog', 'Udveg', 'Chal', 'Labh', 'Amrit', 'Kaal']);
    expect(night).toHaveLength(8);
  });

  it('night slot times match the 8-part division of night (sunset to next sunrise), ending exactly at next sunrise', () => {
    const { night } = computeChoghadiya('monday', SUNRISE_MIN, SUNSET_MIN, NEXT_SUNRISE_MIN);
    expect(formatMinutes(night[0].start)).toBe('19:15');
    expect(formatMinutes(night[7].end)).toBe('05:44');
  });

  it('a different weekday starts at a different Choghadiya (Sunday starts at Udveg)', () => {
    const { day } = computeChoghadiya('sunday', SUNRISE_MIN, SUNSET_MIN, NEXT_SUNRISE_MIN);
    expect(day[0].name).toBe('Udveg');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/muhurtaCalculator.test.js`
Expected: FAIL — `computeChoghadiya is not a function` (or not exported).

- [ ] **Step 3: Implement `computeChoghadiya` in `src/muhurtaCalculator.js`**

Add to the file (after the Task 2 functions, before the `export` line — update the `export` line to include the new name):

```js
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
```

Update the file's final `export` statement to:
```js
export {
  parseHHmm, formatMinutes, weekdayFromDate, dayPartWindow,
  computeRahuKaal, computeYamaganda, computeGulikaKaal,
  computeAbhijitMuhurta, computeBrahmaMuhurta, computeChoghadiya,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/muhurtaCalculator.test.js`
Expected: PASS (17 tests)

- [ ] **Step 5: Commit**

```bash
git add src/muhurtaCalculator.js test/muhurtaCalculator.test.js
git commit -m "feat: add Choghadiya day/night computation to muhurtaCalculator"
```

---

### Task 4: `muhurtaCalculator.js` — Bhadra (Vishti Karana) time-search

**Files:**
- Modify: `src/panchangCalculator.js` (export one more name)
- Modify: `src/muhurtaCalculator.js`
- Modify: `test/muhurtaCalculator.test.js`

**Interfaces:**
- Consumes from `src/panchangCalculator.js`: `karanaNameForIndex(karanaHalfIndex) => string` (newly exported — currently module-private).
- Consumes from `src/swissephService.js`: `getSwe()`, `computeJulianDay(dateStr, timeStr, latitude, longitude, timezone)`, `computePlanetLongitude(jd, sweConst)`.
- Produces: `computeBhadraWindows(dateStr, sunriseMin, sunsetMin, latitude, longitude, timezone) => Promise<TimeWindow[]>` (0 or more windows, `TimeWindow` shape matches Task 2's, `name: 'Bhadra (Vishti Karana)'`, `type: 'inauspicious'`). Consumed by Task 5's orchestrator.

- [ ] **Step 1: Export `karanaNameForIndex` from `src/panchangCalculator.js`**

Current last line:
```js
export { computePanchang };
```
Change to:
```js
export { computePanchang, karanaNameForIndex };
```

- [ ] **Step 2: Write the failing tests**

Append to `test/muhurtaCalculator.test.js`. This task needs two kinds of tests: a pure unit test of the boundary-stitching logic (via dependency injection, no real ephemeris calls) and one real integration test against a verified date/location.

```js
import { computeBhadraWindows, _computeBhadraWindowsFromKaranaLookup } from '../src/muhurtaCalculator.js'; // add to existing import

describe('computeBhadraWindows — boundary-stitching logic (pure, injected karana lookup)', () => {
  // _computeBhadraWindowsFromKaranaLookup takes a (timeMin) => Promise<karanaHalfIndex>
  // function directly, so this test doesn't touch the real ephemeris service.
  // karanaHalfIndex 7 is the first Vishti: (7-1) % 7 = 6, and
  // MOVABLE_KARANA_NAMES[6] = 'Vishti'. Indices 14, 21, 28... are Vishti too.

  it('returns no window when the karana index is constant and not Vishti all day', async () => {
    const lookup = async () => 1; // Bava all day
    const windows = await _computeBhadraWindowsFromKaranaLookup(lookup, 300, 1200);
    expect(windows).toEqual([]);
  });

  it('returns one full-day window when the karana index is constant and IS Vishti all day', async () => {
    const lookup = async () => 7; // Vishti all day: (7-1)%7 = 6 = Vishti
    const windows = await _computeBhadraWindowsFromKaranaLookup(lookup, 300, 1200);
    expect(windows).toEqual([{ name: 'Bhadra (Vishti Karana)', start: 300, end: 1200, type: 'inauspicious' }]);
  });

  it('returns a partial window ending at sunset when karana transitions INTO Vishti during the day', async () => {
    // index 6 (Vanija, not Vishti) before minute 750, index 7 (Vishti) from 750 on.
    const lookup = async (min) => (min < 750 ? 6 : 7);
    const windows = await _computeBhadraWindowsFromKaranaLookup(lookup, 300, 1200);
    expect(windows).toHaveLength(1);
    expect(windows[0].name).toBe('Bhadra (Vishti Karana)');
    expect(windows[0].start).toBeCloseTo(750, 0);
    expect(windows[0].end).toBe(1200);
  });

  it('returns a partial window starting at sunrise when karana transitions OUT of Vishti during the day', async () => {
    // index 7 (Vishti) before minute 600, index 8 (Bava again, not Vishti) from 600 on.
    const lookup = async (min) => (min < 600 ? 7 : 8);
    const windows = await _computeBhadraWindowsFromKaranaLookup(lookup, 300, 1200);
    expect(windows).toHaveLength(1);
    expect(windows[0].start).toBe(300);
    expect(windows[0].end).toBeCloseTo(600, 0);
  });
});

describe('computeBhadraWindows — real ephemeris integration (Kathmandu, 2026-08-01)', () => {
  // Verified: at Kathmandu (27.7172, 85.3240), 2026-08-01, altitude 0, sunrise
  // ~05:31 (321min) and sunset ~18:49 (1129min), the karana index goes from
  // 34 (Vanija, not Vishti) at sunrise to 35 (Vishti) at sunset, crossing
  // near 11:08 local (~668min). Computed directly with this repo's
  // swissephService against the real ephemeris service for this plan.
  it('finds the Vishti window ending at sunset on 2026-08-01 in Kathmandu', async () => {
    const sunriseMin = parseHHmm('05:31');
    const sunsetMin = parseHHmm('18:49');
    const windows = await computeBhadraWindows('2026-08-01', sunriseMin, sunsetMin, 27.7172, 85.3240, 'Asia/Kathmandu');
    expect(windows).toHaveLength(1);
    expect(windows[0].name).toBe('Bhadra (Vishti Karana)');
    expect(formatMinutes(windows[0].end)).toBe('18:49');
    const crossingMinutes = windows[0].start;
    expect(Math.abs(crossingMinutes - parseHHmm('11:08'))).toBeLessThan(3); // within 3 min of the pre-verified crossing
  }, 30000);

  it('returns an empty array on a day with no karana transition into/out of Vishti (Baitadi, Monday 2026-07-27)', async () => {
    const windows = await computeBhadraWindows('2026-07-27', SUNRISE_MIN, SUNSET_MIN, 29.588806, 80.452122, 'Asia/Kathmandu');
    // Pre-verified for this plan: karana stays in the 25/26 range (Taitila/Gara)
    // across this day at this location, never touching Vishti.
    expect(windows).toEqual([]);
  }, 30000);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/muhurtaCalculator.test.js`
Expected: FAIL — `computeBhadraWindows`/`_computeBhadraWindowsFromKaranaLookup` not exported.

- [ ] **Step 4: Implement Bhadra logic in `src/muhurtaCalculator.js`**

Add imports at the top of the file:
```js
import { getSwe, computeJulianDay, computePlanetLongitude } from './swissephService.js';
import { computePanchang, karanaNameForIndex } from './panchangCalculator.js';
```

Add after the Choghadiya code:

```js
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
    while (hi - lo > 1) {
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
```

Update the file's final `export` statement to also include `computeBhadraWindows` and `_computeBhadraWindowsFromKaranaLookup`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/muhurtaCalculator.test.js`
Expected: PASS (23 tests). The two integration tests hit the real `kundali-ephemeris-service` (via `swissephService.js` → `computeJulianDay` → `fetch`, unmocked in this test file) — this requires `EPHEMERIS_SERVICE_URL`/`EPHEMERIS_SERVICE_API_KEY` in `.env` pointing at a running instance, same requirement as the pre-existing `test/kundaliCalculator.test.js` already has. If these two tests fail with a connection error rather than an assertion error, the ephemeris service isn't reachable — that's an environment issue, not a code defect; note it in the task report rather than treating it as a fix-loop finding.

- [ ] **Step 6: Commit**

```bash
git add src/panchangCalculator.js src/muhurtaCalculator.js test/muhurtaCalculator.test.js
git commit -m "feat: add Bhadra (Vishti Karana) time-search to muhurtaCalculator"
```

---

### Task 5: Orchestrator, validator, and route

**Files:**
- Modify: `src/muhurtaCalculator.js`
- Create: `src/validators/muhurtaInput.js`
- Create: `src/routes/muhurta.js`
- Modify: `src/app.js`
- Test: `test/muhurtaCalculator.test.js` (orchestrator tests), `test/routes/muhurta.route.test.js`

**Interfaces:**
- Consumes from Tasks 1-4: `computeSunriseSunset` (Task 1), all of `muhurtaCalculator.js`'s exports (Tasks 2-4).
- Produces: `computeDailyPeriods(dateStr, latitude, longitude, timezone) => Promise<DailyPeriods>` matching the source spec's shape, extended with `choghadiya`. Route: `GET /api/muhurta`.

- [ ] **Step 1: Write the failing orchestrator test**

Append to `test/muhurtaCalculator.test.js`:

```js
import { vi } from 'vitest'; // already imported at top if not, add to the existing vitest import
import * as sunTimesService from '../src/sunTimesService.js';
import { computeDailyPeriods } from '../src/muhurtaCalculator.js'; // add to existing import

vi.mock('../src/sunTimesService.js', () => ({
  computeSunriseSunset: vi.fn(),
}));

describe('computeDailyPeriods (orchestrator)', () => {
  it('assembles sunrise/sunset, weekday periods, and choghadiya into the DailyPeriods shape', async () => {
    sunTimesService.computeSunriseSunset
      .mockResolvedValueOnce({ sunrise: '05:44', sunset: '19:15' }) // 2026-07-27
      .mockResolvedValueOnce({ sunrise: '05:44', sunset: '19:16' }); // 2026-07-28 (next day)

    const result = await computeDailyPeriods('2026-07-27', 29.588806, 80.452122, 'Asia/Kathmandu');

    expect(result.date).toBe('2026-07-27');
    expect(result.weekday).toBe('monday');
    expect(result.sunrise).toBe('05:44');
    expect(result.sunset).toBe('19:15');
    expect(result.dayDuration).toBe('13h 31m');

    const inauspiciousNames = result.inauspicious.map((w) => w.name);
    expect(inauspiciousNames).toEqual(expect.arrayContaining(['Rahu Kaal', 'Yamaganda', 'Gulika Kaal']));
    const rahuKaal = result.inauspicious.find((w) => w.name === 'Rahu Kaal');
    expect(rahuKaal.start).toBe('07:25');
    expect(rahuKaal.end).toBe('09:07');

    const auspiciousNames = result.auspicious.map((w) => w.name);
    expect(auspiciousNames).toEqual(['Abhijit Muhurta', 'Brahma Muhurta']);

    expect(result.choghadiya.day).toHaveLength(8);
    expect(result.choghadiya.night).toHaveLength(8);
    expect(result.choghadiya.day[0].start).toBe('05:44'); // formatted as string here, unlike the raw-minute internal shape
  }, 30000); // real Bhadra lookup still hits the live ephemeris service for this date/location
});
```

Note: this test mocks `sunTimesService` but NOT `swissephService`/`panchangCalculator` (used internally by `computeBhadraWindows`), so it still performs 2 real ephemeris calls for the Bhadra check on 2026-07-27 (already verified in Task 4 to return `[]` for this date/location). If a fully-mocked, network-free version of this test is preferred, that's a valid deviation — note it in the implementation report rather than treating the live call as required.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/muhurtaCalculator.test.js`
Expected: FAIL — `computeDailyPeriods` not exported.

- [ ] **Step 3: Implement the orchestrator in `src/muhurtaCalculator.js`**

Add import:
```js
import { computeSunriseSunset } from './sunTimesService.js';
```

Add after the Bhadra code:

```js
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
```

Update the file's final `export` statement to also include `computeDailyPeriods`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/muhurtaCalculator.test.js`
Expected: PASS (24 tests)

- [ ] **Step 5: Write the failing validator + route tests**

```js
// src/validators/muhurtaInput.js — no test file needed on its own; covered via the route test below, matching how validators/kundaliInput.js has no standalone test file either.
```

```js
// test/routes/muhurta.route.test.js
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

vi.mock('../../src/sunTimesService.js', () => ({
  computeSunriseSunset: vi.fn()
    .mockResolvedValueOnce({ sunrise: '05:44', sunset: '19:15' })
    .mockResolvedValueOnce({ sunrise: '05:44', sunset: '19:16' }),
}));

describe('GET /api/muhurta', () => {
  it('returns 400 when latitude is missing', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta').query({ date: '2026-07-27', longitude: 80.452122 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid date format', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta').query({ date: '27-07-2026', latitude: 29.588806, longitude: 80.452122 });
    expect(res.status).toBe(400);
  });

  it('returns a DailyPeriods shape for a valid request', async () => {
    const app = createApp();
    const res = await request(app).get('/api/muhurta').query({
      date: '2026-07-27', latitude: 29.588806, longitude: 80.452122, timezone: 'Asia/Kathmandu',
    });
    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2026-07-27');
    expect(res.body.weekday).toBe('monday');
    expect(Array.isArray(res.body.inauspicious)).toBe(true);
    expect(Array.isArray(res.body.auspicious)).toBe(true);
    expect(res.body.choghadiya.day).toHaveLength(8);
  }, 30000);
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run test/routes/muhurta.route.test.js`
Expected: FAIL — 404 (route doesn't exist yet).

- [ ] **Step 7: Implement `src/validators/muhurtaInput.js`**

```js
import { IANAZone } from 'luxon';

function validateMuhurtaInput(query) {
  const errors = [];
  const { date, latitude, longitude, timezone } = query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.push('date must be in YYYY-MM-DD format');
  }
  const lat = Number(latitude);
  if (latitude === undefined || Number.isNaN(lat) || lat < -90 || lat > 90) {
    errors.push('latitude must be a number between -90 and 90');
  }
  const lon = Number(longitude);
  if (longitude === undefined || Number.isNaN(lon) || lon < -180 || lon > 180) {
    errors.push('longitude must be a number between -180 and 180');
  }
  if (timezone !== undefined && timezone !== null && timezone !== '') {
    if (typeof timezone !== 'string' || !IANAZone.isValidZone(timezone)) {
      errors.push('timezone must be a valid IANA timezone name (e.g. Asia/Kolkata)');
    }
  }
  return errors;
}

export { validateMuhurtaInput };
```

- [ ] **Step 8: Implement `src/routes/muhurta.js`**

```js
import { Router } from 'express';
import { computeDailyPeriods } from '../muhurtaCalculator.js';
import { validateMuhurtaInput } from '../validators/muhurtaInput.js';
import logger from '../logger.js';

const router = Router();

router.get('/', async (req, res, next) => {
  const errors = validateMuhurtaInput(req.query);
  if (errors.length > 0) {
    res.status(400).json({ error: errors.join('; ') });
    return;
  }
  try {
    const result = await computeDailyPeriods(
      req.query.date,
      Number(req.query.latitude),
      Number(req.query.longitude),
      req.query.timezone,
    );
    res.json(result);
  } catch (err) {
    logger.error(err, 'Failed to compute muhurta');
    next(err);
  }
});

export default router;
```

- [ ] **Step 9: Wire the route into `src/app.js`**

Add the import alongside the other route imports:
```js
import muhurtaRouter from './routes/muhurta.js';
```
Add the mount alongside the other `app.use('/api/...')` lines:
```js
app.use('/api/muhurta', muhurtaRouter);
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run test/routes/muhurta.route.test.js`
Expected: PASS (3 tests)

- [ ] **Step 11: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all tests, including every pre-existing test file)

- [ ] **Step 12: Commit**

```bash
git add src/muhurtaCalculator.js src/validators/muhurtaInput.js src/routes/muhurta.js src/app.js test/muhurtaCalculator.test.js test/routes/muhurta.route.test.js
git commit -m "feat: add computeDailyPeriods orchestrator and GET /api/muhurta route"
```

## Self-Review Notes

- **Spec coverage:** Rahu Kaal/Yamaganda/Gulika Kaal ✅ (Task 2, exact weekday tables from the source spec), Abhijit Muhurta + Wednesday note ✅ (Task 2), Brahma Muhurta ✅ (Task 2), Choghadiya day+night with rotation/weekday-start tables ✅ (Task 3, known gap on external validation documented), Bhadra/Vishti time-search ✅ (Task 4, scoped to daytime per the design spec's explicit decision), `DailyPeriods`/`TimeWindow`/`Choghadiya` output shapes ✅ (Task 5 orchestrator), altitude defaults to 0 ✅ (Task 1, omitted from the request body entirely).
- **Type consistency:** `TimeWindow`-shaped objects flow with raw-minute `start`/`end` through Tasks 2-4 and are only formatted to `"HH:mm"` strings in Task 5's `formatWindow`/`formatChoghadiyaSlot` — verified consistent across every task's function signatures. `computeSunriseSunset`'s signature (`dateStr, latitude, longitude, timezone` → `{ sunrise, sunset }`) matches between Task 1's definition and Task 5's usage.
- **No placeholders:** all steps contain full code and concrete, pre-verified test constants (computed directly against this feature's exact algorithm and a real `swisseph-wasm` instance while writing this plan, not copied from the source spec's differently-parameterized reference).
- **Cross-repo dependency:** Task 1 mocks the ephemeris-service HTTP call, so this plan's Tasks 1-3 don't require the sibling plan to be deployed first. Tasks 4-5's integration tests DO make real calls through `swissephService.js` to the *existing* `/v1/ephemeris` endpoint (unaffected by the sibling plan) — they do not depend on the new `/v1/sunrise-sunset` endpoint at all, since Bhadra needs planet longitudes, not sunrise/sunset. Only a live manual smoke-test of `GET /api/muhurta` end-to-end needs the sibling plan's endpoint deployed.
