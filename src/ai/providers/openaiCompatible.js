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
    throw new Error(body?.error?.message || `Provider API returned ${response.status}`);
  }
  const choice = body?.choices?.[0];
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
