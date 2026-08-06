# Tribhagi Dasha & Yogini Dasha — Design

## Purpose

Add two more dasha (planetary period) systems alongside the existing
Vimshottari Dasha, computed for every kundali: Tribhagi Dasha (a 1/3-scaled
variant of Vimshottari) and Yogini Dasha (an independent 8-deity, 36-year
cycle). Covers both `kundali-backend` (computation) and `kundali-frontend`
(a system selector + rendering support in `DashaTable`).

## Scope

- Both new dasha systems are computed unconditionally alongside the
  existing `dasha` field on every kundali response — cheap pure math, no
  new I/O, no query-param gating, consistent with how this app already
  always computes all its facets (panchang, yogaDosha, etc.).
- Response shape is additive only: existing `dasha` field (Vimshottari)
  is completely unchanged, for backward compatibility. Two new sibling
  fields: `tribhagiDasha`, `yoginiDasha`.
- Frontend: a 3-way system selector (Vimshottari / Tribhagi / Yogini) in
  `KundaliScreen.jsx`, feeding the selected dasha object + a `system` prop
  into `DashaTable`.
- Yogini Dasha depth is 2 levels (Mahadasha + Antardasha) only for this
  round — Pratyantardasha is unresearched and out of scope.
- Any additional dasha systems beyond these three (Ashtottari, Kalachakra,
  etc.) are out of scope — not requested.

## Tribhagi Dasha

Same 9-planet `DASHA_SEQUENCE` (already defined in `src/dashaCalculator.js`),
same nakshatra-based starting-lord rule, same recursive 3-level sub-period
structure (Mahadasha/Antardasha/Pratyantardasha) as Vimshottari — the only
difference is total cycle length: **40 years instead of 120** (each period
is exactly 1/3 of its Vimshottari equivalent).

