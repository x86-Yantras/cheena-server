const AREA_PROMPTS = {
  overview: 'Give a whole-chart overview: personality, key placements, and notable yogas or doshas.',
  career: 'Focus specifically on career and professional life based on this chart.',
  marriage: 'Focus specifically on marriage and relationships based on this chart.',
  health: 'Focus specifically on health tendencies based on this chart.',
  wealth: 'Focus specifically on wealth and financial prospects based on this chart.',
};

const VALID_AREAS = Object.keys(AREA_PROMPTS);

function summarizeChart(result) {
  const yogas = (result.yogaDosha?.yogas || []).filter((y) => y.present).map((y) => y.key);
  const doshas = (result.yogaDosha?.doshas || []).filter((d) => d.present).map((d) => d.key);
  return {
    ascendantRashiIndex: result.ascendant.rashiIndex,
    planets: result.planets.map((p) => ({
      key: p.key,
      rashiIndex: p.rashiIndex,
      house: p.house,
      nakshatraIndex: p.nakshatraIndex,
    })),
    presentYogas: yogas,
    presentDoshas: doshas,
  };
}

async function generateReading({ result, area }) {
  if (!VALID_AREAS.includes(area)) {
    throw new Error(`Unknown reading area: ${area}`);
  }
  const chartSummary = summarizeChart(result);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: 'You are a Vedic astrologer writing plain-language chart readings. Be warm and specific to the given placements. Include one brief line noting this is for guidance/entertainment. Keep it to 3-5 short paragraphs.',
      messages: [
        {
          role: 'user',
          content: `${AREA_PROMPTS[area]}\n\nChart data (rashi index 0=Mesha..11=Meena, house is 1-12 from ascendant):\n${JSON.stringify(chartSummary)}`,
        },
      ],
    }),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Anthropic API returned ${response.status} with an unparsable body`);
  }
  if (!response.ok) {
    throw new Error(body.error?.message || `Anthropic API returned ${response.status}`);
  }
  const text = body.content?.[0]?.text;
  if (!text) {
    throw new Error('Anthropic API returned no text content');
  }
  if (body.stop_reason === 'max_tokens') {
    throw new Error('Anthropic API response was truncated (max_tokens reached)');
  }
  return text;
}

export { generateReading, VALID_AREAS };
