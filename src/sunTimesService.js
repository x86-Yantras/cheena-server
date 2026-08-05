const EPHEMERIS_FETCH_TIMEOUT_MS = 5000;

async function computeSunriseSunset(dateStr, latitude, longitude, timezone) {
  const response = await fetch(`${process.env.EPHEMERIS_SERVICE_URL}/v1/sunrise-sunset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.EPHEMERIS_SERVICE_API_KEY,
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
