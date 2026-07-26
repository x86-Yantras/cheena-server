import { describe, it, expect, beforeEach } from 'vitest';
import { resolveProviderConfig } from '../../src/ai/config.js';

describe('resolveProviderConfig', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.GEMINI_API_KEY = 'gemini-key';
    process.env.GROQ_API_KEY = 'groq-key';
  });

  it('resolves the default provider and its default model when nothing is specified', () => {
    const cfg = resolveProviderConfig();
    expect(cfg).toEqual({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      format: 'openai',
      baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: 'groq-key',
    });
  });

  it("uses the overridden provider's own default model when only provider is given", () => {
    const cfg = resolveProviderConfig({ provider: 'gemini' });
    expect(cfg.provider).toBe('gemini');
    expect(cfg.model).toBe('gemini-2.0-flash');
    expect(cfg.apiKey).toBe('gemini-key');
  });

  it('uses an explicit model override as-is', () => {
    const cfg = resolveProviderConfig({ provider: 'gemini', model: 'gemini-1.5-pro' });
    expect(cfg.model).toBe('gemini-1.5-pro');
  });

  it('throws on an unknown provider without touching env or network', () => {
    expect(() => resolveProviderConfig({ provider: 'not-a-provider' }))
      .toThrow('Unknown provider: not-a-provider. Supported: anthropic, openai, gemini, groq, openrouter');
  });
});
