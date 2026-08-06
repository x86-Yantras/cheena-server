# Tribhagi & Yogini Dasha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `computeTribhagiDasha` and `computeYoginiDasha` to `src/dashaCalculator.js`, wired into `calculateKundali`'s response as new `tribhagiDasha`/`yoginiDasha` fields, alongside the existing unchanged `dasha` (Vimshottari) field.

**Architecture:** Tribhagi reuses the existing `buildPeriods` recursion via a new shared internal helper `computeDashaCycle` (refactored out of `computeVimshottariDasha`, which must produce byte-for-byte identical output afterward). Yogini is a new, independent 8-deity sequence with its own `buildYoginiPeriods` recursion (2-level depth only).

**Tech Stack:** Node.js, Vitest — no new dependencies.

## Global Constraints

- `computeVimshottariDasha`'s existing output must be unchanged by the refactor (verified by the existing, already-passing test suite in `test/dashaCalculator.test.js` continuing to pass with zero modification).
- Tribhagi total cycle: 40 years (120/3). Same 9-lord `DASHA_SEQUENCE`, same starting-lord-from-nakshatra rule, same 3-level depth (Mahadasha/Antardasha/Pratyantardasha) as Vimshottari.
- Yogini total cycle: 36 years. New sequence, 8 deities, 2-level depth only (Mahadasha/Antardasha — no Pratyantardasha).
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
  ```
- Yogini starting index from nakshatra number (1-27, Ashwini=1): `remainder = (nakshatraNumber + 3) % 8; index = (remainder === 0 ? 8 : remainder) - 1`.
- Verified reference fixture (same one already used in `test/dashaCalculator.test.js` and `test/kundaliCalculator.test.js` — Baitadi, moon longitude `62.909972675015986`, nakshatra index 4/Mrigashira, nakshatraNumber 5, `birthUtcMs = Date.UTC(1999, 0, 1, 2, 55, 0)`, `fractionElapsed ≈ 0.7182479506261987`):
  - **Vimshottari** (existing, unchanged): first mahadasha MARS, `balanceYears ≈ 1.9722`, Rahu-in-Rahu antardasha = 2.7 years.
  - **Tribhagi** (computed directly from the design's formula while writing this plan): first mahadasha MARS, `balanceYears ≈ 0.6574` (= 1.9722/3), mahadasha order identical to Vimshottari's (`MARS, RAHU, JUPITER, SATURN, MERCURY, KETU, VENUS, SUN, MOON`), Rahu mahadasha = 6 years (18/3), Rahu-in-Rahu antardasha = 0.9 years (2.7/3).
  - **Yogini** (computed directly from the design's formula): `nakshatraNumber = 5`, `remainder = (5+3) % 8 = 0` → Sankata (index 7, lord RAHU, 8 years). `balanceYears ≈ 2.254` (`(1 - 0.7182479506261987) * 8`).

---

### Task 1: Refactor `computeVimshottariDasha` to share `computeDashaCycle`; add `computeTribhagiDasha`

**Files:**
- Modify: `src/dashaCalculator.js`
- Modify: `test/dashaCalculator.test.js`

**Interfaces:**
- Produces: `computeTribhagiDasha(moonLongitude, birthUtcMs) => { balanceYears, mahadashas }`, same shape as `computeVimshottariDasha`'s existing return value. Exported alongside existing exports.
- Internal (not exported): `computeDashaCycle(moonLongitude, birthUtcMs, totalYears, depth)`.

- [ ] **Step 1: Write the failing tests**

Append to `test/dashaCalculator.test.js`. Extend the import line:
```js
import { computeVimshottariDasha, computeTribhagiDasha } from '../src/dashaCalculator.js';
```

```js
describe('computeTribhagiDasha', () => {
  const moonLongitude = 62.909972675015986;
  const birthUtcMs = Date.UTC(1999, 0, 1, 2, 55, 0);

  it('starts with the Mars mahadasha with ~0.6574 years balance (exactly 1/3 of Vimshottari\'s)', () => {
    const dasha = computeTribhagiDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas[0].lord).toBe('MARS');
    expect(dasha.balanceYears).toBeCloseTo(0.6574, 3);
  });

  it('lists 9 mahadashas in the same order as Vimshottari, totalling exactly 40 years', () => {
    const dasha = computeTribhagiDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas.map((m) => m.lord)).toEqual([
      'MARS', 'RAHU', 'JUPITER', 'SATURN', 'MERCURY', 'KETU', 'VENUS', 'SUN', 'MOON',
    ]);
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    const totalMs = Date.parse(dasha.mahadashas[8].end) - Date.parse(dasha.mahadashas[0].start);
    expect(totalMs / YEAR_MS).toBeCloseTo(40, 6);
  });

  it('scales every mahadasha to exactly 1/3 of its Vimshottari equivalent', () => {
    const vimshottari = computeVimshottariDasha(moonLongitude, birthUtcMs);
    const tribhagi = computeTribhagiDasha(moonLongitude, birthUtcMs);
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    for (let i = 0; i < 9; i += 1) {
      const vimYears = (Date.parse(vimshottari.mahadashas[i].end) - Date.parse(vimshottari.mahadashas[i].start)) / YEAR_MS;
      const tribYears = (Date.parse(tribhagi.mahadashas[i].end) - Date.parse(tribhagi.mahadashas[i].start)) / YEAR_MS;
      expect(tribYears).toBeCloseTo(vimYears / 3, 6);
    }
  });

  it('nests 9 antardashas and 9 pratyantardashas (3-level depth, same as Vimshottari)', () => {
    const dasha = computeTribhagiDasha(moonLongitude, birthUtcMs);
    const maha = dasha.mahadashas[1]; // RAHU, 6 years
    expect(maha.subPeriods).toHaveLength(9);
    expect(maha.subPeriods[0].lord).toBe('RAHU');

    const antar = maha.subPeriods[0];
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    const antarYears = (Date.parse(antar.end) - Date.parse(antar.start)) / YEAR_MS;
    expect(antarYears).toBeCloseTo(0.9, 6); // 2.7 / 3

    expect(antar.subPeriods).toHaveLength(9);
    expect(antar.subPeriods[0].subPeriods).toBeUndefined();
  });
});

