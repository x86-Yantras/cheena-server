const EPHEMERIS_FETCH_TIMEOUT_MS = 5000;

async function computeSunriseSunset(dateStr, latitude, longitude, timezone) {
  const baseUrl = process.env.EPHEMERIS_SERVICE_URL || 'http://localhost:3100';
  const apiKey = process.env.EPHEMERIS_SERVICE_API_KEY || '';
  const response = await fetch(`${baseUrl}/v1/sunrise-sunset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({ date: dateStr, latitude, longitude, timezone }),
    signal: AbortSignal.timeout(EPHEMERIS_FETCH_TIMEOUT_MS),
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
