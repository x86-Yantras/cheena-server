# Shubh Samaya (Muhurta) — Tier 1 + Choghadiya — Design

## Source

Full feature spec: `/home/deathstar/x86/cheena/subha.md` (repo-external, written by the
user). This design implements the **Foundation + Tier 1 + Tier 1.5 (Choghadiya)**
sections of that spec only. Tier 2 (task-specific muhurta) is explicitly out of scope —
the source spec itself calls it out as "do later."

## Scope for this round

- Foundation: sunrise/sunset via `swe_rise_trans`, Hindu-rising convention.
- Tier 1 inauspicious: Rahu Kaal, Yamaganda, Gulika Kaal, Bhadra (Vishti Karana).
- Tier 1 auspicious: Abhijit Muhurta, Brahma Muhurta.
- Tier 1.5: Choghadiya (day + night).
- Backend only — no frontend UI in this round.
- Altitude defaults to `0` (sea level) for every location. Wiring a real
  location→altitude lookup is separate, larger work (needs an elevation data
  source) and is explicitly deferred.

## Repos touched

This feature spans two independently-versioned git repos:

- `kundali-ephemeris-service` — new endpoint, owns the `swisseph-wasm` dependency.
- `kundali-backend` — new calculator module, new HTTP client, new route. This spec
  document lives here since this is where the feature's orchestration and business
  logic live; the ephemeris-service change is a small, focused addition to an
  existing pattern (see below).

## 1. `kundali-ephemeris-service`: new `POST /v1/sunrise-sunset` endpoint

New route file `src/routes/sunriseSunset.js`, wired in `src/app.js` alongside the
existing `ephemerisRouter`, protected by the same `requireApiKey` middleware.

Request body: `{ date: "YYYY-MM-DD", latitude, longitude, altitude?: number, timezone?: string }`.
`altitude` defaults to `0` if omitted. `timezone` defaults via `tzlookup(latitude, longitude)`
exactly like `resolveUtc` in `src/ephemerisService.js` already does.

New function `computeSunriseSunset({ date, latitude, longitude, altitude = 0, timezone })`
in a new `src/sunriseSunsetService.js` (kept separate from `ephemerisService.js` since it
doesn't need houses/planets — a different `swe` call shape):

```js
import { getSwe, resolveUtc } from './ephemerisService.js'; // reuse getSwe + resolveUtc if exported, or duplicate resolveUtc's small body — see note below
```

Note: `getSwe` and `resolveUtc` are not currently exported from `ephemerisService.js`
(only `computeEphemeris` is). Export both from `ephemerisService.js` and import them
here rather than duplicating — `resolveUtc` is copy-identical in `swissephService.js`
on the backend side already, so this repo should not grow a second copy too.

Computation:

```js
const HINDU_RISING_FLAGS = 256 | 512 | 128; // SE_BIT_DISC_CENTER | SE_BIT_NO_REFRACTION | SE_BIT_GEOCTR_NO_ECL_LAT

async function computeSunriseSunset({ date, latitude, longitude, altitude = 0, timezone }) {
  const swe = await getSwe();
  // Julian day for LOCAL MIDNIGHT in UT, per the source spec's foundation section.
  const localMidnightUtc = resolveUtc(date, '00:00', latitude, longitude, timezone);
  const hourDecimal = localMidnightUtc.hour + localMidnightUtc.minute / 60;
  const jdStartOfDayUt = swe.julday(localMidnightUtc.year, localMidnightUtc.month, localMidnightUtc.day, hourDecimal);

  const geopos = [longitude, latitude, altitude];
  const riseResult = swe.rise_trans(jdStartOfDayUt, swe.SE_SUN, '', swe.SEFLG_SWIEPH, swe.SE_CALC_RISE | HINDU_RISING_FLAGS, geopos, 1013.25, 15);
  const setResult = swe.rise_trans(jdStartOfDayUt, swe.SE_SUN, '', swe.SEFLG_SWIEPH, swe.SE_CALC_SET | HINDU_RISING_FLAGS, geopos, 1013.25, 15);

  if (!riseResult || !setResult) {
    throw new Error('Sun does not rise or set at this location/date (polar condition) — not expected for supported latitudes');
  }

  // rise_trans returns Julian Day UT of the event; convert back to local time.
  const zone = timezone || tzlookup(latitude, longitude);
  const sunriseLocal = julianDayToLocal(riseResult[0], zone);
  const sunsetLocal = julianDayToLocal(setResult[0], zone);

  return {
    sunrise: sunriseLocal.toFormat('HH:mm'),
    sunset: sunsetLocal.toFormat('HH:mm'),
  };
}
```

`julianDayToLocal(jd, zone)` is a new small helper: convert JD back to a Luxon
`DateTime` in UTC (`swe.revjul` gives calendar UT components), then `.setZone(zone)`.
Check `swisseph-wasm`'s `revjul` signature before implementing — it's the standard
inverse of `julday` in this library and should already be bound (used nowhere yet in
this repo, so this is this feature's first caller).

`atpress`/`attemp` (1013.25 hPa, 15°C) are standard atmosphere — the spec doesn't
call for weather-adjusted refraction, and standard atmosphere is what "Hindu rising"
conventionally assumes.

Response: `{ sunrise: "05:40", sunset: "19:18" }` (local time, `HH:mm`).

Error handling: if `rise_trans` returns `null` (polar non-rise/set condition), return
HTTP 400 with a clear error message — the spec notes this isn't a real concern for
Nepal but the code must not crash on it.

## 2. `kundali-backend`: new `sunTimesService.js`

New file `src/sunTimesService.js`, mirrors the existing HTTP-client pattern in
`src/swissephService.js`'s `computeJulianDay`:

```js
async function computeSunriseSunset(dateStr, latitude, longitude, timezone) {
  const response = await fetch(`${process.env.EPHEMERIS_SERVICE_URL}/v1/sunrise-sunset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.EPHEMERIS_SERVICE_API_KEY,
    },
    body: JSON.stringify({ date: dateStr, latitude, longitude, timezone }), // altitude omitted -> service defaults to 0
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
  return { sunrise: body.sunrise, sunset: body.sunset }; // "HH:mm" strings, local time
}

