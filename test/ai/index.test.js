import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateReading, VALID_AREAS } from '../../src/ai/index.js';

const SAMPLE_RESULT = {
  ascendant: { rashiIndex: 0, rashiName: 'Mesha' },
  planets: [
    { key: 'SUN', rashiIndex: 0, house: 1, nakshatraIndex: 0 },
    { key: 'MOON', rashiIndex: 3, house: 4, nakshatraIndex: 5 },
  ],
  yogaDosha: {
    yogas: [{ key: 'gajakesari', present: true }, { key: 'budhaditya', present: false }],
    doshas: [{ key: 'mangal', present: true }],
  },
};

describe('ai/index generateReading', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.GEMINI_API_KEY = 'gemini-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes the five valid reading areas', () => {
    expect(VALID_AREAS).toEqual(['overview', 'career', 'marriage', 'health', 'wealth']);
  });

  it('rejects an unknown area without calling any provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateReading({ result: SAMPLE_RESULT, area: 'finance' }))
      .rejects.toThrow('Unknown reading area: finance');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('defaults to the Anthropic provider and includes the chart summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'A steady, grounded personality.' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const text = await generateReading({ result: SAMPLE_RESULT, area: 'overview' });

    expect(text).toBe('A steady, grounded personality.');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.messages[0].content).toContain('SUN');
    expect(body.messages[0].content).toContain('gajakesari');
    expect(body.messages[0].content).not.toContain('budhaditya');
  });

  it('dispatches to the Gemini adapter when provider is overridden', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'A Gemini reading.' }] }, finishReason: 'STOP' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const text = await generateReading({ result: SAMPLE_RESULT, area: 'overview', provider: 'gemini' });

    expect(text).toBe('A Gemini reading.');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('gemini-2.0-flash');
  });

  it('rejects an unknown provider without calling any adapter', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateReading({ result: SAMPLE_RESULT, area: 'overview', provider: 'bogus' }))
      .rejects.toThrow('Unknown provider: bogus');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
