import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateReading, VALID_AREAS } from '../src/aiReadingService.js';

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

describe('aiReadingService', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes the five valid reading areas', () => {
    expect(VALID_AREAS).toEqual(['overview', 'career', 'marriage', 'health', 'wealth']);
  });

  it('calls the Anthropic API with the chart summary and returns the reading text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'A steady, grounded personality.' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const text = await generateReading({ result: SAMPLE_RESULT, area: 'overview', provider: 'anthropic' });

    expect(text).toBe('A steady, grounded personality.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options.headers['x-api-key']).toBe('test-key');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.messages[0].content).toContain('SUN');
    expect(body.messages[0].content).toContain('gajakesari');
    expect(body.messages[0].content).not.toContain('budhaditya');
  });

  it('rejects an unknown area without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateReading({ result: SAMPLE_RESULT, area: 'finance' }))
      .rejects.toThrow('Unknown reading area: finance');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when the Anthropic API returns a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'overloaded' } }),
    }));

    await expect(generateReading({ result: SAMPLE_RESULT, area: 'overview', provider: 'anthropic' }))
      .rejects.toThrow('overloaded');
  });

  it('throws when the Anthropic API returns no text content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [] }),
    }));

    await expect(generateReading({ result: SAMPLE_RESULT, area: 'overview', provider: 'anthropic' }))
      .rejects.toThrow('Anthropic API returned no text content');
  });

  it('throws when the response was truncated (stop_reason max_tokens), instead of returning partial text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: 'This reading got cut off mid-sen' }],
        stop_reason: 'max_tokens',
      }),
    }));

    await expect(generateReading({ result: SAMPLE_RESULT, area: 'overview', provider: 'anthropic' }))
      .rejects.toThrow(/truncated/i);
  });

  it('requests a higher max_tokens ceiling and sets a request timeout', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'A reading.' }], stop_reason: 'end_turn' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateReading({ result: SAMPLE_RESULT, area: 'overview', provider: 'anthropic' });

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.max_tokens).toBe(1024);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});