export { computeSunriseSunset };
```

No caching needed here (unlike `computeJulianDay`) — sunrise/sunset for a given
date+location is trivially cheap to recompute and this isn't called in a tight loop
the way planet longitude lookups are.

## 3. `kundali-backend`: new `src/muhurtaCalculator.js`

Pure functions, no I/O (matches `panchangCalculator.js`/`dashaCalculator.js` style).
Times are represented as **minutes since local midnight** internally (a plain number)
for arithmetic, converted to `"HH:mm"` strings only at the API boundary — this avoids
re-deriving a time-formatting helper; reuse the `formatMinutesAsHHmm`-style logic
already proven in `kundali-frontend/src/sunTimes.js` (port the function, don't import
across repos — these are separate deployables).

`muhurtaCalculator.js` needs `import { DateTime } from 'luxon';` and
`import tzlookup from 'tz-lookup';` (both already dependencies of this repo, used
the same way in `swissephService.js`) for weekday derivation and next-day-date math
in the orchestrator below.

```js
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
// computeYamaganda, computeGulikaKaal: identical shape, different index table + name.

function computeAbhijitMuhurta(weekday, sunriseMin, sunsetMin) {
  const window = dayPartWindow(sunriseMin, sunsetMin, 8, 15);
  const note = weekday === 'wednesday' ? 'Traditionally considered weak/void on Wednesdays' : undefined;
  return { name: 'Abhijit Muhurta', ...window, type: 'auspicious', ...(note ? { note } : {}) };
}

function computeBrahmaMuhurta(sunriseMin) {
  return { name: 'Brahma Muhurta', start: sunriseMin - 96, end: sunriseMin - 48, type: 'auspicious' };
}
```

`weekday` is derived from `date` using Luxon (`DateTime.fromISO(date, { zone }).weekdayLong.toLowerCase()`
mapped through a small lookup, since Luxon's weekday numbering starts Monday=1 —
don't assume JS `Date.getDay()`'s Sunday=0 lines up without checking).

### Choghadiya

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

function computeChoghadiya(weekday, sunriseMin, sunsetMin, nextSunriseMin) {
  const dayNames = choghadiyaSequence(DAY_START_CHOGHADIYA[weekday], 8);
  const daySlots = dayNames.map((name, i) => {
    const w = dayPartWindow(sunriseMin, sunsetMin, i + 1, 8);
    return { name, ...w, nature: CHOGHADIYA_NATURE[name], lord: CHOGHADIYA_LORD[name] };
  });
  // Night continues the cycle from where day left off (per source spec).
  const nightNames = choghadiyaSequence(CHOGHADIYA_CYCLE[(CHOGHADIYA_CYCLE.indexOf(dayNames[7]) + 1) % 7], 8);
  const nightSlots = nightNames.map((name, i) => {
    const w = dayPartWindow(sunsetMin, nextSunriseMin, i + 1, 8);
    return { name, ...w, nature: CHOGHADIYA_NATURE[name], lord: CHOGHADIYA_LORD[name] };
  });
  return { day: daySlots, night: nightSlots };
}
```

