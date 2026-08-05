# Shubh Samaya (Muhurta) — Tier 2 Task-Specific Muhurta — Design

## Source

Full feature spec: `/home/deathstar/x86/cheena/subha.md`, "TIER 2 — Task-specific
muhurta" section. This implements a scoped subset of that section.

## Scope for this round

- Task types: **Marriage, Business Start, Travel** only. Griha Pravesh is
  explicitly dropped — its classical rules require a Venus/Jupiter
  combustion ("Tara Asta") check that needs heliacal rise/set data we don't
  compute (only longitude-based positions exist today). Adding Griha Pravesh
  later requires that separate ephemeris capability first.
- Scoring factors: **Tithi, Nakshatra, Yoga, Karana, Vara (weekday)** only.
  Lagna/Hora and Chandra bala/Tara bala are explicitly out of scope — Hora
  needs a new planetary-hour computation and its own unresearched rule
  table; Chandra/Tara bala need the person's natal Moon (a different,
  personalized feature, not a generic date-search).
- Scoring granularity: **one score per calendar day**, using that day's
  sunrise-time panchanga as its representative values — not sub-day time
  slices. Tracking exact tithi/nakshatra/yoga/karana transition times within
  a day (to score finer windows) is a materially bigger feature, closer to a
  full electional-astrology engine, and is out of scope.
- Backend only — no frontend UI in this round.

## Rule tables (sourced; caveat below)

**Important caveat:** these tables are cross-referenced from multiple
published panchanga/muhurat websites (DrikPanchang and others), not read
directly from a classical text (Muhurta Chintamani is a Sanskrit source,
not something web search surfaces verbatim). Where DrikPanchang specifically
published a rule, it's called out; other rows are corroborated across 2+
independent sources during design but not textually cited chapter-and-verse.
This is a reasonable-effort sourcing standard, not a scholarly one — flagged
explicitly so nobody mistakes this for a verified classical citation.

### Marriage

