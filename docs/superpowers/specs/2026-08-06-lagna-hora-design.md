# Lagna/Hora (General Muhurta) — Design

## Purpose

Add `general` as a fifth task type to `GET /api/muhurta/task-search`, scoring
each day's Hora (planetary hour) periods for auspiciousness, independent of
any specific purpose (marriage/business/travel/griha-pravesh). This is the
"Lagna/Hora" factor referenced in `subha.md` line 198 — dropped from the
original Tier 2 round because it needs a new planetary-hour computation and
an unresearched rule table.

Chandra bala / Tara bala (also dropped from Tier 2) is explicitly **out of
scope** here — it needs the person's natal Moon, a fundamentally different,
personalized input shape (a kundali, not just lat/long+date range). Separate
spec, separate round.

## Naming note

This codebase already has `horaRashiIndex` in `kundaliCalculator.js` — that
is the **D2 Hora divisional chart** (a wealth-astrology varga), a completely
unrelated concept from **Hora as planetary-hour muhurta timing** used here.
No code collision (different files, different purpose), but flagged to avoid
confusion for future readers.

## Scope

- New task type `general`, added to `VALID_TASKS` in
  `src/validators/taskMuhurtaInput.js`.
- New dedicated module `src/generalMuhurtaCalculator.js` — this task type's
  response shape (nested per-day → per-Hora-segment) is structurally
  different from the flat day-list model in `taskMuhurtaCalculator.js`
  (used by the other 4 task types), so it does not extend that file.
- Two checks per Hora segment: **Hora** (is the ruling planet benefic?) and
  **Lagna Lord Strength** (is the ascendant's ruling planet exalted/own-sign,
  or debilitated, at that moment?).
- A day's reported score is its best-scoring segment's score; all 24
  segments for that day are nested underneath for transparency.
- Backend only — no frontend UI for a 5th task type in this round (existing
  `MuhurtaScreen.jsx` has 3 buttons; adding more is a separate follow-up).

## Hora computation

24 unequal-length segments per day, mirroring the existing Choghadiya
day/night split exactly (`src/muhurtaCalculator.js`'s `dayPartWindow`,
reused as-is):

- **Day half:** sunrise → sunset, split into 12 equal parts
  (`dayPartWindow(sunriseMin, sunsetMin, i + 1, 12)` for `i` in `0..11`).
- **Night half:** sunset → next sunrise, split into 12 equal parts
  (`dayPartWindow(sunsetMin, nextSunriseMin, i + 1, 12)` for `i` in `0..11`).

**Hora lord sequence:** fixed Chaldean order, cycled continuously across all
24 segments:

```js
const HORA_LORD_SEQUENCE = ['SATURN', 'JUPITER', 'MARS', 'SUN', 'VENUS', 'MERCURY', 'MOON'];
```

The first day-segment's lord is the weekday's own ruling planet — this is
the classical basis for planetary weekday names (well-established; not the
multi-source-corroboration caveat used for Choghadiya/Rahu Kaal, which have
less settled classical grounding):

```js
const WEEKDAY_STARTING_HORA_LORD = {
  sunday: 'SUN', monday: 'MOON', tuesday: 'MARS', wednesday: 'MERCURY',
  thursday: 'JUPITER', friday: 'VENUS', saturday: 'SATURN',
};
```

Given the weekday's starting lord, find its index in `HORA_LORD_SEQUENCE`
and cycle forward one step per segment (segment 0 = starting lord, segment 1
= next in the 7-cycle, ..., wrapping with `% 7`) across all 24 segments
(day segments 0-11, then night segments 12-23 continue the same cycle
uninterrupted — do not restart the cycle at sunset).

**Favorability** (sourced — cross-referenced across muhurta sources, same
"reasonable-effort, not scholarly" caveat as other rule tables in this
codebase):

```js
const FAVORABLE_HORA_LORDS = ['MOON', 'MERCURY', 'JUPITER', 'VENUS'];
const UNFAVORABLE_HORA_LORDS = ['SUN', 'MARS', 'SATURN'];
```

## Lagna Lord Strength

New dignity tables added to `src/matchData.js`, extending the existing
`RASHI_LORDS` / `MARS_OWN_RASHIS` / `MARS_EXALTED_RASHI` pattern (currently
Mars-only, used for Manglik dosha cancellation) to all 7 classical grahas.
Indices are `0=Aries..11=Pisces`, matching `RASHI_NAMES` / the existing
`RASHI_LORDS` array order:

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

(Verify while implementing: `MARS_EXALTED_RASHI = 9` already exists and must
equal `PLANET_EXALTATION_RASHI.MARS` — both describe Mars exalted in
Capricorn, index 9. `MARS_OWN_RASHIS = [0, 7]` must equal
`PLANET_OWN_RASHIS.MARS`. These are the same fact recorded twice; the new
tables should not silently disagree with the existing Manglik-dosha ones.)

**At each Hora segment's start time:**
1. Compute the ascendant longitude → rashi index (existing
   `rashiFromLongitude`-style logic, already used elsewhere in
   `kundaliCalculator.js`).