**Known gap, carried forward from the source spec:** there is no numeric reference
value for Choghadiya in `subha.md` (only the rules). Tests verify internal
consistency (correct weekday-start label, correct rotation order, 8 slots each for
day/night, day/night boundary continuity) — not agreement with a published panchanga.
The source spec itself flags this as needing manual verification "before shipping";
that manual verification is not done as part of this implementation and should
happen before this feature is user-facing.

### Bhadra (Vishti Karana) — time-search

Needs Sun/Moon longitude at arbitrary timestamps during the day, which requires a
full ephemeris call (not just sunrise/sunset). Reuses the existing
`swissephService.js` (`computeJulianDay` + `computePlanetLongitude`) exactly as
`kundaliCalculator.js` already does — this is the one piece of the feature that
talks to the *existing* `/v1/ephemeris` endpoint, not the new one.

```js
import { computeJulianDay, computePlanetLongitude } from './swissephService.js';
import { computePanchang } from './panchangCalculator.js';

async function karanaIndexAt(dateStr, timeStr, latitude, longitude, timezone) {
  const jd = await computeJulianDay(dateStr, timeStr, latitude, longitude, timezone);
  const sunLongitude = await computePlanetLongitude(jd, 'SUN');
  const moonLongitude = await computePlanetLongitude(jd, 'MOON');
  return computePanchang({ sunLongitude, moonLongitude }).karana.karanaHalfIndex;
}

const VISHTI_KARANA_NAME = 'Vishti';

async function computeBhadraWindows(dateStr, sunriseMin, sunsetMin, latitude, longitude, timezone) {
  const startIndex = await karanaIndexAt(dateStr, formatMinutes(sunriseMin), latitude, longitude, timezone);
  const endIndex = await karanaIndexAt(dateStr, formatMinutes(sunsetMin), latitude, longitude, timezone);

  // Build the full list of segment boundaries: sunrise, every karana-index
  // crossing in between (in ascending time order), then sunset. Elongation
  // increases monotonically over the day (~0.5deg/hr), so indices only ever
  // increase from startIndex to endIndex — one crossing per intermediate
  // boundary, found by bisection.
  const boundaries = [sunriseMin];
  for (let boundary = startIndex + 1; boundary <= endIndex; boundary++) {
    const crossingMin = await binarySearchKaranaCrossing(dateStr, boundaries[boundaries.length - 1], sunsetMin, boundary, latitude, longitude, timezone);
    boundaries.push(crossingMin);
  }
  boundaries.push(sunsetMin);

  // Segment i runs from boundaries[i] to boundaries[i+1] and has karana index
  // (startIndex + i) — there are exactly (endIndex - startIndex + 1) segments,
  // matching boundaries.length - 1.
  const windows = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const segmentIndex = startIndex + i;
    if (karanaNameForIndex(segmentIndex) === VISHTI_KARANA_NAME) {
      windows.push({ name: 'Bhadra (Vishti Karana)', start: boundaries[i], end: boundaries[i + 1], type: 'inauspicious' });
    }
  }
  return windows;
}
```

`karanaNameForIndex` needs to be exported from `panchangCalculator.js` (currently
module-private) — add it to that file's exports, don't duplicate the lookup table.

