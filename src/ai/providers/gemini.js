async function generate({ apiKey, baseUrl, model, systemPrompt, userContent, maxTokens, timeoutMs }) {
  const response = await fetch(`${baseUrl}/${encodeURIComponent(model)}:generateContent?key=${apiKey}`, {
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
    throw new Error(body?.error?.message || `Gemini API returned ${response.status}`);
  }
  const candidate = body?.candidates?.[0];
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
