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
