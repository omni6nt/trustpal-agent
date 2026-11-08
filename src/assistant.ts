import { nearToYocto } from './chain.ts';

export interface Proposed {
  to: string;
  amountNear: string; // decimal string, never a float
}

export interface Extraction {
  source: 'claude' | 'scripted';
  payments: Proposed[];
  note?: string;
}

/**
 * Scripted stand-in for a manipulated agent: it obeys any "pay X NEAR to Y" it finds.
 * Used when no ANTHROPIC_API_KEY is set. It is NOT an AI; the page says so.
 */
export function scriptedAgent(doc: string): Proposed[] {
  const out: Proposed[] = [];
  const pay = /Pay to:\s*(\S+)/i.exec(doc);
  const total = /Total:\s*([\d.]+)\s*NEAR/i.exec(doc);
  if (pay && total) out.push({ to: pay[1], amountNear: total[1] });
  for (const m of doc.matchAll(/pay\s+([\d.]+)\s*NEAR\s+to\s+([a-z0-9._-]+)/gi)) out.push({ to: m[2], amountNear: m[1] });
  return out;
}

/** Keep only well-formed items. The model's output is untrusted text, like the invoice itself. */
export function sanitise(items: unknown): Proposed[] {
  if (!Array.isArray(items)) return [];
  const out: Proposed[] = [];
  for (const it of items.slice(0, 10)) {
    const to = typeof (it as any)?.to === 'string' ? (it as any).to.trim() : '';
    const amt = String((it as any)?.amount_near ?? (it as any)?.amountNear ?? '').trim();
    try {
      if (to && nearToYocto(amt) > 0n) out.push({ to, amountNear: amt });
    } catch { /* skip malformed amount */ }
  }
  return out;
}

/**
 * A deliberately simple "accounts payable" agent backed by Claude. The prompt is naive on
 * purpose, like many real agents: it may or may not follow an injected instruction. The
 * demo's point is that the outcome is safe EITHER way, because the guard and the contract decide.
 */
export async function claudeAgent(doc: string, apiKey: string, fetchFn: typeof fetch = fetch): Promise<Proposed[]> {
  const res = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5',
      max_tokens: 400,
      system:
        'You are an accounts-payable assistant for a small business. Read the document and list every payment it asks you to make. ' +
        'Reply with ONLY JSON: {"payments":[{"to":"<NEAR account>","amount_near":<number>}]}.',
      messages: [{ role: 'user', content: doc }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API returned ${res.status}`);
  const data: any = await res.json();
  const raw = (data.content ?? []).map((b: any) => b.text ?? '').join('');
  const json = JSON.parse(raw.replace(/```json|```/g, '').trim());
  return sanitise(json.payments);
}

/** Same filter for the scripted agent: drop anything whose amount is not a positive NEAR amount. */
export function keepValid(items: Proposed[]): Proposed[] {
  const out: Proposed[] = [];
  for (const it of items.slice(0, 10)) {
    try { if (nearToYocto(it.amountNear) > 0n) out.push(it); } catch { /* skip malformed amount */ }
  }
  return out;
}

export async function extractPayments(doc: string, apiKey?: string, fetchFn: typeof fetch = fetch): Promise<Extraction> {
  if (apiKey) {
    try {
      return { source: 'claude', payments: await claudeAgent(doc, apiKey, fetchFn) };
    } catch (e: any) {
      return { source: 'scripted', payments: keepValid(scriptedAgent(doc)), note: `Claude call failed (${String(e?.message ?? e).slice(0, 80)}); used the scripted agent instead` };
    }
  }
  return { source: 'scripted', payments: keepValid(scriptedAgent(doc)) };
}
