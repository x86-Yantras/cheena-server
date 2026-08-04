import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateReading, generateChatReply, VALID_AREAS } from '../../src/ai/index.js';

const SAMPLE_RESULT = {
  ascendant: { rashiIndex: 9, longitude: 276.5 },
  planets: [
    { key: 'SUN', rashiIndex: 8, house: 12, longitude: 256.38, navamsa: { rashiIndex: 8 }, nakshatraIndex: 19, pada: 3 },
    { key: 'MOON', rashiIndex: 2, house: 6, longitude: 62.9, navamsa: { rashiIndex: 4 }, nakshatraIndex: 4, pada: 1 },
    { key: 'MARS', rashiIndex: 5, house: 9, longitude: 174.6, navamsa: { rashiIndex: 5 }, nakshatraIndex: 13, pada: 2 },
    { key: 'MERCURY', rashiIndex: 7, house: 11, longitude: 237.58, navamsa: { rashiIndex: 7 }, nakshatraIndex: 17, pada: 4 },
    { key: 'JUPITER', rashiIndex: 10, house: 2, longitude: 328.12, navamsa: { rashiIndex: 10 }, nakshatraIndex: 24, pada: 1 },
    { key: 'VENUS', rashiIndex: 9, house: 1, longitude: 271.68, navamsa: { rashiIndex: 9 }, nakshatraIndex: 20, pada: 3 },
    { key: 'SATURN', rashiIndex: 0, house: 4, longitude: 2.92, navamsa: { rashiIndex: 0 }, nakshatraIndex: 0, pada: 1 },
    { key: 'RAHU', rashiIndex: 4, house: 8, longitude: 130.53, navamsa: { rashiIndex: 4 }, nakshatraIndex: 9, pada: 2 },
    { key: 'KETU', rashiIndex: 10, house: 2, longitude: 310.53, navamsa: { rashiIndex: 10 }, nakshatraIndex: 24, pada: 4 },
  ],
  dasha: {
    mahadashas: [{
      lord: 'JUPITER', start: '2010-01-01T00:00:00.000Z', end: '2099-01-01T00:00:00.000Z',
      subPeriods: [{
        lord: 'KETU', start: '2010-01-01T00:00:00.000Z', end: '2099-01-01T00:00:00.000Z',
        subPeriods: [{ lord: 'SATURN', start: '2010-01-01T00:00:00.000Z', end: '2099-01-01T00:00:00.000Z' }],
      }],
    }],
  },
  yogaDosha: { yogas: [{ key: 'malavya', present: true }], doshas: [] },
};

const SAMPLE_ARGS = { result: SAMPLE_RESULT, latitude: 27.7, longitude: 85.3, timezone: 'Asia/Kathmandu' };

function stubFetch() {
  return vi.fn(async (url) => {
    if (String(url).includes('ephemeris')) {
      return {
        ok: true,
        json: async () => ({
          julianDay: 2451545.0,
          ascendantLongitude: 0,
          planetLongitudes: { SATURN: 340, JUPITER: 130, RAHU: 40 },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'A steady, grounded personality.' } }] }),
    };
  });
}

describe('ai/index generateReading', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.GEMINI_API_KEY = 'gemini-key';
    process.env.GROQ_API_KEY = 'groq-key';
    process.env.EPHEMERIS_SERVICE_URL = 'http://ephemeris.test';
    process.env.EPHEMERIS_SERVICE_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes six valid reading areas including education', () => {
    expect(VALID_AREAS).toEqual(['overview', 'career', 'marriage', 'health', 'wealth', 'education']);
  });

  it('rejects an unknown area without calling any provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateReading({ ...SAMPLE_ARGS, area: 'finance' }))
      .rejects.toThrow('Unknown reading area: finance');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a system/user split with the formatted Nepali chart text and area focus hint in the user message', async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal('fetch', fetchMock);

    const text = await generateReading({ ...SAMPLE_ARGS, area: 'career' });

    expect(text).toBe('A steady, grounded personality.');
    const providerCall = fetchMock.mock.calls.find(([url]) => !String(url).includes('ephemeris'));
    const body = JSON.parse(providerCall[1].body);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('BOUNDARIES');
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toContain('10th house'); // career focus hint (AREA_PROMPTS.career) present verbatim
    // Chart data is embedded in the system prompt (via the {chartData} placeholder), not the
    // user message — the user message only carries the focus hint and question. So the Nepali
    // chart text assertion checks the system message, not messages[1].
    expect(body.messages[0].content).toContain('मकर'); // Nepali lagna rashi text present, not raw JSON
    expect(body.temperature).toBe(0.5);
    expect(body.max_tokens).toBe(600);
  });

  it('accepts the education area', async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal('fetch', fetchMock);
    const text = await generateReading({ ...SAMPLE_ARGS, area: 'education' });
    expect(text).toBe('A steady, grounded personality.');
  });

  it('dispatches to the Gemini adapter when provider is overridden', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('ephemeris')) {
        return {
          ok: true,
          json: async () => ({ julianDay: 2451545.0, ascendantLongitude: 0, planetLongitudes: { SATURN: 340, JUPITER: 130, RAHU: 40 } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'A Gemini reading.' }] }, finishReason: 'STOP' }] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const text = await generateReading({ ...SAMPLE_ARGS, area: 'overview', provider: 'gemini' });

    expect(text).toBe('A Gemini reading.');
    const providerCall = fetchMock.mock.calls.find(([url]) => !String(url).includes('ephemeris'));
    expect(providerCall[0]).toContain('generativelanguage.googleapis.com');
    expect(providerCall[0]).toContain('gemini-2.0-flash');
  });

  it('rejects an unknown provider without calling any adapter', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateReading({ ...SAMPLE_ARGS, area: 'overview', provider: 'bogus' }))
      .rejects.toThrow('Unknown provider: bogus');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ai/index generateChatReply', () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = 'groq-key';
    process.env.EPHEMERIS_SERVICE_URL = 'http://ephemeris.test';
    process.env.EPHEMERIS_SERVICE_API_KEY = 'test-api-key';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('answers a free-text message referencing the Nepali chart text, not raw JSON', async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { userMessage, reply } = await generateChatReply({ ...SAMPLE_ARGS, message: 'How is my career?' });

    expect(userMessage).toBe('How is my career?');
    expect(reply).toBe('A steady, grounded personality.');
    const providerCall = fetchMock.mock.calls.find(([url]) => !String(url).includes('ephemeris'));
    const body = JSON.parse(providerCall[1].body);
    expect(body.messages[1].content).not.toContain('rashiIndex'); // no raw field names leaking into the prompt
    // Chart data lives in the system prompt, not the user message (see note above).
    expect(body.messages[0].content).not.toContain('rashiIndex');
    expect(body.messages[0].content).toContain('मकर');
  });
});
