import { describe, it, expect, afterEach, vi } from 'vitest';
import { generate } from '../../../src/ai/providers/gemini.js';

const BASE_ARGS = {
  apiKey: 'test-key',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  model: 'gemini-2.0-flash',
  systemPrompt: 'You are a Vedic astrologer.',
  userContent: 'Describe this chart.',
  maxTokens: 1024,
  timeoutMs: 30_000,
};

describe('gemini adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a generateContent request and returns the text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'A steady personality.' }] }, finishReason: 'STOP' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const text = await generate(BASE_ARGS);

    expect(text).toBe('A steady personality.');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=test-key'
    );
    const body = JSON.parse(options.body);
    expect(body.system_instruction).toEqual({ parts: [{ text: 'You are a Vedic astrologer.' }] });
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'Describe this chart.' }] }]);
    expect(body.generationConfig.maxOutputTokens).toBe(1024);
  });

  it('throws with the provider error message on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'quota exceeded' } }),
    }));

    await expect(generate(BASE_ARGS)).rejects.toThrow('quota exceeded');
  });

  it('throws when there is no text content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [] }),
    }));

    await expect(generate(BASE_ARGS)).rejects.toThrow('Gemini API returned no text content');
  });

  it('throws when truncated by MAX_TOKENS', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'cut off mid-sen' }] }, finishReason: 'MAX_TOKENS' }],
      }),
    }));

    await expect(generate(BASE_ARGS)).rejects.toThrow(/truncated/i);
  });

  it('throws a plain Error when non-OK response body is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => null,
    }));

    await expect(generate(BASE_ARGS)).rejects.toThrow('Gemini API returned 401');
  });

  it('includes temperature in generationConfig when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await generate({ ...BASE_ARGS, temperature: 0.5 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.temperature).toBe(0.5);
  });

  it('omits temperature from generationConfig when not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await generate(BASE_ARGS);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.temperature).toBeUndefined();
  });
});
