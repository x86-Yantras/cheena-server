import { resolveProviderConfig } from './config.js';
import { generate as generateAnthropic } from './providers/anthropic.js';
import { generate as generateOpenaiCompatible } from './providers/openaiCompatible.js';
import { generate as generateGemini } from './providers/gemini.js';

const AREA_PROMPTS = {
  overview: 'Give a whole-chart overview: personality, key placements, and notable yogas or doshas.',
  career: 'Focus specifically on career and professional life based on this chart.',
  marriage: 'Focus specifically on marriage and relationships based on this chart.',
  health: 'Focus specifically on health tendencies based on this chart.',
  wealth: 'Focus specifically on wealth and financial prospects based on this chart.',
};

const VALID_AREAS = Object.keys(AREA_PROMPTS);

const SYSTEM_PROMPT =
  'You are a Vedic astrologer writing plain-language chart readings. Be warm and specific to the given placements. Include one brief line noting this is for guidance/entertainment. Keep it to 3-5 short paragraphs.';

const ADAPTERS_BY_FORMAT = {
  anthropic: generateAnthropic,
  openai: generateOpenaiCompatible,
  gemini: generateGemini,
};

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

async function generateReading({ result, area, provider, model }) {
  if (!VALID_AREAS.includes(area)) {
    throw new Error(`Unknown reading area: ${area}`);
  }
  const providerConfig = resolveProviderConfig({ provider, model });
  const chartSummary = summarizeChart(result);
  const userContent = `${AREA_PROMPTS[area]}\n\nChart data (rashi index 0=Mesha..11=Meena, house is 1-12 from ascendant):\n${JSON.stringify(chartSummary)}`;

  const adapter = ADAPTERS_BY_FORMAT[providerConfig.format];
  return adapter({
    apiKey: providerConfig.apiKey,
    baseUrl: providerConfig.baseUrl,
    model: providerConfig.model,
    systemPrompt: SYSTEM_PROMPT,
    userContent,
    maxTokens: 1024,
    timeoutMs: 30_000,
  });
}

export { generateReading, VALID_AREAS };
