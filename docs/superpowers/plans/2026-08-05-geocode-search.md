# Forward Geocode Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /api/geocode/search?q=...` — forward geocoding (place name → coordinates) via Nominatim, the counterpart to the existing `/api/geocode/reverse`.

**Architecture:** One new function `searchPlaces(query)` in the existing `src/geocodeService.js`, one new route added to the existing `src/routes/geocode.js` router.

**Tech Stack:** Node.js, Express, Vitest, Supertest — no new dependencies, same Nominatim provider already used by `reverseGeocode`.

## Global Constraints

- No caching for search results (unlike `reverseGeocode`'s coordinate-rounded cache) — queries vary too much per-keystroke to cache usefully.
- Uses `display_name` (full string) as `placeName` for every result — NOT the shortened `name` field `reverseGeocode` uses — because multiple search candidates need full context to be distinguishable.
- Never throws — degrades to an empty array on any failure (network error, non-2xx, unparsable body, non-array body, malformed individual result), matching `reverseGeocode`'s existing "never throw" convention.
- Route enforces a 3-character minimum on `q` (after trimming) independently of the frontend's own debounce threshold — a route must not trust client behavior for its own input validation.
- Does not touch `reverseGeocode`, its cache, or the existing `/reverse` route.

---

### Task 1: `searchPlaces` + `GET /api/geocode/search`

**Files:**
- Modify: `src/geocodeService.js`
- Modify: `src/routes/geocode.js`
- Test: `test/geocodeService.test.js`
- Test: `test/routes/geocode.route.test.js`

**Interfaces:**
- Produces: `searchPlaces(query: string) => Promise<Array<{ placeName: string, latitude: number, longitude: number }>>`, exported from `src/geocodeService.js` alongside the existing `reverseGeocode`/`clearCache`. Route `GET /api/geocode/search?q=...` returning `{ results: [...] }`.
- Consumes: nothing new — reuses the existing `NOMINATIM_BASE_URL` env var and the `fetch`-based pattern already established by `reverseGeocode` in the same file.

- [ ] **Step 1: Write the failing tests for `searchPlaces`**

Append to `test/geocodeService.test.js` (inside the existing `describe('geocodeService', ...)` block, using the file's existing `fetchMock`/`beforeEach`/`afterEach` setup):

```js
  it('returns mapped results from a successful Nominatim search response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ([
        { display_name: 'Kathmandu, Bagmati Province, Nepal', lat: '27.7172', lon: '85.3240' },
        { display_name: 'Kathmandu, Sudurpashchim Province, Nepal', lat: '29.3', lon: '80.1' },
      ]),
    });

    const results = await searchPlaces('Kathmandu');

    expect(results).toEqual([
      { placeName: 'Kathmandu, Bagmati Province, Nepal', latitude: 27.7172, longitude: 85.3240 },
      { placeName: 'Kathmandu, Sudurpashchim Province, Nepal', latitude: 29.3, longitude: 80.1 },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://nominatim.test/search?format=jsonv2&limit=5&q=Kathmandu',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'kundali-app (kiran.bhatt7638@gmail.com)',
        }),
      }),
    );
  });

  it('URL-encodes the query', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

    await searchPlaces('New York, USA');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://nominatim.test/search?format=jsonv2&limit=5&q=New%20York%2C%20USA',
      expect.anything(),
    );
  });

  it('returns an empty array on a non-2xx upstream response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    const results = await searchPlaces('Kathmandu');

    expect(results).toEqual([]);
  });

  it('returns an empty array when the response body is unparsable', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); },
    });

    const results = await searchPlaces('Kathmandu');

    expect(results).toEqual([]);
  });

  it('returns an empty array when a network error is thrown', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const results = await searchPlaces('Kathmandu');

    expect(results).toEqual([]);
  });

  it('returns an empty array when the response body is not an array', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ error: 'not found' }) });

    const results = await searchPlaces('asdkjaslkdj');

    expect(results).toEqual([]);
  });

  it('filters out results missing display_name, lat, or lon, or with unparsable coordinates', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ([
        { display_name: 'Valid Place', lat: '1.0', lon: '2.0' },
        { lat: '1.0', lon: '2.0' }, // missing display_name
        { display_name: 'Bad Lat', lat: 'not-a-number', lon: '2.0' },
        { display_name: 'Missing Lon', lat: '1.0' },
      ]),
    });

    const results = await searchPlaces('test');

    expect(results).toEqual([{ placeName: 'Valid Place', latitude: 1.0, longitude: 2.0 }]);
  });

  it('defaults NOMINATIM_BASE_URL to the public Nominatim instance when unset', async () => {
    delete process.env.NOMINATIM_BASE_URL;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

    await searchPlaces('Kathmandu');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=Kathmandu',
      expect.anything(),
    );
  });
```

Also update the top-of-file import to include `searchPlaces`:
```js
import { reverseGeocode, searchPlaces, clearCache } from '../src/geocodeService.js';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/geocodeService.test.js`
Expected: FAIL — `searchPlaces` is not exported from `../src/geocodeService.js`.

- [ ] **Step 3: Implement `searchPlaces` in `src/geocodeService.js`**

Add this function anywhere after `reverseGeocode` (before the final `export` line):

```js
async function searchPlaces(query) {
  const baseUrl = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
  let response;
  try {
    response = await fetch(
      `${baseUrl}/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`,
      { headers: { 'User-Agent': 'kundali-app (kiran.bhatt7638@gmail.com)' } },
    );
  } catch {
    return [];
  }

  if (!response.ok) return [];

  let body;
  try {
    body = await response.json();
  } catch {
    return [];
  }

  if (!Array.isArray(body)) return [];

  return body
    .map((result) => ({
      placeName: result.display_name,
      latitude: Number(result.lat),
      longitude: Number(result.lon),
    }))
    .filter((result) => result.placeName && !Number.isNaN(result.latitude) && !Number.isNaN(result.longitude));
}
```

Update the file's final `export` statement to include it:
```js
export { reverseGeocode, searchPlaces, clearCache };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/geocodeService.test.js`
Expected: PASS (all existing tests plus the 7 new ones = 15 total)

- [ ] **Step 5: Write the failing route tests**

`test/routes/geocode.route.test.js` currently has one `describe('GET /api/geocode/reverse', ...)` block that stubs the global `fetch` (via `vi.stubGlobal`) and points `NOMINATIM_BASE_URL` at a fake host — real Nominatim is never called in this file. Add a SECOND, separate `describe` block for the new route, at the end of the file, following the exact same stubbing convention:

```js
describe('GET /api/geocode/search', () => {
  beforeEach(() => {
    process.env.NOMINATIM_BASE_URL = 'http://nominatim.test';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([
        { display_name: 'Kathmandu, Bagmati Province, Nepal', lat: '27.7172', lon: '85.3240' },
      ]),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 400 when q is missing', async () => {
    const app = createApp();
    const response = await request(app).get('/api/geocode/search');
    expect(response.status).toBe(400);
  });

  it('returns 400 when q is shorter than 3 characters after trimming', async () => {
    const app = createApp();
    const response = await request(app).get('/api/geocode/search').query({ q: '  a  ' });
    expect(response.status).toBe(400);
  });

  it('returns 200 with a results array for a valid query', async () => {
    const app = createApp();
    const response = await request(app).get('/api/geocode/search').query({ q: 'Kathmandu' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      results: [{ placeName: 'Kathmandu, Bagmati Province, Nepal', latitude: 27.7172, longitude: 85.3240 }],
    });
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run test/routes/geocode.route.test.js`
Expected: FAIL — 404 (route doesn't exist yet).

- [ ] **Step 7: Implement the route in `src/routes/geocode.js`**

Add the import:
```js
import { reverseGeocode, searchPlaces } from '../geocodeService.js';
```

Add the route (after the existing `/reverse` route, before `export default router;`):

```js
router.get('/search', async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== 'string' || query.trim().length < 3) {
    res.status(400).json({ error: 'q must be a string of at least 3 characters' });
    return;
  }

  const results = await searchPlaces(query.trim());
  res.json({ results });
});
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run test/routes/geocode.route.test.js`
Expected: PASS (all existing tests plus the 3 new ones)

- [ ] **Step 9: Run the full test suite**

Run: `npx vitest run`
Expected: PASS for all tests except the 7 pre-existing, unrelated DB-connection failures (no test database available in sandboxed environments — a known, pre-existing gap, not caused by this change).

- [ ] **Step 10: Commit**

```bash
git add src/geocodeService.js src/routes/geocode.js test/geocodeService.test.js test/routes/geocode.route.test.js
git commit -m "feat: add forward geocode search (searchPlaces + GET /api/geocode/search)"
```

## Self-Review Notes

- **Spec coverage:** `searchPlaces` using `display_name` not `name` ✅, no caching ✅, never-throw/degrade-to-empty-array on every failure mode ✅ (network error, non-2xx, unparsable body, non-array body, per-result malformed fields — all covered by Step 1's tests), 3-char minimum enforced server-side independent of frontend ✅ (Step 5's second test), existing `/reverse` route/cache untouched ✅ (this task only adds, never modifies existing `reverseGeocode` code).
- **No placeholders:** all steps contain full code and concrete test expectations.
- **Type consistency:** `searchPlaces`'s return shape (`{placeName, latitude, longitude}[]`) is identical between Step 3's implementation and Step 1's test expectations, and matches exactly what the sibling frontend plan's `geocodeApi.js` expects to consume (`data.results` array of the same shape).
