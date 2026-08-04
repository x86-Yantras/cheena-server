import { describe, it, expect, afterEach, vi } from 'vitest';
import { generate } from '../../../src/ai/providers/openaiCompatible.js';

const BASE_ARGS = {
  apiKey: 'test-key',
  baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
  model: 'llama-3.3-70b-versatile',
  systemPrompt: 'You are a Vedic astrologer.',
  userContent: 'Describe this chart.',
  maxTokens: 1024,
  timeoutMs: 30_000,
};

describe('openaiCompatible adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a chat-completions request and returns the text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'A steady personality.' }, finish_reason: 'stop' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const text = await generate(BASE_ARGS);

    expect(text).toBe('A steady personality.');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('llama-3.3-70b-versatile');
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are a Vedic astrologer.' },
      { role: 'user', content: 'Describe this chart.' },
    ]);
  });

  it('throws with the provider error message on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'rate limited' } }),
    }));

    await expect(generate(BASE_ARGS)).rejects.toThrow('rate limited');
  });

  it('throws with status-code fallback on a non-OK response with null body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => null,
    }));

    await expect(generate(BASE_ARGS)).rejects.toThrow('Provider API returned 503');
  });

  it('throws when there is no text content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [] }),
    }));

    await expect(generate(BASE_ARGS)).rejects.toThrow('Provider API returned no text content');
  });

  it('throws when truncated by the max_tokens limit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'cut off mid-sen' }, finish_reason: 'length' }],
      }),
    }));

    await expect(generate(BASE_ARGS)).rejects.toThrow(/truncated/i);
  });

  it('includes temperature in the request body when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await generate({ ...BASE_ARGS, temperature: 0.5 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.5);
  });

  it('omits temperature from the request body when not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await generate(BASE_ARGS);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.temperature).toBeUndefined();
  });
});
