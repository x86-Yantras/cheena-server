# Multi-Provider AI Reading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI reading provider and model selectable from a config file (with a per-request override), so Anthropic, OpenAI, Gemini, Groq, and OpenRouter (or any future OpenAI-compatible provider) can be tested without code changes.

**Architecture:** A new `src/ai/` module holds one adapter per wire format (`anthropic`, `gemini`, `openai`-compatible) behind a common `generate({ apiKey, baseUrl, model, systemPrompt, userContent, maxTokens, timeoutMs })` signature, a `config.js` that resolves provider/model against `src/config/aiProviders.json` (env-var-only API keys, whitelisted provider names), and an `index.js` orchestrator that owns the area prompts, chart summarization, and dispatch. `aiReadingService.js` becomes a thin re-export so `meKundalis.js` needs only the query-param passthrough and cache/quota-bypass logic added.

**Tech Stack:** Node.js (ESM), vitest + `vi.stubGlobal('fetch', ...)` for mocking, Express, no new dependencies.

## Global Constraints

- No new npm dependencies — use built-in `fetch`, `node:fs`, `node:url`, `node:path`.
- Keep `generateReading` and `VALID_AREAS` exported from `src/aiReadingService.js` with their existing signatures (so `meKundalis.js` imports don't need to change beyond passing two new optional fields).
- API keys never appear in `src/config/aiProviders.json` — only the env var name that holds each key.
- Unknown `provider` query param → `400`, never a raw exception or a request to an arbitrary URL.
- Every adapter throws a plain `Error` (message from the provider's error body, or `"<Provider> API returned <status>"`) on failure, empty text, or truncation — matching the existing Anthropic error wording style so `meKundalis.js`'s catch/502 logic needs no changes.

---

### Task 1: Provider config file + resolver

**Files:**
- Create: `kundali-backend/src/config/aiProviders.json`
- Create: `kundali-backend/src/ai/config.js`
- Test: `kundali-backend/test/ai/config.test.js`
- Modify: `kundali-backend/.env.example`

**Interfaces:**
- Produces: `resolveProviderConfig({ provider, model } = {})` → `{ provider, model, format, baseUrl, apiKey }`. Throws `Error` with message `` `Unknown provider: ${providerName}. Supported: ${list}` `` when `provider` doesn't match a key in the config's `providers` map. When `provider` is omitted, uses `config.defaultProvider`. When `model` is omitted, uses `config.providers[providerName].defaultModel` (never a different provider's default). `apiKey` is read from `process.env[entry.apiKeyEnv]` at call time (not cached), so tests can set env vars per-test.

- [ ] **Step 1: Write the failing test**

Create `kundali-backend/test/ai/config.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd kundali-backend && npx vitest run test/ai/config.test.js`
Expected: FAIL — `Cannot find module '../../src/ai/config.js'`

- [ ] **Step 3: Create the config JSON**

Create `kundali-backend/src/config/aiProviders.json`:

```json
{
  "defaultProvider": "anthropic",
  "providers": {
    "anthropic": {
      "format": "anthropic",
      "apiKeyEnv": "ANTHROPIC_API_KEY",
      "baseUrl": "https://api.anthropic.com/v1/messages",
      "defaultModel": "claude-haiku-4-5-20251001"
    },
    "openai": {
      "format": "openai",
      "apiKeyEnv": "OPENAI_API_KEY",
      "baseUrl": "https://api.openai.com/v1/chat/completions",
      "defaultModel": "gpt-4o-mini"
    },
    "gemini": {
      "format": "gemini",
      "apiKeyEnv": "GEMINI_API_KEY",
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta/models",
      "defaultModel": "gemini-2.0-flash"
    },
    "groq": {
      "format": "openai",
      "apiKeyEnv": "GROQ_API_KEY",
      "baseUrl": "https://api.groq.com/openai/v1/chat/completions",
      "defaultModel": "llama-3.3-70b-versatile"
    },
    "openrouter": {
      "format": "openai",
      "apiKeyEnv": "OPENROUTER_API_KEY",
      "baseUrl": "https://openrouter.ai/api/v1/chat/completions",
      "defaultModel": "meta-llama/llama-3.3-70b-instruct:free"
    }
  }
}
```

- [ ] **Step 4: Implement the resolver**

Create `kundali-backend/src/ai/config.js`:

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(dirname, '..', 'config', 'aiProviders.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

function resolveProviderConfig({ provider, model } = {}) {
  const providerName = provider || config.defaultProvider;
  const entry = config.providers[providerName];
  if (!entry) {
    throw new Error(
      `Unknown provider: ${providerName}. Supported: ${Object.keys(config.providers).join(', ')}`
    );
  }
  return {
    provider: providerName,
    model: model || entry.defaultModel,
    format: entry.format,
    baseUrl: entry.baseUrl,
    apiKey: process.env[entry.apiKeyEnv],
  };
}

export { resolveProviderConfig };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd kundali-backend && npx vitest run test/ai/config.test.js`
Expected: PASS (4 tests)

- [ ] **Step 6: Add new env var placeholders**

Modify `kundali-backend/.env.example`, after the existing `ANTHROPIC_API_KEY` line, add:

```
OPENAI_API_KEY=change-me-to-your-openai-api-key
GEMINI_API_KEY=change-me-to-your-gemini-api-key
GROQ_API_KEY=change-me-to-your-groq-api-key
OPENROUTER_API_KEY=change-me-to-your-openrouter-api-key
```

- [ ] **Step 7: Commit**

```bash
git add src/config/aiProviders.json src/ai/config.js test/ai/config.test.js .env.example
git commit -m "feat(ai): add provider config file and resolver"
```

---

### Task 2: Anthropic adapter

**Files:**
- Create: `kundali-backend/src/ai/providers/anthropic.js`
- Test: `kundali-backend/test/ai/providers/anthropic.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure adapter).
- Produces: `generate({ apiKey, baseUrl, model, systemPrompt, userContent, maxTokens, timeoutMs })` → `Promise<string>`. Throws `Error` on non-OK response, unparsable body, missing text, or `stop_reason === 'max_tokens'`.

- [ ] **Step 1: Write the failing test**

Create `kundali-backend/test/ai/providers/anthropic.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd kundali-backend && npx vitest run test/ai/providers/anthropic.test.js`
Expected: FAIL — `Cannot find module '../../../src/ai/providers/anthropic.js'`

- [ ] **Step 3: Implement the adapter**

Create `kundali-backend/src/ai/providers/anthropic.js`:

```js
async function generate({ apiKey, baseUrl, model, systemPrompt, userContent, maxTokens, timeoutMs }) {
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Anthropic API returned ${response.status} with an unparsable body`);
  }
  if (!response.ok) {
    throw new Error(body.error?.message || `Anthropic API returned ${response.status}`);
  }
  const text = body.content?.[0]?.text;
  if (!text) {
    throw new Error('Anthropic API returned no text content');
  }
  if (body.stop_reason === 'max_tokens') {
    throw new Error('Anthropic API response was truncated (max_tokens reached)');
  }
  return text;
}

