# Griha Pravesh (Combustion Check) — Design

## Purpose

Add `griha-pravesh` as a fourth task type to Tier 2's `GET
/api/muhurta/task-search`, completing the set of task types the original
Tier 2 spec called for. This was dropped from the original Tier 2 round
because it needs a Venus/Jupiter combustion ("Tara Asta") check that
wasn't computable at the time.

## Correction to the original Tier 2 scoping

The Tier 2 design spec said this needs "heliacal rise/set data" — that was
**wrong**, found while re-researching before starting this work. Combustion
(Tara Asta) in classical Vedic astrology is not a visibility/heliacal-rise
calculation at all — it's a simple angular-separation check between a
planet's longitude and the Sun's longitude, compared against a fixed orb.
Both planets' longitudes are already available from the existing
`/v1/ephemeris` endpoint's `planetLongitudes` — only one new piece of data
is needed: **planet speed** (to know if Venus is retrograde, which changes
its orb). This is a much smaller addition than originally assumed.

## Combustion rule (sourced)

Classical orbs (Brihat Parasara Hora Shastra, cross-referenced against
multiple modern summaries during research — same sourcing standard as the
rest of Tier 2's rule tables, not a direct classical-text citation):

- **Venus:** 10° when direct, 8° when retrograde (speed < 0).
- **Jupiter:** 11° (no retrograde-specific value found in any source
  checked; use 11° regardless of motion direction).

A planet is "combust" when its angular separation from the Sun is less
than its orb. Griha Pravesh should be avoided when **either** Venus or
Jupiter is combust (source: "Entry into New Home should not be done while
Shukra Tara and Guru Tara are Asta / set").

Angular separation must handle the 360°/0° wrap correctly — the shortest
angular distance between two longitudes, not a naive subtraction (e.g.
Sun at 359°, Venus at 2° are 3° apart, not 357°).

## Dependency

This spec depends on the sibling `kundali-ephemeris-service` plan
(`docs/superpowers/specs/2026-08-06-planet-speed-design.md` in that repo)
exposing `planetSpeeds` in `/v1/ephemeris`'s response. That plan's tests
mock nothing real-network-dependent beyond what Tier 1/2 already require,
so this plan's own tests can be written and mostly verified against a
mocked `swissephService` without needing that sibling plan deployed first
— only the live integration test needs it running.

## `src/swissephService.js` changes

Mirror the existing `planetLongitudesCache` pattern exactly for speed:

```js
const planetSpeedsCache = new Map(); // jd -> planetSpeeds
```

In `computeJulianDay`, alongside the existing `planetLongitudesCache.set(...)`:
```js
const { julianDay, ascendantLongitude, planetLongitudes, planetSpeeds, bhavaMadhyas } = body;
planetLongitudesCache.set(julianDay, planetLongitudes);
scheduleEviction(planetLongitudesCache, julianDay);
planetSpeedsCache.set(julianDay, planetSpeeds);
scheduleEviction(planetSpeedsCache, julianDay);
// ... existing ascendant/bhavaMadhyas lines unchanged
```

New accessor, mirroring `computePlanetLongitude` exactly:
```js
async function computePlanetSpeed(jd, sweConst) {
  const cached = planetSpeedsCache.get(jd);
  if (!cached) {
    throw new Error(`No cached ephemeris response for julian day ${jd}. computeJulianDay must be called first.`);
  }
  return cached[sweConst];
}
```

Update the file's export statement to include `computePlanetSpeed`.

## `src/taskMuhurtaCalculator.js` changes

Add the combustion helper (pure, directly testable — no I/O):

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

Add `griha-pravesh` to `TASK_RULES`, with a new `requiresCombustionCheck`
flag distinguishing it from the other 3 task types (which must NOT gain
this check):

```js
const TASK_RULES = {
  marriage: { /* unchanged */ },
  business: { /* unchanged */ },
  travel: { /* unchanged */ },
  'griha-pravesh': {
    nakshatras: ['Rohini', 'Mrigashira', 'Pushya', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Anuradha', 'Uttara Ashadha', 'Uttara Bhadrapada', 'Revati'],
    padaExclusions: {},
    weekdays: ['monday', 'wednesday', 'thursday', 'friday'], // avoid Tuesday
    requiresCombustionCheck: true,
  },
};
```

`scoreDay` gains a 6th, conditional check — only added to the `checks`
array when `taskRules.requiresCombustionCheck` is true, so the other 3
task types' scoring (5 checks, unweighted average) is completely
unaffected:

```js
function scoreDay({ tithi, yoga, karana, nakshatra, weekday, venusCombust, jupiterCombust }, taskRules) {
  const checks = [
    // ...all 5 existing checks, unchanged...
  ];

  if (taskRules.requiresCombustionCheck) {
    checks.push({
      name: 'Combustion',
      pass: !venusCombust && !jupiterCombust,
      passReason: 'Neither Venus nor Jupiter is combust',
      failReason: `${venusCombust ? 'Venus' : ''}${venusCombust && jupiterCombust ? ' and ' : ''}${jupiterCombust ? 'Jupiter' : ''} combust (Tara Asta) — avoid for Griha Pravesh`,
    });
  }

  // ...passed/failed/score/reasons/warnings/checks construction unchanged, still uses checks.length...
}
```

`snapshotPanchangaAtSunrise` needs Venus/Jupiter longitude and speed added
to its returned snapshot (computed unconditionally — it's cheap, the jd is
already fetched and cached, this is just 4 more cache reads, no new
network calls beyond what `computeJulianDay` already makes once per day):

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

Import `computePlanetSpeed` alongside the existing `computePlanetLongitude`
import from `./swissephService.js`.

## `src/validators/taskMuhurtaInput.js` changes

Add `'griha-pravesh'` to `VALID_TASKS`:
```js
const VALID_TASKS = ['marriage', 'business', 'travel', 'griha-pravesh'];
```

## Testing

- `isCombust`/`angularSeparation`: pure unit tests covering the exact orb
  boundaries (boundary is exclusive — "less than orb", so separation
  exactly equal to the orb is NOT combust):
  - Direct Venus (orb 10°): 9° separation → combust; 10° separation → not
    combust; 11° separation → not combust.
  - Retrograde Venus (orb 8°, speed < 0): 7° separation → combust; 8°
    separation → not combust.
  - Jupiter (orb 11°, any speed): 10° separation → combust; 11° separation
    → not combust; 12° separation → not combust.
  - 360°/0° wrap: Sun at 359°, planet at 2° → 3° separation (not 357°) —
    confirms `angularSeparation` takes the shorter arc.
- `scoreDay` with `requiresCombustionCheck: true`: a day where combustion
  fails scores lower (6 checks now) than a day where it passes; a day
  scored WITHOUT `requiresCombustionCheck` (marriage/business/travel)
  never includes a `'Combustion'` entry in `checks`, regardless of what
  `venusCombust`/`jupiterCombust` values are passed in — proving the flag
  genuinely gates the check rather than the snapshot data's mere presence
  being enough to trigger it.
- Route/orchestrator: `griha-pravesh` accepted by the validator, rejected
  before this change (regression-style test confirming the validator
  actually changed).
- Live integration: one real end-to-end test finding an actual
  Venus-or-Jupiter-combust date (search for one the same way the Bhadra
  integration test's date was found in the original Tier 1 plan — scan a
  date range with a small script computing combustion from real ephemeris
  output, pick a verified example) and one verified non-combust date,
  confirming `griha-pravesh` scores differ accordingly.

## Out of scope

- Frontend UI for `griha-pravesh` as a 4th task-type option — the existing
  `MuhurtaScreen.jsx` only has 3 buttons (Marriage/Business/Travel); adding
  a 4th is a separate, small frontend follow-up, not bundled here.
- Any other classical Griha Pravesh rule beyond nakshatra/weekday/
  combustion (e.g. month-based restrictions, Vastu considerations) — out
  of scope per the original Tier 2 spec's scoping to the 5(+1) panchanga
  factors already established.