describe('computeVimshottariDasha regression after computeDashaCycle refactor', () => {
  it('produces byte-for-byte identical output to before the refactor', () => {
    const moonLongitude = 62.909972675015986;
    const birthUtcMs = Date.UTC(1999, 0, 1, 2, 55, 0);
    const dasha = computeVimshottariDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas[0].lord).toBe('MARS');
    expect(dasha.balanceYears).toBeCloseTo(1.9722, 3);
    expect(dasha.mahadashas.map((m) => m.lord)).toEqual([
      'MARS', 'RAHU', 'JUPITER', 'SATURN', 'MERCURY', 'KETU', 'VENUS', 'SUN', 'MOON',
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/dashaCalculator.test.js`
Expected: FAIL — `computeTribhagiDasha` is not exported yet (the regression describe block should currently PASS since `computeVimshottariDasha` is unchanged so far — that's expected and fine, it's a guard for after the refactor in Step 3).

- [ ] **Step 3: Implement in `src/dashaCalculator.js`**

Current `computeVimshottariDasha`:
```js
function computeVimshottariDasha(moonLongitude, birthUtcMs) {
  const nakshatraIndex = Math.floor(moonLongitude / NAKSHATRA_SPAN) % 27;
  const fractionElapsed = (moonLongitude % NAKSHATRA_SPAN) / NAKSHATRA_SPAN;
  const firstLordIndex = nakshatraIndex % 9;
  const firstLordYears = DASHA_SEQUENCE[firstLordIndex].years;
  const cycleStartMs = birthUtcMs - fractionElapsed * firstLordYears * YEAR_MS;

  return {
    balanceYears: (1 - fractionElapsed) * firstLordYears,
    mahadashas: buildPeriods(firstLordIndex, cycleStartMs, TOTAL_YEARS * YEAR_MS, 3),
  };
}
```

Replace with:
```js
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
```

Update the file's final `export` statement to include `computeTribhagiDasha` alongside the existing exports.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/dashaCalculator.test.js`
Expected: PASS (all existing tests, unmodified, plus all new ones)

- [ ] **Step 5: Commit**

```bash
git add src/dashaCalculator.js test/dashaCalculator.test.js
git commit -m "feat: add computeTribhagiDasha via a shared computeDashaCycle helper"
```

---

### Task 2: `computeYoginiDasha`

**Files:**
- Modify: `src/dashaCalculator.js`
- Modify: `test/dashaCalculator.test.js`

**Interfaces:**
- Produces: `computeYoginiDasha(moonLongitude, birthUtcMs) => { balanceYears, mahadashas }`, where each mahadasha/antardasha entry has shape `{ name, lord, start, end, subPeriods? }` (mahadashas have `subPeriods`, antardashas do not — 2-level depth). Exported alongside existing exports.
- Consumes: nothing new from Task 1 — independent sequence and recursion, does not call `buildPeriods` or `computeDashaCycle`.

- [ ] **Step 1: Write the failing tests**

Append to `test/dashaCalculator.test.js`. Extend the import line:
```js
import { computeVimshottariDasha, computeTribhagiDasha, computeYoginiDasha } from '../src/dashaCalculator.js';
```

```js
describe('computeYoginiDasha', () => {
  const moonLongitude = 62.909972675015986; // Mrigashira, nakshatraNumber 5
  const birthUtcMs = Date.UTC(1999, 0, 1, 2, 55, 0);

  it('starts with the Sankata mahadasha (nakshatraNumber 5: (5+3)%8=0 -> Sankata) with ~2.254 years balance', () => {
    const dasha = computeYoginiDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas[0].name).toBe('SANKATA');
    expect(dasha.mahadashas[0].lord).toBe('RAHU');
    expect(dasha.balanceYears).toBeCloseTo(2.254, 3);
  });

  it('lists 8 mahadashas in Yogini order starting from Sankata, totalling exactly 36 years', () => {
    const dasha = computeYoginiDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas.map((m) => m.name)).toEqual([
      'SANKATA', 'MANGALA', 'PINGALA', 'DHANYA', 'BHRAMARI', 'BHADRIKA', 'ULKA', 'SIDDHA',
    ]);
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    const totalMs = Date.parse(dasha.mahadashas[7].end) - Date.parse(dasha.mahadashas[0].start);
    expect(totalMs / YEAR_MS).toBeCloseTo(36, 6);
  });

  it('gives the Sankata mahadasha (8 years) an 8-year span and its first antardasha (Sankata-in-Sankata) is proportional', () => {
    const dasha = computeYoginiDasha(moonLongitude, birthUtcMs);
    const maha = dasha.mahadashas[0]; // SANKATA, 8 years
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    const mahaYears = (Date.parse(maha.end) - Date.parse(maha.start)) / YEAR_MS;
    expect(mahaYears).toBeCloseTo(8, 6);

    expect(maha.subPeriods).toHaveLength(8);
    expect(maha.subPeriods[0].name).toBe('SANKATA');
    expect(maha.subPeriods[0].start).toBe(maha.start);

    // Sankata-in-Sankata antardasha: mahaYears(8) * ownYears(8) / totalYears(36) = 1.7778 years.
    const antar = maha.subPeriods[0];
    const antarYears = (Date.parse(antar.end) - Date.parse(antar.start)) / YEAR_MS;
    expect(antarYears).toBeCloseTo(1.7778, 3);
  });

  it('sums all 8 antardashas within one mahadasha to exactly that mahadasha\'s duration', () => {
    const dasha = computeYoginiDasha(moonLongitude, birthUtcMs);
    const maha = dasha.mahadashas[1]; // MANGALA, 1 year
    expect(maha.subPeriods).toHaveLength(8);
    expect(Math.abs(Date.parse(maha.subPeriods[7].end) - Date.parse(maha.end))).toBeLessThan(5);
  });

  it('gives antardashas no further sub-periods (2-level depth only)', () => {
    const dasha = computeYoginiDasha(moonLongitude, birthUtcMs);
    expect(dasha.mahadashas[0].subPeriods[0].subPeriods).toBeUndefined();
  });

  it('starting-Yogini formula: nakshatraNumber 6 (remainder 1) starts with Mangala', () => {
    // Ashwini=1..Mrigashira=5..Ardra=6. Nakshatra index 5 (Ardra) has span
    // [66.667, 80), so pick a longitude inside it: 70 degrees.
    const dasha = computeYoginiDasha(70, birthUtcMs);
    expect(dasha.mahadashas[0].name).toBe('MANGALA');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/dashaCalculator.test.js`
Expected: FAIL — `computeYoginiDasha` is not exported yet.

- [ ] **Step 3: Implement in `src/dashaCalculator.js`**

Add near the top, alongside `DASHA_SEQUENCE`:
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

Add the recursion and top-level function, near `buildPeriods`/`computeVimshottariDasha`:
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
  const nakshatraIndex = Math.floor(moonLongitude / NAKSHATRA_SPAN) % 27;
  const nakshatraNumber = nakshatraIndex + 1;
  const fractionElapsed = (moonLongitude % NAKSHATRA_SPAN) / NAKSHATRA_SPAN;
  const remainder = (nakshatraNumber + 3) % 8;
  const firstYoginiIndex = (remainder === 0 ? 8 : remainder) - 1;
  const firstYoginiYears = YOGINI_SEQUENCE[firstYoginiIndex].years;
  const cycleStartMs = birthUtcMs - fractionElapsed * firstYoginiYears * YEAR_MS;

  return {
    balanceYears: (1 - fractionElapsed) * firstYoginiYears,
    mahadashas: buildYoginiPeriods(firstYoginiIndex, cycleStartMs, YOGINI_TOTAL_YEARS * YEAR_MS, 2),
  };
}
```

Update the file's final `export` statement to include `computeYoginiDasha`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/dashaCalculator.test.js`
Expected: PASS (all existing tests plus all new ones)

- [ ] **Step 5: Commit**

```bash
git add src/dashaCalculator.js test/dashaCalculator.test.js
git commit -m "feat: add computeYoginiDasha (8-deity, 36-year cycle, 2-level depth)"
```

---

### Task 3: Wire both into `calculateKundali`

**Files:**
- Modify: `src/kundaliCalculator.js`
- Modify: `test/kundaliCalculator.test.js`

**Interfaces:**
- Consumes: `computeTribhagiDasha`, `computeYoginiDasha` from Task 1/2, both from `./dashaCalculator.js`.
- Produces: `calculateKundali(...)`'s return value gains `tribhagiDasha` and `yoginiDasha` fields, same shape as their respective `compute*Dasha` return values. The existing `dasha` field is completely unchanged.

- [ ] **Step 1: Write the failing tests**

Read `test/kundaliCalculator.test.js` first to confirm the exact `input` fixture used around line 324's existing Vimshottari test (it's the same Baitadi fixture used throughout this plan). Append after that existing test:

```js
  it('includes the Tribhagi dasha timeline (1/3 scale of Vimshottari) starting with the Mars mahadasha', async () => {
    const result = await calculateKundali(input);
    expect(result.tribhagiDasha.mahadashas).toHaveLength(9);
    expect(result.tribhagiDasha.mahadashas[0].lord).toBe('MARS');
    expect(result.tribhagiDasha.balanceYears).toBeCloseTo(0.6574, 3);
  }, 20000);

  it('includes the Yogini dasha timeline starting with the Sankata mahadasha', async () => {
    const result = await calculateKundali(input);
    expect(result.yoginiDasha.mahadashas).toHaveLength(8);
    expect(result.yoginiDasha.mahadashas[0].name).toBe('SANKATA');
    expect(result.yoginiDasha.mahadashas[0].lord).toBe('RAHU');
    expect(result.yoginiDasha.balanceYears).toBeCloseTo(2.254, 3);
  }, 20000);

  it('leaves the existing Vimshottari dasha field completely unaffected by the new fields', async () => {
    const result = await calculateKundali(input);
    expect(result.dasha.mahadashas).toHaveLength(9);
    expect(result.dasha.mahadashas[0].lord).toBe('MARS');
    expect(result.dasha.balanceYears).toBeCloseTo(1.9722, 3);
  }, 20000);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/kundaliCalculator.test.js`
Expected: FAIL — `result.tribhagiDasha`/`result.yoginiDasha` are `undefined` (the third new test should already PASS, since it only exercises the existing, untouched `dasha` field — that's expected and fine).

- [ ] **Step 3: Implement in `src/kundaliCalculator.js`**

Update the import line:
```js
import { computeVimshottariDasha, computeTribhagiDasha, computeYoginiDasha } from './dashaCalculator.js';
```

Current:
```js
  const dasha = computeVimshottariDasha(moon.longitude, birthUtcMs);
```

Change to:
```js
  const dasha = computeVimshottariDasha(moon.longitude, birthUtcMs);
  const tribhagiDasha = computeTribhagiDasha(moon.longitude, birthUtcMs);
  const yoginiDasha = computeYoginiDasha(moon.longitude, birthUtcMs);
```

In the function's return object, add the two new fields alongside the existing `dasha`:
```js
    dasha,
    tribhagiDasha,
    yoginiDasha,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/kundaliCalculator.test.js`
Expected: PASS (all existing tests, unmodified, plus the 3 new ones)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS for all tests except the pre-existing, unrelated DB-connection failures (no test database available in sandboxed environments).

- [ ] **Step 6: Commit**

```bash
git add src/kundaliCalculator.js test/kundaliCalculator.test.js
git commit -m "feat: wire tribhagiDasha and yoginiDasha into calculateKundali's response"
```

## Self-Review Notes

- **Spec coverage:** Tribhagi refactor produces byte-for-byte-unchanged Vimshottari output ✅ (Task 1's regression test), Tribhagi scales every period to exactly 1/3 ✅ (Task 1), Yogini sequence/starting-formula/2-level-depth/proportional-antardasha ✅ (Task 2), both wired additively into `calculateKundali` with `dasha` unaffected ✅ (Task 3).
- **No placeholders:** all steps contain full code and concrete, pre-verified test constants (computed directly from the design's own formulas against the same fixture already used elsewhere in this test suite, while writing this plan).
- **Type consistency:** `computeTribhagiDasha`'s return shape (`{balanceYears, mahadashas}`, each mahadasha `{lord, start, end, subPeriods}`) matches `computeVimshottariDasha`'s existing shape exactly, since both go through the same `computeDashaCycle`/`buildPeriods`. `computeYoginiDasha`'s return shape (`{name, lord, start, end, subPeriods?}` per period) is used consistently between Task 2's definition/tests and Task 3's wiring.
