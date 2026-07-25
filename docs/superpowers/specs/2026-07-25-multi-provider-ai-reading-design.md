# Multi-provider AI reading design

## Problem

`kundali-backend/src/aiReadingService.js` calls Anthropic only, via a raw `fetch()` with the model (`claude-haiku-4-5-20251001`), API key env var, and endpoint all hardcoded. There is no way to try a different model or provider (Gemini, Groq, OpenAI, OpenRouter, or others) without editing source.

## Goals

- Make provider + model selectable from a config file, with a default.
- Allow overriding provider/model per request (for comparing outputs during development).
- Support Anthropic, OpenAI, Gemini, Groq, OpenRouter, and let new OpenAI-compatible providers be added via config only (no new code).
- Keep the existing `generateReading` / `VALID_AREAS` exports and calling convention in `meKundalis.js` intact.

## Architecture

New `kundali-backend/src/ai/` module:

- `providers/anthropic.js` — Anthropic Messages API adapter.
- `providers/gemini.js` — Google Gemini generateContent API adapter.
- `providers/openaiCompatible.js` — shared adapter for any OpenAI chat-completions-shaped API (OpenAI, Groq, OpenRouter, future providers), parameterized by `baseUrl`.
- `config.js` — loads `kundali-backend/src/config/aiProviders.json`, resolves each provider's API key from its configured env var.
- `index.js` — `generateReading({ result, area, provider?, model? })`: validates `area`, resolves provider (query override or config default) against the config whitelist, resolves model (override or config default), dispatches to the adapter matching `providers[provider].format`, returns the reading text.

`aiReadingService.js` becomes a thin wrapper: keeps `generateReading` and `VALID_AREAS` exported with the same signature (plus new optional `provider`/`model` fields), delegates to `ai/index.js`. `meKundalis.js` passes `req.query.provider` / `req.query.model` through unchanged otherwise.

## Config file

`kundali-backend/src/config/aiProviders.json`:

```json
{
  "defaultProvider": "anthropic",
  "providers": {
    "anthropic": { "format": "anthropic", "apiKeyEnv": "ANTHROPIC_API_KEY", "baseUrl": "https://api.anthropic.com/v1/messages", "defaultModel": "claude-haiku-4-5-20251001" },
    "openai":    { "format": "openai",    "apiKeyEnv": "OPENAI_API_KEY",    "baseUrl": "https://api.openai.com/v1/chat/completions", "defaultModel": "gpt-4o-mini" },
    "gemini":    { "format": "gemini",    "apiKeyEnv": "GEMINI_API_KEY",    "baseUrl": "https://generativelanguage.googleapis.com/v1beta/models", "defaultModel": "gemini-2.0-flash" },
    "groq":      { "format": "openai",    "apiKeyEnv": "GROQ_API_KEY",      "baseUrl": "https://api.groq.com/openai/v1/chat/completions", "defaultModel": "llama-3.3-70b-versatile" },
    "openrouter":{ "format": "openai",    "apiKeyEnv": "OPENROUTER_API_KEY","baseUrl": "https://openrouter.ai/api/v1/chat/completions", "defaultModel": "meta-llama/llama-3.3-70b-instruct:free" }
  }
}
```

`format` selects which adapter handles the request (`anthropic`, `gemini`, or `openai` for any OpenAI-compatible provider). Adding a new OpenAI-compatible provider requires only a new entry in `providers` — no code change. API keys are never stored in this file; only the name of the env var holding each key.

Each provider carries its own `defaultModel` (not one global default) — overriding `provider` alone (e.g. `?provider=gemini`) must not fall back to another provider's model name.

`.env.example` gains `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` placeholders alongside the existing `ANTHROPIC_API_KEY`.

## Request override

The reading route accepts optional `?provider=` and `?model=` query params.

- `provider`, if given, must match a key in `config.providers` (whitelist check) — unknown provider returns `400` with a clear error. This prevents a query param from injecting an arbitrary `baseUrl`/adapter.
- `model`, if given, is passed through to the provider as-is — no whitelist, since a bad model name simply produces a provider-side error, not a security concern.
- If `provider` is omitted, `config.defaultProvider` supplies it; if `model` is omitted, the resolved provider's own `defaultModel` supplies it (never another provider's default).
- When either `provider` or `model` is explicitly overridden, the route **bypasses the `ai_readings` cache read/write and the daily quota counter** for that request. Without this, a one-off test call to Gemini would get cached under `(kundali_id, area)` and silently served back as the "reading" for that area afterward (including to the default Anthropic path), and would burn the user's daily quota for what is a dev/test comparison, not a real reading request.

## Error handling

Each adapter normalizes failures to the same pattern already in use: throw `Error` with the provider's error message when available, otherwise `"<Provider> API returned <status>"`. Truncated/empty responses throw with the same wording style as today (`"...response was truncated (max_tokens reached)"`, `"...returned no text content"`). This keeps the `meKundalis.js` catch/error-response logic unchanged.

## Testing

- Extend `test/aiReadingService.test.js` coverage per-adapter: one test file each for `anthropic.js`, `gemini.js`, `openaiCompatible.js`, mocking global `fetch` as the existing test does.
- Add a `config.js` test covering: default resolution, valid override, and rejection of an unknown provider (400/whitelist behavior).
- `test/routes/meKundalisReading.route.test.js` extended to cover passing `provider`/`model` query params through and the 400 rejection path.

## Out of scope

- Streaming responses.
- A UI/admin panel for editing the config file (it's hand-edited JSON for now).
- Automatic fallback to a second provider on failure.
