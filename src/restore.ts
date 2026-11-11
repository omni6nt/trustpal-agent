import type { Claim } from './trust.ts';

export interface Restored { at: string; label: string; outcome: 'paid' | 'stopped' | 'info'; headline: string; to: string; amount?: string }

/** Turn the saved log back into activity rows after a restart. The log is a local record, not the authority:
 *  every row says so, and nothing is marked paid unless the log itself recorded a completed payment. */
export function restoreActivity(claims: Claim[], max = 40): Restored[] {
  return claims.slice(-max).map((c) => ({
    at: c.at,
    label: 'Earlier session (from the local log)',
    outcome: c.status === 'completed' ? 'paid' : c.status === 'failed' || c.status === 'blocked' ? 'stopped' : 'info',
    headline: `${c.status.toUpperCase()} (${c.ref})${c.amountNear ? `: ${c.amountNear} NEAR` : ''} to ${c.subject}. Recorded in the local log; the blockchain is the authoritative record.`,
    to: c.subject,
    amount: c.amountNear,
  }));
}
