import type { Chain } from './chain.ts';
import type { Ledger } from './trust.ts';

export type Verdict = 'ALLOW' | 'WARN' | 'BLOCK';
export interface Check {
  verdict: Verdict;
  reasons: string[];
}

export interface BlocklistEntry {
  address: string;
  evidence: string; // WHY it is listed. No evidence, no entry.
}

/**
 * Pre-signing counterparty check. Deterministic, explainable, no AI.
 * Signals used (all real, nothing invented):
 *  1. the on-chain approved list (the contract's own answer)
 *  2. a local blocklist where every entry carries evidence
 *  3. our own payment history with this exact address (not a name)
 *  4. address format sanity
 * It does NOT claim to know global reputation; a clean result means "no red flags found".
 */
export async function checkCounterparty(
  address: string,
  deps: { chain: Chain; blocklist: BlocklistEntry[]; ledger: Ledger }
): Promise<Check> {
  const reasons: string[] = [];
  let verdict: Verdict = 'ALLOW';
  const bump = (v: Verdict) => {
    if (v === 'BLOCK' || (v === 'WARN' && verdict === 'ALLOW')) verdict = v;
  };

  if (!/^[a-z0-9._-]{2,64}$/.test(address)) {
    reasons.push('Address is not a valid NEAR account id');
    bump('BLOCK');
    return { verdict, reasons };
  }

  const hit = deps.blocklist.find((b) => b.address === address);
  if (hit) {
    reasons.push(`On blocklist: ${hit.evidence}`);
    bump('BLOCK');
  }

  if (!(await deps.chain.isAllowed(address))) {
    reasons.push('Not on the contract\'s approved recipient list (the owner has not approved this address)');
    bump('BLOCK');
  } else {
    reasons.push('On the contract\'s approved recipient list');
  }

  const done = deps.ledger.completedCount(address);
  if (done === 0 && verdict !== 'BLOCK') {
    reasons.push('First payment to this address: no history yet');
    bump('WARN');
  } else if (done > 0) {
    reasons.push(`${done} earlier completed payment(s) to this exact address`);
  }

  return { verdict, reasons };
}