export { generate };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd kundali-backend && npx vitest run test/ai/providers/anthropic.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ai/providers/anthropic.js test/ai/providers/anthropic.test.js
git commit -m "feat(ai): extract Anthropic adapter"
```

---

### Task 3: OpenAI-compatible adapter (OpenAI, Groq, OpenRouter)

**Files:**
- Create: `kundali-backend/src/ai/providers/openaiCompatible.js`
- Test: `kundali-backend/test/ai/providers/openaiCompatible.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `generate({ apiKey, baseUrl, model, systemPrompt, userContent, maxTokens, timeoutMs })` → `Promise<string>`, same shape as the Anthropic adapter. Throws `Error` on non-OK response, unparsable body, missing text, or `finish_reason === 'length'`.

- [ ] **Step 1: Write the failing test**

Create `kundali-backend/test/ai/providers/openaiCompatible.test.js`:

```js
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd kundali-backend && npx vitest run test/ai/providers/openaiCompatible.test.js`
Expected: FAIL — `Cannot find module '../../../src/ai/providers/openaiCompatible.js'`

- [ ] **Step 3: Implement the adapter**

Create `kundali-backend/src/ai/providers/openaiCompatible.js`:

```js
async function generate({ apiKey, baseUrl, model, systemPrompt, userContent, maxTokens, timeoutMs }) {
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Provider API returned ${response.status} with an unparsable body`);
  }
  if (!response.ok) {
    throw new Error(body.error?.message || `Provider API returned ${response.status}`);
  }
  const choice = body.choices?.[0];
  const text = choice?.message?.content;
  if (!text) {
    throw new Error('Provider API returned no text content');
  }
  if (choice.finish_reason === 'length') {
    throw new Error('Provider API response was truncated (max_tokens reached)');
  }
  return text;
}