`binarySearchKaranaCrossing` — standard bisection: narrow `[loMin, hiMin]` (starting
at `[sunriseMin, sunsetMin]` or the previous crossing) until the karana index changes
exactly at the midpoint within a 1-minute tolerance, calling `karanaIndexAt` at the
midpoint each iteration (≤ ~12 ephemeris calls per crossing, ~1-2 crossings/day —
cheap enough given `computeJulianDay`'s existing per-jd caching).

**Scoped to daytime only** (sunrise→sunset) — nighttime Bhadra is real astrologically
but the `DailyPeriods` output shape below has no field for it, and adding one is out
of scope for this round.

### Orchestrator

```js
async function computeDailyPeriods(dateStr, latitude, longitude, timezone) {
  const { sunrise, sunset } = await computeSunriseSunset(dateStr, latitude, longitude, timezone);
  const nextDateStr = DateTime.fromISO(dateStr, { zone: timezone || tzlookup(latitude, longitude) }).plus({ days: 1 }).toISODate();
  const { sunrise: nextSunrise } = await computeSunriseSunset(nextDateStr, latitude, longitude, timezone);

  const sunriseMin = parseHHmm(sunrise);
  const sunsetMin = parseHHmm(sunset);
  const nextSunriseMin = parseHHmm(nextSunrise) + 1440; // next-day offset for night-window math

  const zone = timezone || tzlookup(latitude, longitude);
  const localDate = DateTime.fromISO(dateStr, { zone });
  // Luxon's weekday is 1=Monday..7=Sunday; index into WEEKDAYS (0=sunday) with % 7.
  const weekday = WEEKDAYS[localDate.weekday % 7];

  const inauspicious = [
    formatWindow(computeRahuKaal(weekday, sunriseMin, sunsetMin)),
    formatWindow(computeYamaganda(weekday, sunriseMin, sunsetMin)),
    formatWindow(computeGulikaKaal(weekday, sunriseMin, sunsetMin)),
    ...(await computeBhadraWindows(dateStr, sunriseMin, sunsetMin, latitude, longitude, timezone)).map(formatWindow),
  ];
  const auspicious = [
    formatWindow(computeAbhijitMuhurta(weekday, sunriseMin, sunsetMin)),
    formatWindow(computeBrahmaMuhurta(sunriseMin)),
  ];
  const choghadiya = computeChoghadiya(weekday, sunriseMin, sunsetMin, nextSunriseMin);

  return {
    date: dateStr,
    weekday,
    sunrise,
    sunset,
    dayDuration: formatDuration(sunsetMin - sunriseMin), // "13h 38m", new small helper
    inauspicious,
    auspicious,
    choghadiya: {
      day: choghadiya.day.map(formatChoghadiyaSlot),
      night: choghadiya.night.map(formatChoghadiyaSlot),
    },
  };
}
```

`formatWindow`/`formatChoghadiyaSlot` convert the internal minute-based `start`/`end`
to `"HH:mm"` strings (via `formatMinutes`) at the boundary — matches the
`TimeWindow`/`Choghadiya` shapes in `subha.md`.

## 4. `kundali-backend`: new route

New `src/validators/muhurtaInput.js` (validates `date`, `latitude`, `longitude`,
optional `timezone` — mirrors `validators/kundaliInput.js`'s style).

New `src/routes/muhurta.js`:

```js
router.get('/', async (req, res, next) => {
  const errors = validateMuhurtaInput(req.query);
  if (errors.length > 0) {
    res.status(400).json({ error: errors.join('; ') });
    return;
  }
  try {
    const result = await computeDailyPeriods(req.query.date, Number(req.query.latitude), Number(req.query.longitude), req.query.timezone);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
```

Wired in `src/app.js`: `app.use('/api/muhurta', muhurtaRouter);`.

## Testing

- **Regression lock (foundation):** Baitadi (29.588806, 80.452122), 2026-07-27,
  altitude=0. Test asserts sunrise/sunset against values computed fresh by the new
  code at altitude=0 (captured once as the test's expected constants during
  implementation) — **not** the spec's altitude-1600m reference numbers (05:40/19:18),
  since those were computed at a different altitude and won't match exactly. Document
  in the test file's comment why the constants differ from `subha.md`'s reference.
- **Rahu Kaal / Abhijit:** same caveat — derive expected values from the
  freshly-computed sunrise/sunset at altitude=0, apply the spec's formulas by hand
  to get expected constants, don't copy `subha.md`'s numbers verbatim.
- **Weekday tables:** unit test every weekday index for Rahu Kaal/Yamaganda/Gulika
  against the spec's tables directly (these have no altitude dependency).
- **Choghadiya:** unit test rotation order and weekday-start table against the spec's
  tables directly; unit test day/night boundary continuity (night's first slot
  continues the cycle from day's last slot). No external ground-truth check (known
  gap, documented above).
- **Bhadra:** unit test `karanaNameForIndex` boundary logic and the binary-search
  convergence (e.g. a synthetic monotonic function crossing a threshold) without
  needing a live ephemeris call; one integration-style test against the real
  `swissephService`/`panchangCalculator` for a date/location known to contain a
  Vishti transition during daylight (find one during implementation).
- **API-level:** one integration test per new endpoint/route (`POST /v1/sunrise-sunset`,
  `GET /api/muhurta`) checking shape and a 400 on invalid input, following the
  existing `test/routes/*.test.js` and `kundali-ephemeris-service/test/*.test.js`
  conventions.

## Out of scope (explicit)

- Frontend UI for any of this.
- Tier 2 (task-specific muhurta).
- Real altitude lookup (location→elevation data source).
- Godhuli/Amrit Kaal (spec marks these "optional, add later").
- Nighttime Bhadra.
- External validation of Choghadiya against a published panchanga (manual step,
  not part of this implementation).
