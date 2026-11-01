import { findContact, parseIntent } from './parse.ts';
import { evaluate } from './policy.ts';
import type { Policy } from './policy.ts';
import type { Ledger } from './trust.ts';
import type { Contact, Intent, SwapProvider } from './types.ts';

export interface Deps {
  provider: SwapProvider;
  ledger: Ledger;
  policy: Policy;
  contacts: Contact[];
  confirm: (summary: string) => Promise<boolean>;
  log: (msg: string) => void;
  ngnPerUsd: number;
  parse?: (text: string) => Promise<Intent | null>;
}

export type Outcome =
  | 'done'
  | 'blocked'
  | 'cancelled'
  | 'unparsed'
  | 'unknown_contact'
  | 'failed'
  | 'pending';

export async function handle(text: string, d: Deps): Promise<Outcome> {
  const intent = (await d.parse?.(text)) ?? parseIntent(text);
  if (!intent) {
    d.log('I could not understand that. Try: "send $20 to Mum".');
    return 'unparsed';
  }
  const contact = findContact(d.contacts, intent.recipient);
  if (!contact) {
    d.log(`I don't have a contact called "${intent.recipient}". Add them to contacts.json first.`);
    return 'unknown_contact';
  }

  const input = { amountUsd: intent.amountUsd, contact };
  const quote = await d.provider.quote(input);
  const trustScore = d.ledger.score(contact.name);
  const completedCount = d.ledger.completedCount(contact.name);
  const decision = evaluate(d.policy, {
    amountUsd: intent.amountUsd,
    feeUsd: quote.feeUsd,
    spentTodayUsd: d.ledger.spentToday(),
    trustScore,
    completedCount,
  });

  if (!decision.allowed) {
    d.log('BLOCKED by spending policy:');
    for (const r of decision.reasons) d.log(`  - ${r}`);
    return 'blocked';
  }

  const estNgn = Math.round(quote.amountOutUsd * d.ngnPerUsd);
  const summary =
    `Send $${intent.amountUsd} to ${contact.name} (${contact.chain})\n` +
    `  Fee: $${quote.feeUsd}   They receive: ~$${quote.amountOutUsd} (~NGN ${estNgn.toLocaleString('en-US')}, indicative)\n` +
    `  ETA: ~${quote.etaSeconds}s   Trust: ${trustScore}/100 (${completedCount} completed)`;

  if (!(await d.confirm(summary))) {
    d.log('Cancelled. Nothing was sent.');
    return 'cancelled';
  }

  const result = await d.provider.execute(input, d.log);
  if (result.status === 'TIMEOUT') {
    d.log(`Still pending (ref ${result.ref}). No claim recorded yet; check the explorer.`);
    return 'pending';
  }
  const status =
    result.status === 'SUCCESS' ? 'completed' : result.status === 'REFUNDED' ? 'refunded' : 'failed';
  const claim = d.ledger.append({
    subject: contact.name,
    amountUsd: intent.amountUsd,
    status,
    ref: result.ref,
  });
  d.log(
    `${status.toUpperCase()}. Claim ${claim.hash.slice(0, 10)}... recorded. ${contact.name} trust: ${d.ledger.score(contact.name)}/100`
  );
  return status === 'completed' ? 'done' : 'failed';
}