export { generate };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd kundali-backend && npx vitest run test/ai/providers/openaiCompatible.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ai/providers/openaiCompatible.js test/ai/providers/openaiCompatible.test.js
git commit -m "feat(ai): add OpenAI-compatible adapter for OpenAI/Groq/OpenRouter"
```

---

### Task 4: Gemini adapter

**Files:**
- Create: `kundali-backend/src/ai/providers/gemini.js`
- Test: `kundali-backend/test/ai/providers/gemini.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `generate({ apiKey, baseUrl, model, systemPrompt, userContent, maxTokens, timeoutMs })` → `Promise<string>`. Builds the URL as `` `${baseUrl}/${model}:generateContent?key=${apiKey}` ``. Throws `Error` on non-OK response, unparsable body, missing text, or `finishReason === 'MAX_TOKENS'`.

- [ ] **Step 1: Write the failing test**

Create `kundali-backend/test/ai/providers/gemini.test.js`:

```js
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd kundali-backend && npx vitest run test/ai/providers/gemini.test.js`
Expected: FAIL — `Cannot find module '../../../src/ai/providers/gemini.js'`

- [ ] **Step 3: Implement the adapter**

Create `kundali-backend/src/ai/providers/gemini.js`:

```js
async function generate({ apiKey, baseUrl, model, systemPrompt, userContent, maxTokens, timeoutMs }) {
  const response = await fetch(`${baseUrl}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Gemini API returned ${response.status} with an unparsable body`);
  }
  if (!response.ok) {
    throw new Error(body.error?.message || `Gemini API returned ${response.status}`);
  }
  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini API returned no text content');
  }
  if (candidate.finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini API response was truncated (max_tokens reached)');
  }
  return text;
}

export { generate };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd kundali-backend && npx vitest run test/ai/providers/gemini.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ai/providers/gemini.js test/ai/providers/gemini.test.js
git commit -m "feat(ai): add Gemini adapter"
```

---

### Task 5: Orchestrator (`src/ai/index.js`)

**Files:**
- Create: `kundali-backend/src/ai/index.js`
- Test: `kundali-backend/test/ai/index.test.js`

**Interfaces:**
- Consumes: `resolveProviderConfig` from `src/ai/config.js` (Task 1); `generate` from `src/ai/providers/anthropic.js` (Task 2), `src/ai/providers/openaiCompatible.js` (Task 3), `src/ai/providers/gemini.js` (Task 4).
- Produces: `generateReading({ result, area, provider, model })` → `Promise<string>`; `VALID_AREAS` (array of 5 strings, same values as today: `overview`, `career`, `marriage`, `health`, `wealth`). This is the new home for `AREA_PROMPTS` and `summarizeChart`, moved verbatim from `src/aiReadingService.js`.

- [ ] **Step 1: Write the failing test**

Create `kundali-backend/test/ai/index.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd kundali-backend && npx vitest run test/ai/index.test.js`
Expected: FAIL — `Cannot find module '../../src/ai/index.js'`

- [ ] **Step 3: Implement the orchestrator**

Create `kundali-backend/src/ai/index.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd kundali-backend && npx vitest run test/ai/index.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ai/index.js test/ai/index.test.js
git commit -m "feat(ai): add provider-agnostic orchestrator"
```

---

### Task 6: Rewire `aiReadingService.js` as a thin re-export

**Files:**
- Modify: `kundali-backend/src/aiReadingService.js`
- Test: `kundali-backend/test/aiReadingService.test.js` (existing — verify it still passes unchanged)

