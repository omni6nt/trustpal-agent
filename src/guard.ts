import type { Chain, PayOutcome } from './chain.ts';
import { yoctoToNear } from './chain.ts';
import { checkCounterparty, type BlocklistEntry, type Check } from './counterparty.ts';
import type { Ledger } from './trust.ts';

export interface GuardDeps {
  chain: Chain;
  blocklist: BlocklistEntry[];
  ledger: Ledger; // audit trail; hash-chained, tamper-evident
  askHuman: (prompt: string) => Promise<boolean>;
  log: (m: string) => void;
}

export type GuardResult =
  | { status: 'PAID' | 'PENDING'; check: Check; outcome: PayOutcome }
  | { status: 'REFUSED_BY_GUARD' | 'DECLINED_BY_HUMAN'; check: Check }
  | { status: 'REJECTED_BY_CONTRACT'; check: Check; error: string };

/**
 * Wrapper around the only action that moves money. Order:
 *   counterparty check -> BLOCK: refuse, WARN: ask a human, ALLOW: continue
 *   -> ask the contract (which enforces limits itself) -> audit log either way.
 * The guard is a second layer. If it is bypassed or buggy, the contract still refuses.
 */
export async function guardedPay(
  recipient: string,
  amount: bigint,
  reference: string,
  deps: GuardDeps
): Promise<GuardResult> {
  const check = await checkCounterparty(recipient, deps);
  const label = `${yoctoToNear(amount)} NEAR -> ${recipient}`;
  deps.log(`check ${label}: ${check.verdict}`);
  check.reasons.forEach((r) => deps.log(`   - ${r}`));

  if (check.verdict === 'BLOCK') {
    deps.ledger.append({ subject: recipient, amountUsd: 0, status: 'blocked', ref: reference });
    return { status: 'REFUSED_BY_GUARD', check };
  }
  if (check.verdict === 'WARN') {
    const ok = await deps.askHuman(`WARNING for ${label}:\n  ${check.reasons.join('\n  ')}\nProceed?`);
    if (!ok) {
      deps.ledger.append({ subject: recipient, amountUsd: 0, status: 'blocked', ref: reference });
      return { status: 'DECLINED_BY_HUMAN', check };
    }
  }

  const outcome = await deps.chain.pay(recipient, amount, reference);
  // Accepted but not yet confirmed: do NOT record it as completed.
  if (outcome.ok && !outcome.settled) {
    deps.log('Payment accepted by the contract but not confirmed yet. Not recorded as completed.');
    return { status: 'PENDING', check, outcome };
  }
  deps.ledger.append({
    subject: recipient,
    amountUsd: 0, // amounts here are NEAR, not USD; the ledger field is only used by the USD flow
    status: outcome.ok ? 'completed' : 'blocked',
    ref: reference,
  });
  if (!outcome.ok) return { status: 'REJECTED_BY_CONTRACT', check, error: outcome.error };
  return { status: 'PAID', check, outcome };
}
