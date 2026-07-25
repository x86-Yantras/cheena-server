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
    throw new Error(body?.error?.message || `Anthropic API returned ${response.status}`);
  }
  const text = body?.content?.[0]?.text;
  if (!text) {
    throw new Error('Anthropic API returned no text content');
  }
  if (body.stop_reason === 'max_tokens') {
    throw new Error('Anthropic API response was truncated (max_tokens reached)');
  }
  return text;
}

export { generate };