**Interfaces:**
- Consumes: `generateReading`, `VALID_AREAS` from `src/ai/index.js` (Task 5).
- Produces: same `generateReading`, `VALID_AREAS` exports as before, for `src/routes/meKundalis.js` to keep importing from `../aiReadingService.js`.

- [ ] **Step 1: Replace the file contents**

Replace all of `kundali-backend/src/aiReadingService.js` with:

```js
export { generateReading, VALID_AREAS } from './ai/index.js';
```

- [ ] **Step 2: Run the existing test suite to verify no regression**

Run: `cd kundali-backend && npx vitest run test/aiReadingService.test.js`
Expected: PASS (all 6 existing tests, unchanged file) — this file is not modified, it exercises the re-export transparently.

- [ ] **Step 3: Commit**

```bash
git add src/aiReadingService.js
git commit -m "refactor(ai): make aiReadingService.js a thin re-export of ai/index.js"
```

---

### Task 7: Route query-param passthrough + cache/quota bypass on override

**Files:**
- Modify: `kundali-backend/src/routes/meKundalis.js:140-216` (the `GET /:id/reading` handler)
- Test: `kundali-backend/test/routes/meKundalisReading.route.test.js` (extend)

**Interfaces:**
- Consumes: `generateReading({ result, area, provider, model })` from `../aiReadingService.js` (already imported at `meKundalis.js:6`, signature extended by Task 6).

- [ ] **Step 1: Write the failing tests**

Add to `kundali-backend/test/routes/meKundalisReading.route.test.js`, inside the existing `describe` block, after the `'returns 400 for an invalid area'` test:

```js
  it('returns 400 for an unknown provider override', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'badprovider@example.com');
    const kundaliId = await createKundali(app, token);

    const response = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading?provider=bogus`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(400);
  }, 20000);

  it('passes provider/model overrides through and does not cache or count against quota', async () => {
    const app = createApp();
    const token = await registerAndLogin(app, 'override@example.com');
    const kundaliId = await createKundali(app, token);
    process.env.GEMINI_API_KEY = 'test-gemini-key';

    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('ephemeris')) {
        return {
          ok: true,
          json: async () => ({
            julianDay: 2448026.5,
            ascendantLongitude: 15,
            planetLongitudes: {
              SUN: 10, MOON: 40, MARS: 70, MERCURY: 100,
              JUPITER: 130, VENUS: 160, SATURN: 190, RAHU: 220,
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'A Gemini test reading.' }] }, finishReason: 'STOP' }],
        }),
      };
    });

    const overrideResponse = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading?provider=gemini&model=gemini-1.5-pro`)
      .set('Authorization', `Bearer ${token}`);
    expect(overrideResponse.status).toBe(200);
    expect(overrideResponse.body.content).toBe('A Gemini test reading.');
    const [overrideUrl] = fetchMock.mock.calls.find((c) => !String(c[0]).includes('ephemeris'));
    expect(overrideUrl).toContain('gemini-1.5-pro');

    const { rows: cachedRows } = await getPool().query(
      'SELECT * FROM ai_readings WHERE kundali_id = $1 AND area = $2',
      [kundaliId, 'overview']
    );
    expect(cachedRows).toHaveLength(0);

    const usersRes = await getPool().query('SELECT id FROM users WHERE email = $1', ['override@example.com']);
    const usageRows = await getPool().query(
      'SELECT count FROM ai_reading_usage WHERE user_id = $1 AND usage_date = CURRENT_DATE',
      [usersRes.rows[0].id]
    );
    expect(usageRows.rows).toHaveLength(0);

    const defaultResponse = await request(app)
      .get(`/api/me/kundalis/${kundaliId}/reading`)
      .set('Authorization', `Bearer ${token}`);
    expect(defaultResponse.status).toBe(200);
    expect(defaultResponse.body.cached).toBe(false);
  }, 20000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd kundali-backend && npx vitest run test/routes/meKundalisReading.route.test.js`
Expected: FAIL — the 400-for-unknown-provider case returns 200/502 (no validation yet), and the override case still writes to `ai_readings`/`ai_reading_usage`.

- [ ] **Step 3: Update the route handler**

