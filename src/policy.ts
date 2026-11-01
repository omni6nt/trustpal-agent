export interface Policy {
  maxPerTxUsd: number;
  maxDailyUsd: number;
  maxFeePct: number;
  minTrustScore: number;
  /** Cap for counterparties with fewer than `trustedAfter` completed payments. */
  newCounterpartyMaxUsd: number;
  trustedAfter: number;
}

export const DEFAULT_POLICY: Policy = {
  maxPerTxUsd: 200,
  maxDailyUsd: 300,
  maxFeePct: 3,
  minTrustScore: 30,
  newCounterpartyMaxUsd: 20,
  trustedAfter: 3,
};

export interface PolicyContext {
  amountUsd: number;
  feeUsd: number;
  spentTodayUsd: number;
  trustScore: number;
  completedCount: number;
}

export interface Decision {
  allowed: boolean;
  reasons: string[];
}

/**
 * Pure, deterministic checks. The AI model never decides whether money moves:
 * this function does, and it cannot be talked out of its answer.
 */
export function evaluate(p: Policy, c: PolicyContext): Decision {
  const reasons: string[] = [];
  if (c.amountUsd > p.maxPerTxUsd)
    reasons.push(`Amount $${c.amountUsd} exceeds the per-payment limit of $${p.maxPerTxUsd}.`);
  if (c.spentTodayUsd + c.amountUsd > p.maxDailyUsd)
    reasons.push(
      `This would bring today's total to $${c.spentTodayUsd + c.amountUsd}, over the daily limit of $${p.maxDailyUsd}.`
    );
  const feePct = c.amountUsd > 0 ? (c.feeUsd / c.amountUsd) * 100 : 100;
  if (feePct > p.maxFeePct)
    reasons.push(`Fee is ${feePct.toFixed(2)}%, above the ${p.maxFeePct}% limit.`);
  if (c.trustScore < p.minTrustScore)
    reasons.push(`Recipient trust score ${c.trustScore} is below the minimum of ${p.minTrustScore}.`);
  if (c.completedCount < p.trustedAfter && c.amountUsd > p.newCounterpartyMaxUsd)
    reasons.push(
      `New recipient (${c.completedCount}/${p.trustedAfter} completed payments): first payments are capped at $${p.newCounterpartyMaxUsd}.`
    );
  return { allowed: reasons.length === 0, reasons };
}
