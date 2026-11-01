import type { Contact, Intent } from './types.ts';

const RE =
  /^\s*(?:please\s+)?(?:send|pay|transfer)\s+\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:usd|usdc|dollars?)?\s+to\s+(.+?)\s*$/i;

/** Deterministic fallback parser. Used when no LLM key is configured. */
export function parseIntent(text: string): Intent | null {
  const m = RE.exec(text);
  if (!m) return null;
  const amountUsd = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return null;
  const recipient = m[2]
    .replace(/\s+in\s+\w+$/i, '')
    .replace(/^my\s+/i, '')
    .trim();
  if (!recipient) return null;
  return { amountUsd, recipient };
}

export function findContact(contacts: Contact[], name: string): Contact | undefined {
  const n = name.trim().toLowerCase();
  return contacts.find(
    (c) => c.name.toLowerCase() === n || (c.aliases ?? []).some((a) => a.toLowerCase() === n)
  );
}