- **Favorable Nakshatras** (source: DrikPanchang's dedicated auspicious-marriage-nakshatra page): Rohini, Mrigashira, Magha, Uttara Phalguni, Hasta, Swati, Anuradha, Mula, Uttara Ashadha, Uttara Bhadrapada, Revati.
- **Pada exclusions:** Magha pada 1, Mula pada 1, Revati pada 4 are excluded even though the nakshatra itself is otherwise favorable.
- **Favorable weekdays:** Monday, Wednesday, Thursday, Friday.

### Business Start

- **Favorable Nakshatras:** Ashwini, Rohini, Pushya, Hasta, Chitra.
- **Favorable weekdays:** Monday, Wednesday, Thursday, Friday, Saturday.
- (Avoiding Amavasya/Bhadra/Rahu Kaal is already covered by the shared Rikta-tithi and Vishti-karana checks below, plus the existing Tier 1 Rahu Kaal data — Tier 2 doesn't need to re-implement Rahu Kaal avoidance, see "Relationship to Tier 1" below.)

### Travel

- **Favorable Nakshatras:** Ashwini, Mrigashira, Pushya, Hasta, Anuradha, Shravana, Revati (no pada exclusions found).
- **Favorable weekdays:** Monday, Wednesday, Thursday, Friday.

### Shared across all three task types

- **Avoid Rikta tithi** (4th, 9th, 14th of each paksha — `tithiInPaksha` values `3`, `8`, `13` in `panchangCalculator.js`'s 0-based indexing).
- **Avoid Vyatipata and Vaidhriti yoga.**
- **Avoid Vishti karana** (reuses the existing `karanaNameForIndex` export from Tier 1).

## Relationship to Tier 1

This does NOT re-implement Rahu Kaal/Yamaganda/Gulika/Bhadra checks — a
day's Tier 2 score is about panchanga-element favorability, independent of
Tier 1's within-day inauspicious windows. A consumer wanting "good day AND
avoid Rahu Kaal at the chosen hour" combines a Tier 2 day recommendation
with a Tier 1 `GET /api/muhurta` call for that specific day — two composable
endpoints, not one that duplicates the other's logic.

## Scoring — `src/taskMuhurtaCalculator.js`

```js
const RIKTA_TITHI_INDICES = [3, 8, 13]; // 0-based tithiInPaksha: Chaturthi, Navami, Chaturdashi
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
```

Note: `NAKSHATRA_NAMES` in `astro-data.js` must use the same spelling as
this table (e.g. "Uttara Phalguni" not "U. Phalguni") — verify exact string
match during implementation, since a silent mismatch would make a nakshatra
check always fail.

```js
function computeDailyScore(dateStr, latitude, longitude, timezone, taskRules) {
  // 1. Get this day's sunrise (reuses Tier 1's sunTimesService).
  // 2. Get Sun/Moon longitude AT sunrise (reuses swissephService, same
  //    pattern as Tier 1's karanaIndexAt).
  // 3. computePanchang({ sunLongitude, moonLongitude }) for tithi/yoga/karana.
  // 4. nakshatraFromLongitude(moonLongitude) for nakshatra + pada (reused
  //    from kundaliCalculator.js — already exported).
  // 5. weekdayFromDate(dateStr, latitude, longitude, timezone) (reused from
  //    muhurtaCalculator.js — already exported).

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

  const passed = checks.filter((c) => c.pass);
  const failed = checks.filter((c) => !c.pass);

  return {
    date: dateStr,
    score: Math.round((passed.length / checks.length) * 100),
    reasons: passed.map((c) => c.passReason),
    warnings: failed.map((c) => c.failReason),
  };
}
```

## Orchestrator

```js
const MAX_DATE_RANGE_DAYS = 60;
const CONCURRENCY = 5; // days scored in parallel per batch

async function computeTaskMuhurta(task, fromDateStr, toDateStr, latitude, longitude, timezone) {
  const taskRules = TASK_RULES[task];
  const zone = timezone || tzlookup(latitude, longitude);
  const totalDays = DateTime.fromISO(toDateStr, { zone }).diff(DateTime.fromISO(fromDateStr, { zone }), 'days').days + 1;
  const dates = Array.from({ length: totalDays }, (_, i) =>
    DateTime.fromISO(fromDateStr, { zone }).plus({ days: i }).toISODate());
  // batches of CONCURRENCY, Promise.all per batch, to bound total
  // request latency without firing all N days' ephemeris calls at once
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
      start: r.date, // whole-day recommendation, not a sub-day slice — see Scope
      end: r.date,
      score: r.score,
      reasons: r.reasons,
      warnings: r.warnings,
    })),
  };
}
```

Each day costs 2 sequential ephemeris-related network calls (1 for
sunrise, 1 for planet longitudes at sunrise — the latter benefits from
`swissephService`'s existing per-jd caching if any other request happens to
reuse the exact same instant, though that's incidental, not relied upon).
With `CONCURRENCY = 5` and a 60-day cap, worst case is 12 sequential batches
— bounded, but still real latency (worth surfacing in the plan's testing
section as something to measure, not just assume is fine).

## Validation

New `src/validators/taskMuhurtaInput.js`:
- `task` required, must be one of `'marriage' | 'business' | 'travel'`.
- `from`/`to` required, `YYYY-MM-DD`, calendar-valid (reuse the
  `DateTime.fromISO(...).isValid` pattern already fixed in
  `muhurtaInput.js` after Tier 1's review found the same gap).
- `to` must not be before `from`.
- Date range (`to - from` inclusive) must not exceed `MAX_DATE_RANGE_DAYS`
  (60) — return a clear 400, not a slow 200.
- `latitude`/`longitude` — same numeric + empty-string-rejection validation
  as `muhurtaInput.js` (reuse the pattern, don't duplicate the bug that was
  already found and fixed there).
- `timezone` — same `IANAZone.isValidZone` check as `muhurtaInput.js`.

## Route

New `GET /api/muhurta/task-search?task=marriage&from=2026-08-01&to=2026-08-31&latitude=..&longitude=..&timezone=..`
in a new `src/routes/muhurtaTaskSearch.js` (or added to the existing
`src/routes/muhurta.js` as a second route in the same router — decide
during planning based on which reads cleaner), following the same
validate→calculate→respond pattern as `muhurta.js`.

## Testing

- **Rule-table unit tests:** for each of the 3 task types, a known-good day
  (all 5 checks pass) and a known-bad day (several fail) with hand-computed
  expected `reasons`/`warnings`.
- **Pada exclusion tests:** a day where the Moon is in Magha pada 1
  (excluded) vs Magha pada 2 (favorable) — same nakshatra, different
  outcome, catches an off-by-one in the pada-exclusion logic specifically.
- **Rikta tithi test:** a day with Chaturthi/Navami/Chaturdashi tithi fails
  the Tithi check regardless of task.
- **Range validation:** `to` before `from`, range exceeding 60 days, invalid
  task name — each a clean 400.
- **Orchestrator ordering:** results sorted descending by score; a
  synthetic test with 3 days of varying scores confirms sort order and that
  `windows.length` matches the requested range.
- **Live integration:** one real end-to-end test against the live ephemeris
  service for a small range (3-5 days) for one task type, verifying the
  full pipeline produces sane (not necessarily hand-verified) scores — full
  hand-verification of scoring correctness for arbitrary dates is out of
  scope (unlike Tier 1's Choghadiya fix, there's no simple way to
  cross-check a 5-factor weighted-ish score against a single published
  number; the individual factors — tithi/nakshatra/yoga/karana/weekday —
  are already independently verified correct by Tier 1's existing tests and
  the panchanga calculator's own test suite, so this test is an integration
  smoke test, not a correctness proof of the scoring formula itself).

## Out of scope (explicit)

- Griha Pravesh (needs Venus/Jupiter combustion data).
- Lagna/Hora scoring factor (needs new planetary-hour computation + rule
  table research).
- Chandra bala / Tara bala (needs the person's natal Moon — a personalized
  feature, not a generic date search).
- Sub-day scoring windows (only whole-day recommendations).
- Frontend UI.
- Scholarly/textual verification of the rule tables against Muhurta
  Chintamani directly (used cross-referenced modern secondary sources
  instead — documented above).
