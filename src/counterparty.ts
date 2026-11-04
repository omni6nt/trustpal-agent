import type { Chain } from './chain.ts';
import type { Ledger } from './trust.ts';

/** Edit distance (insert/delete/replace). Used to spot look-alike addresses. */
export function editDistance(a: string, b: string): number {
  const d: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

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
 *  5. look-alike detection against the approved list (edit distance of 2 or less)
 *  6. what the chain itself says: does the account exist, is it a contract
 * It does NOT claim to know global reputation; a clean result means "no red flags found".
 */
export async function checkCounterparty(
  address: string,
  deps: { chain: Chain; blocklist: BlocklistEntry[]; ledger: Ledger; now?: () => number }
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

  // Look-alike check: an address that is almost, but not exactly, one the owner approved.
  try {
    const known = new Set<string>([
      ...(await deps.chain.recipients()),
      ...(await deps.chain.listApprovals()).map((a) => a.recipient),
    ]);
    if (!known.has(address)) {
      for (const k of known) {
        if (k.length >= 6 && editDistance(address, k) <= 2) {
          reasons.push(`Looks almost identical to ${k}, an address you approved. Possible look-alike scam address`);
          bump('BLOCK');
          break;
        }
      }
    }
  } catch { /* lookup failed; the other checks still run */ }

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
    const after = await deps.chain.payableAfterMs(address);
    const now = (deps.now ?? Date.now)();
    if (after !== null && now < after) {
      reasons.push(`Approved too recently: the contract will not pay it for another ${Math.ceil((after - now) / 1000)}s (new-recipient cooldown)`);
      bump('BLOCK');
    }
  }

  let info: Awaited<ReturnType<Chain['accountInfo']>> | null = null;
  try {
    info = await deps.chain.accountInfo(address);
  } catch {
    reasons.push('Could not check this account on the network right now');
    bump('WARN');
  }
  if (!info) {
    // already warned above
  } else if (!info.exists) {
    reasons.push('This account does not exist on the NEAR network (typo, or not created yet)');
    bump('BLOCK');
  } else if (info.isContract) {
    reasons.push('This address is a smart contract, not a normal wallet');
    bump('WARN');
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