This is a near-zero-risk addition: the existing `buildPeriods` recursion
computes each period's length as `(lengthMs * entry.years) / TOTAL_YEARS`,
where `entry.years` values come from the fixed 120-year table and
`TOTAL_YEARS` (120) is the fixed denominator — the *fraction* each lord
occupies is scale-independent. Passing a different total `lengthMs` at the
top level (40 years' worth of milliseconds instead of 120) already produces
correctly-scaled periods with zero changes to `buildPeriods` itself.

Refactor `computeVimshottariDasha` to share a new internal helper:

```js
function computeDashaCycle(moonLongitude, birthUtcMs, totalYears, depth) {
  const nakshatraIndex = Math.floor(moonLongitude / NAKSHATRA_SPAN) % 27;
  const fractionElapsed = (moonLongitude % NAKSHATRA_SPAN) / NAKSHATRA_SPAN;
  const firstLordIndex = nakshatraIndex % 9;
  const scale = totalYears / TOTAL_YEARS; // TOTAL_YEARS stays the fixed 120-year table constant
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

const TRIBHAGI_TOTAL_YEARS = TOTAL_YEARS / 3; // 40

function computeTribhagiDasha(moonLongitude, birthUtcMs) {
  return computeDashaCycle(moonLongitude, birthUtcMs, TRIBHAGI_TOTAL_YEARS, 3);
}
```

`computeVimshottariDasha`'s existing, already-tested output must be
byte-for-byte identical after this refactor (verified by the existing test
suite continuing to pass unchanged).

## Yogini Dasha

New sequence table (sourced: cross-referenced across multiple published
panchanga/dasha sources during research, same "reasonable-effort, not
scholarly" caveat as this codebase's other rule tables):

```js
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
const YOGINI_TOTAL_YEARS = 36;
```

Each entry carries both `name` (the Yogini deity) and `lord` (its
associated planet) — `lord` exists purely so the frontend can reuse
existing planet-color/avatar styling without inventing a parallel color
system.

**Starting Yogini formula:** nakshatra numbered 1-27 (Ashwini = 1).
```js
function startingYoginiIndex(nakshatraNumber) {
  const remainder = (nakshatraNumber + 3) % 8;
  return (remainder === 0 ? 8 : remainder) - 1; // 0-based index into YOGINI_SEQUENCE
}
```

**Antardasha (sub-period) method:** proportional, reusing the same
`buildPeriods`-style recursion already used for Vimshottari/Tribhagi (a
different arithmetic formula — `(mahaYears * antarYears) / 4` months —
appears in some sources, but was found to NOT sum consistently to the
36-year total when checked directly; the proportional method is
internally consistent and one source explicitly endorses it as equivalent
to the Vimshottari method, so it's the one implemented here).

**Depth:** 2 levels only (Mahadasha + Antardasha) for this round.

```js
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
  const nakshatraNumber = Math.floor(moonLongitude / NAKSHATRA_SPAN) + 1; // 1-27
  const fractionElapsed = (moonLongitude % NAKSHATRA_SPAN) / NAKSHATRA_SPAN;
  const firstYoginiIndex = startingYoginiIndex(nakshatraNumber);
  const firstYoginiYears = YOGINI_SEQUENCE[firstYoginiIndex].years;
  const cycleStartMs = birthUtcMs - fractionElapsed * firstYoginiYears * YEAR_MS;

  return {
    balanceYears: (1 - fractionElapsed) * firstYoginiYears,
    mahadashas: buildYoginiPeriods(firstYoginiIndex, cycleStartMs, YOGINI_TOTAL_YEARS * YEAR_MS, 2),
  };
}
```

## `kundaliCalculator.js` changes

```js
const dasha = computeVimshottariDasha(moon.longitude, birthUtcMs);
const tribhagiDasha = computeTribhagiDasha(moon.longitude, birthUtcMs);
const yoginiDasha = computeYoginiDasha(moon.longitude, birthUtcMs);
```

Return object gains `tribhagiDasha` and `yoginiDasha` alongside the
existing `dasha` field — purely additive, no other field changes.

## Frontend: system selector + `DashaTable` changes

`KundaliScreen.jsx`: new local state (e.g. `dashaSystem`, default
`'vimshottari'`) driving a chip-row selector (Vimshottari / Tribhagi /
Yogini) rendered above the existing dasha-tab content. Selects
`result.dasha` / `result.tribhagiDasha` / `result.yoginiDasha` accordingly,
passing the chosen object plus a new `system` prop to `DashaTable`.

`DashaTable`: Vimshottari and Tribhagi need **zero rendering changes**
(identical period shape — `{lord, start, end, subPeriods}`). Yogini needs
conditional display logic:
- When `system === 'yogini'`, the period label text comes from
  `translateYoginiName(locale, period.name)` (new i18n helper) instead of
  `translatePlanetName(locale, period.lord)`.
- The avatar color/abbreviation still uses `period.lord` via the existing
  `PLANET_COLOR_VARS`/`translatePlanetAbbreviation` — so a Yogini period
  visually reuses its associated planet's familiar color-coding, while the
  text label shows the deity name.
- `findCurrentChain`/`isCurrent` logic is unchanged — it only depends on
  `start`/`end`/`subPeriods`, which all three systems share.
- The "current dasha chain" summary line (`chainPeriods.map(...).join(' > ')`)
  needs the same conditional translation logic as the main list.

## i18n additions

New `YOGINI_NAMES` table (en/ne) for the 8 deity names, plus 3 chip labels
for the system selector (`dashaSystemVimshottari`, `dashaSystemTribhagi`,
`dashaSystemYogini`).

## Testing

- **Tribhagi:** pure unit tests confirming period lengths are exactly
  Vimshottari's ÷3 for the same birth input (cross-check against existing
  Vimshottari test fixtures — e.g. if Vimshottari's first mahadasha is 7
  years, Tribhagi's corresponding one must be 7/3 years). Confirm
  `computeVimshottariDasha`'s own output is unchanged after the
  `computeDashaCycle` refactor (regression guard on the existing,
  already-tested function).
- **Yogini:** pure unit tests for the starting-Yogini formula across
  boundary cases (e.g. nakshatra 5 → remainder 0 → Sankata/index 7;
  nakshatra 6 → remainder 1 → Mangala/index 0) — enough cases to prove the
  wraparound is correct, not all 27. A test confirming Antardasha
  durations within one Mahadasha sum to that Mahadasha's total duration
  (proportionality sanity check).
- **Frontend:** system-selector switches the rendered periods correctly;
  Yogini periods show deity names with correct planet-color avatars;
  Vimshottari/Tribhagi rendering remains byte-for-byte unchanged (existing
  `DashaTable` tests must keep passing with zero modification, proving no
  regression).

## Out of scope

- Yogini Pratyantardasha (3rd level) — deferred, unresearched.
- Any additional dasha systems beyond these three.
- Backend query-param gating — all three always computed.
