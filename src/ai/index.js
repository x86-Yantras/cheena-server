import { resolveProviderConfig } from './config.js';
import { generate as generateAnthropic } from './providers/anthropic.js';
import { generate as generateOpenaiCompatible } from './providers/openaiCompatible.js';
import { generate as generateGemini } from './providers/gemini.js';
import { summarizeChart, formatChartForPrompt } from './chartSummary.js';

const AREA_PROMPTS = {
  overview: 'General question. Start from the lagna, lagna lord, Moon, and the strongest/weakest planet.',
  career: 'Question is about career. Look at the 10th house, its lord, and the D10 context. Weigh Mercury-Venus (business-arts) and any planet in the 10th.',
  marriage: 'Question is about marriage/relationship. Look at the 7th house, its lord, Venus (significator), and the 7th house of D9. Note Mangal dosha if present.',
  health: 'Question is about health. Look at the lagna, 6th and 8th houses, and their lords. Frame difficulty as caution, never predict disease or death.',
  wealth: 'Question is about wealth. Look at the 2nd and 11th houses, their lords, Jupiter-Venus (wealth significators), and any dhana yoga.',
  education: 'Question is about education. Look at the 4th, 5th, 9th houses, Mercury-Jupiter (significators), and the D24 context.',
};

const VALID_AREAS = Object.keys(AREA_PROMPTS);

const SYSTEM_PROMPT = `You are an experienced Vedic (Parashari) astrologer speaking warmly and directly
with someone about their birth chart. You are having a real conversation, not
writing a report.

## THE CHART
All placements, house lordships, yogas, dashas and transits below are already
computed and correct. Trust them completely. Do NOT recompute or second-guess
any position, and do NOT introduce any placement, yoga, or dasha that is not
explicitly listed in the data.

{chartData}

## HOW TO ANSWER
1. Anchor to the specific question. Identify which house(s), planet(s), and
   lord(s) actually govern what is being asked, and reason from those.
2. Weigh, don't list. Combine factors into a judgment: note the strongest
   supporting factor and the strongest limiting one. A chart is never all good
   or all bad — show the balance.
3. Tie timing to the CURRENT dasha and any active transit in the data. If the
   dasha lord relates to the question's house or lord, say so — this is what
   makes the reading feel alive rather than generic.
4. Give one concrete, grounded takeaway the person can actually act on.

## BOUNDARIES
- Use ONLY the placements in the data. If the data doesn't support an answer to
  what's asked, say so plainly rather than inventing a placement.
- Never predict death, disease, accidents, or disasters. Frame difficult periods
  as times for caution or patience, not doom.
- Do not give medical, legal, or financial directives. Astrological guidance is
  about tendency and timing, not instructions.
- If the question needs a divisional chart or detail not in the data, name what's
  missing instead of guessing.

## STYLE
- Reply in Nepali, always, regardless of the input language. Use natural
  Devanagari astrological vocabulary (लग्नेश, दशा, गोचर, भाव).
- 2 to 4 short paragraphs. Conversational, warm, specific — not a bulleted list.
- Reference actual placements by name so the person sees it's THEIR chart, not a
  generic horoscope.
- End with one brief line: this is traditional interpretation for guidance and
  reflection, and important decisions deserve their own judgement too.
- Never use fear to make a point. The goal is clarity and useful direction.`;

const TEMPERATURE = 0.5;
const MAX_TOKENS = 600;

const ADAPTERS_BY_FORMAT = {
  anthropic: generateAnthropic,
  openai: generateOpenaiCompatible,
  gemini: generateGemini,
};

async function buildPromptParts({ result, area, latitude, longitude, timezone, question }) {
  const chartSummary = await summarizeChart({ result, latitude, longitude, timezone });
  const chartText = formatChartForPrompt(chartSummary);
  const systemPrompt = SYSTEM_PROMPT.replace('{chartData}', chartText);
  const userContent = [
    AREA_PROMPTS[area],
    '',
    `User's question: ${question}`,
  ].join('\n');
  return { systemPrompt, userContent };
}

async function generateReading({ result, area, provider, model, latitude, longitude, timezone }) {
  if (!VALID_AREAS.includes(area)) {
    throw new Error(`Unknown reading area: ${area}`);
  }
  const providerConfig = resolveProviderConfig({ provider, model });
  const { systemPrompt, userContent } = await buildPromptParts({
    result, area, latitude, longitude, timezone, question: AREA_PROMPTS[area],
  });

  const adapter = ADAPTERS_BY_FORMAT[providerConfig.format];
  if (!adapter) {
    throw new Error(`No adapter for provider format: ${providerConfig.format}`);
  }
  return adapter({
    apiKey: providerConfig.apiKey,
    baseUrl: providerConfig.baseUrl,
    model: providerConfig.model,
    systemPrompt,
    userContent,
    maxTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    timeoutMs: 30_000,
  });
}

async function generateChatReply({ result, message, area, provider, model, history = [], latitude, longitude, timezone }) {
  if (message == null && area == null) {
    throw new Error('Either area or message is required');
  }
  if (area != null && !VALID_AREAS.includes(area)) {
    throw new Error(`Unknown reading area: ${area}`);
  }
  const providerConfig = resolveProviderConfig({ provider, model });
  const userQuestion = message != null ? message : AREA_PROMPTS[area];
  const effectiveArea = area != null ? area : 'overview';

  const { systemPrompt, userContent: baseUserContent } = await buildPromptParts({
    result, area: effectiveArea, latitude, longitude, timezone, question: userQuestion,
  });

  const transcript = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Astrologer'}: ${m.content}`)
    .join('\n');
  const userContent = transcript ? `${baseUserContent}\n\nConversation so far:\n${transcript}` : baseUserContent;

  const adapter = ADAPTERS_BY_FORMAT[providerConfig.format];
  if (!adapter) {
    throw new Error(`No adapter for provider format: ${providerConfig.format}`);
  }
  const reply = await adapter({
    apiKey: providerConfig.apiKey,
    baseUrl: providerConfig.baseUrl,
    model: providerConfig.model,
    systemPrompt,
    userContent,
    maxTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    timeoutMs: 30_000,
  });
  return { userMessage: userQuestion, reply };
}

export { generateReading, generateChatReply, VALID_AREAS };