2. Look up that rashi's lord via `RASHI_LORDS[rashiIndex]`.
3. Compute that lord planet's own current longitude (`computePlanetLongitude`
   with the matching `swe.SE_*` constant) → its own rashi index.
4. Classify dignity:
   - `rashiIndex === PLANET_EXALTATION_RASHI[lord]` → **exalted**
   - `PLANET_OWN_RASHIS[lord].includes(rashiIndex)` → **own-sign**
   - `rashiIndex === PLANET_DEBILITATION_RASHI[lord]` → **debilitated**
   - otherwise → **neutral**

**Scoring:** exalted or own-sign → **pass** (strong); debilitated → **fail**
(weak); neutral → **pass** (average — only debilitation is a specific
classical weakness, matching standard dignity semantics). No combustion
folded into this check — that remains Griha Pravesh's separate, already-
shipped factor; this check is dignity-only.

## Scoring per Hora segment

```js
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
      failReason: `Lagna lord is debilitated`,
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
```

## Response shape

```json
{
  "task": "general",
  "dateRange": { "from": "2026-08-01", "to": "2026-08-01" },
  "windows": [
    {
      "date": "2026-08-01",
      "score": 100,
      "reasons": ["Best window: Venus hora with an exalted lagna lord"],
      "warnings": [],
      "bestWindow": {
        "start": "2026-08-01T09:14",
        "end": "2026-08-01T10:32",
        "planetLord": "VENUS",
        "checks": [
          { "name": "Hora", "pass": true, "reason": "VENUS hora is favorable" },
          { "name": "Lagna Lord Strength", "pass": true, "reason": "Lagna lord is exalted" }
        ]
      },
      "horaSegments": [
        { "start": "2026-08-01T00:00", "end": "2026-08-01T01:18", "planetLord": "SATURN", "score": 0, "checks": [ "..." ] },
        "... 22 more, chronological ..."
      ]
    }
  ]
}
```

- Days sorted by best-segment score descending (same convention as the other
  4 task types).
- `horaSegments` stays chronological within a day (reads as a timeline), not
  sorted by score.
- `bestWindow` is the highest-scoring segment; ties broken by earliest start
  time.
- `reasons`/`warnings` at the day level summarize the `bestWindow` only (not
  a merge across all 24 segments) — consistent with "the day's score is its
  best window's score."

## Computation flow

For each day in the range:
1. `computeSunriseSunset` for that day's sunrise/sunset and (via next day's
   sunrise) the night-half boundary.
2. Build the 24 segment time windows (`dayPartWindow`, day then night).
3. Assign each segment's Hora lord via the weekday-indexed
   `HORA_LORD_SEQUENCE` cycle.
4. For each segment (batched with `CONCURRENCY = 5`, mirroring
   `computeTaskMuhurta`'s existing pattern): one `computeJulianDay` call at
   the segment's start time, then ascendant longitude → rashi → lord →
   lord's longitude → rashi → dignity, then `scoreHoraSegment`.
5. Pick the best segment, assemble the day's entry.

This is 24 ephemeris calls per day (vs. 1 for the other task types) — over a
60-day max range (`MAX_DATE_RANGE_DAYS`), that's up to 1440 calls per
request. Flagged as a real cost, mitigated by the existing per-jd caching in
`swissephService.js` (concurrent identical-instant requests within the
30-second cache TTL are deduplicated) and the existing `CONCURRENCY = 5`
batching. No further optimization in this round; revisit if latency proves
a problem in practice.

## Testing

- Pure unit tests (no I/O): Hora lord sequencing — weekday → starting lord
  correctness for all 7 weekdays, and the 7-cycle wraparound holding across
  all 24 segments (segment 7 and segment 0 should have the same lord, since
  24 is not a multiple of 7 the wraparound must be verified numerically, not
  assumed).
- Pure unit tests: dignity classification for all 7 planets × all 4
  categories (exalted/own-sign/debilitated/neutral) — at least one concrete
  rashi-index example per planet per category.
- Pure unit tests: `scoreHoraSegment` — favorable hora + exalted lagna lord
  → 100; unfavorable hora + debilitated lagna lord → 0; one-of-two-passing
  → 50, in both directions (Hora passes/Lagna fails, and vice versa).
- `VALID_TASKS` gains `'general'` — validator unit test (network-free,
  following the pattern already established for `taskMuhurtaInput.test.js`
  from the deferred-minors cleanup).
- Live integration test: pick a verified real date/time where a specific
  Hora segment is known-favorable and another known-unfavorable, computed
  directly against `swisseph-wasm` before writing the implementation plan
  (same verification method used for Griha Pravesh's combustion dates).
- Route test: `task=general` returns the nested shape (`bestWindow` and
  `horaSegments` present, `horaSegments.length === 24`).

## Out of scope

- Chandra bala / Tara bala — separate spec, needs a natal-Moon input shape
  (a kundali, not lat/long+date range). Next round.
- Frontend UI for a 5th task type.
- Sub-hora precision (finer than the 12-fold division).
- Any dignity beyond exalted/own-sign/debilitated/neutral (e.g. friend/enemy
  sign placement, shadbala, vargottama). This is intentionally the same
  bounded-scope decision already applied to Griha Pravesh's combustion-only
  (not full heliacal-visibility) check.
