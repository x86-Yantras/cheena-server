import { describe, it, expect, afterEach, vi } from 'vitest';
import { generate } from '../../../src/ai/providers/anthropic.js';

const BASE_ARGS = {
  apiKey: 'test-key',
  baseUrl: 'https://api.anthropic.com/v1/messages',
  model: 'claude-haiku-4-5-20251001',
  systemPrompt: 'You are a Vedic astrologer.',
  userContent: 'Describe this chart.',
  maxTokens: 1024,
  timeoutMs: 30_000,
};

describe('anthropic adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the Anthropic Messages API request and returns the text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'A steady personality.' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const text = await generate(BASE_ARGS);

    expect(text).toBe('A steady personality.');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options.headers['x-api-key']).toBe('test-key');
    expect(options.headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.system).toBe('You are a Vedic astrologer.');
    expect(body.messages[0]).toEqual({ role: 'user', content: 'Describe this chart.' });
  });

  it('throws with the provider error message on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'overloaded' } }),
    }));

    await expect(generate(BASE_ARGS)).rejects.toThrow('overloaded');
  });

  it('throws with status-code fallback on a non-OK response with null body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => null,
    }));

    await expect(generate(BASE_ARGS)).rejects.toThrow('Anthropic API returned 503');
  });

  it('throws when there is no text content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [] }),
    }));

    await expect(generate(BASE_ARGS)).rejects.toThrow('Anthropic API returned no text content');
  });

  it('throws when truncated by max_tokens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: 'cut off mid-sen' }],
        stop_reason: 'max_tokens',
      }),
    }));

    await expect(generate(BASE_ARGS)).rejects.toThrow(/truncated/i);
  });
});
