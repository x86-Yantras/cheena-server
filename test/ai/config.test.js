import { describe, it, expect, beforeEach } from 'vitest';
import { resolveProviderConfig } from '../../src/ai/config.js';

describe('resolveProviderConfig', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.GEMINI_API_KEY = 'gemini-key';
  });

  it('resolves the default provider and its default model when nothing is specified', () => {
    const cfg = resolveProviderConfig();
    expect(cfg).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      format: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      apiKey: 'anthropic-key',
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
