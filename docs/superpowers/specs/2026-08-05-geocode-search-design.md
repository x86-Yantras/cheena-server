# Forward Geocode Search — Design

## Purpose

Support a searchable birthplace picker in `kundali-frontend`'s `BirthDetailsForm`
(replacing raw latitude/longitude number inputs). This is the backend half:
a forward-search endpoint (place name → coordinates), the counterpart to the
existing reverse-geocode endpoint (coordinates → place name).

## Scope

- New `searchPlaces(query)` in `src/geocodeService.js`, new `GET
  /api/geocode/search?q=...` route.
- Uses the same Nominatim (OpenStreetMap) provider already used by
  `reverseGeocode` — no new API key, no new provider.
- No caching (unlike `reverseGeocode`'s coordinate-rounded cache) — search
  queries vary too much per-keystroke to cache usefully, and the frontend
  already debounces requests at 600ms.
- Does not touch `reverseGeocode`, its cache, or the existing `/reverse`
  route — purely additive.

## `searchPlaces(query)` — `src/geocodeService.js`

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

Note the deliberate difference from `reverseGeocode`'s `extractPlaceName`:
reverse-geocode uses the short `name` field (falling back to the first
segment of `display_name`) because it's describing ONE known point. Forward
search uses the FULL `display_name` for every result, because multiple
candidates need their full context to be distinguishable (e.g. "Kathmandu,
Bagmati Province, Nepal" vs "Kathmandu, Sudurpashchim Province, Nepal" —
these are both real, different places in Nepal).

Nominatim returns `lat`/`lon` as strings — must `Number(...)` them, unlike
`reverseGeocode` which never touches coordinates in the response body.

Empty/malformed responses degrade to an empty array, not a thrown error —
matches `reverseGeocode`'s "never throw, degrade gracefully" convention
exactly (network error, non-2xx, unparsable body, and now also
non-array-body and per-result missing/invalid fields).

## Route — `GET /api/geocode/search`

Add to `src/routes/geocode.js` (same file as the existing `/reverse` route):

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

The 3-character minimum matches the frontend's own debounce-trigger
threshold (no point building a route that accepts 1-character queries the
UI will never actually send) — but the backend enforces it independently
too, since a route must not trust client-side behavior for its own input
validation.

## Testing

- `searchPlaces`: successful multi-result response, empty array on non-2xx,
  empty array on network error, empty array on unparsable body, empty array
  when the response body isn't an array, filters out any individual result
  missing `display_name`/`lat`/`lon` or with unparsable coordinates, uses
  `display_name` (not `name`) as `placeName` unconditionally, defaults
  `NOMINATIM_BASE_URL` the same way `reverseGeocode` already does.
- Route: 400 for missing `q`, 400 for `q` under 3 characters (after
  trimming — a query of `"  a  "` must also 400), 200 with a `results`
  array for a valid query.

## Out of scope

- Caching search results.
- Rate-limiting (this repo has none anywhere yet — not this endpoint's
  problem to solve alone).
- Any change to `reverseGeocode` or the `/reverse` route.
