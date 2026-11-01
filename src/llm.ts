import type { Intent } from './types.ts';

/**
 * Optional: let Claude turn free-form text into a structured intent.
 * Claude only PARSES. It has no tools, no keys and no authority: policy.ts
 * decides whether anything is allowed, and the user must still confirm.
 */
export async function parseWithClaude(
  text: string,
  contactNames: string[],
  apiKey: string
): Promise<Intent | null> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5',
      max_tokens: 200,
      system:
        'Extract a payment request. Reply with ONLY JSON: {"amountUsd": number, "recipient": string} ' +
        `where recipient is one of: ${JSON.stringify(contactNames)}. ` +
        'If the message is not a clear payment request, reply {"amountUsd": 0, "recipient": ""}.',
      messages: [{ role: 'user', content: text }],
    }),
  });
  if (!res.ok) return null;
  const data: any = await res.json();
  const raw = (data.content ?? []).map((b: any) => b.text ?? '').join('');
  try {
    const j = JSON.parse(raw.replace(/```json|```/g, '').trim());
    const amountUsd = Number(j.amountUsd);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0 || typeof j.recipient !== 'string' || !j.recipient)
      return null;
    return { amountUsd, recipient: j.recipient };
  } catch {
    return null;
  }
}