In `kundali-backend/src/routes/meKundalis.js`, replace lines 140-216 (the whole `router.get('/:id/reading', ...)` handler) with:

```js
router.get('/:id/reading', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(404).json({ error: 'kundali not found' });
    return;
  }
  const area = typeof req.query.area === 'string' ? req.query.area : 'overview';
  if (!VALID_AREAS.includes(area)) {
    res.status(400).json({ error: `area must be one of: ${VALID_AREAS.join(', ')}` });
    return;
  }
  const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
  const model = typeof req.query.model === 'string' ? req.query.model : undefined;
  const isOverride = provider !== undefined || model !== undefined;

  try {
    const pool = getPool();
    const { rows: kundaliRows } = await pool.query(
      'SELECT result FROM kundalis WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (kundaliRows.length === 0) {
      res.status(404).json({ error: 'kundali not found' });
      return;
    }

    if (!isOverride) {
      const { rows: cachedRows } = await pool.query(
        'SELECT content FROM ai_readings WHERE kundali_id = $1 AND area = $2',
        [req.params.id, area]
      );
      if (cachedRows.length > 0) {
        res.json({ area, content: cachedRows[0].content, cached: true });
        return;
      }

      const { rows: usageRows } = await pool.query(
        `INSERT INTO ai_reading_usage (user_id, usage_date, count) VALUES ($1, CURRENT_DATE, 1)
         ON CONFLICT (user_id, usage_date) DO UPDATE SET count = ai_reading_usage.count + 1
         RETURNING count`,
        [req.userId]
      );
      if (usageRows[0].count > DAILY_READING_LIMIT) {
        res.status(429).json({ error: 'daily AI reading limit reached, try again tomorrow' });
        return;
      }
    }

    let content;
    try {
      content = await generateReading({ result: kundaliRows[0].result, area, provider, model });
    } catch (err) {
      console.error(err);
      if (!isOverride) {
        await pool.query(
          'UPDATE ai_reading_usage SET count = count - 1 WHERE user_id = $1 AND usage_date = CURRENT_DATE',
          [req.userId]
        );
      }
      const status = err.message.startsWith('Unknown provider:') ? 400 : 502;
      res.status(status).json({ error: status === 400 ? err.message : 'reading unavailable, try again' });
      return;
    }

    if (isOverride) {
      res.json({ area, content, cached: false });
      return;
    }

    try {
      await pool.query(
        'INSERT INTO ai_readings (kundali_id, area, content) VALUES ($1, $2, $3)',
        [req.params.id, area, content]
      );
    } catch (err) {
      if (err.code === '23505') {
        const { rows } = await pool.query(
          'SELECT content FROM ai_readings WHERE kundali_id = $1 AND area = $2',
          [req.params.id, area]
        );
        res.json({ area, content: rows[0].content, cached: true });
        return;
      }
      throw err;
    }

    res.json({ area, content, cached: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  }
});
```

Note: the unknown-provider check happens inside the `generateReading` try/catch (via `resolveProviderConfig` throwing before any network call), rather than as a separate upfront validation, so the error message and 400 status stay next to the one place `generateReading` is invoked.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd kundali-backend && npx vitest run test/routes/meKundalisReading.route.test.js`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 5: Run the full test suite**

Run: `cd kundali-backend && npm test`
Expected: PASS (all test files, no regressions)

- [ ] **Step 6: Commit**

```bash
git add src/routes/meKundalis.js test/routes/meKundalisReading.route.test.js
git commit -m "feat(ai): support provider/model override via query params, bypass cache/quota for overrides"
```

---

## Manual Verification (optional, requires real API keys)

To actually compare providers locally: set `GEMINI_API_KEY`/`GROQ_API_KEY`/etc. in `.env`, start the server (`npm run dev`), log in, create a kundali, then:

```bash
curl "http://localhost:4000/api/me/kundalis/1/reading?provider=groq" -H "Authorization: Bearer <token>"
curl "http://localhost:4000/api/me/kundalis/1/reading?provider=gemini&model=gemini-1.5-pro" -H "Authorization: Bearer <token>"
```

Compare `content` across responses. Confirm `ai_readings` table gained no rows for these override calls (`SELECT * FROM ai_readings WHERE kundali_id = 1`).
