const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map(); // `${latKey}|${lonKey}` -> placeName

function scheduleEviction(key) {
  const timer = setTimeout(() => cache.delete(key), CACHE_TTL_MS);
  timer.unref?.();
}

function cacheKey(latitude, longitude) {
  return `${latitude.toFixed(3)}|${longitude.toFixed(3)}`;
}

function extractPlaceName(body) {
  if (body.name) return body.name;
  if (body.display_name) return body.display_name.split(',')[0].trim();
  return null;
}

async function reverseGeocode(latitude, longitude) {
  const key = cacheKey(latitude, longitude);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const baseUrl = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
  let response;
  try {
    response = await fetch(
      `${baseUrl}/reverse?format=jsonv2&zoom=8&lat=${latitude}&lon=${longitude}`,
      { headers: { 'User-Agent': 'kundali-app (kiran.bhatt7638@gmail.com)' } },
    );
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let body;
  try {
    body = await response.json();
  } catch {
    return null;
  }

  const placeName = extractPlaceName(body);
  if (placeName) {
    cache.set(key, placeName);
    scheduleEviction(key);
  }
  return placeName;
}

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

function clearCache() {
  cache.clear();
}

export { reverseGeocode, searchPlaces, clearCache };
