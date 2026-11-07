import { Account, JsonRpcProvider, KeyPairSigner } from 'near-api-js';

/** 1 NEAR = 10^24 yoctoNEAR. Parsed as a string so no precision is ever lost. */
export function nearToYocto(near: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,24}))?$/.exec(near.trim());
  if (!m) throw new Error(`Not a valid NEAR amount: "${near}"`);
  return BigInt(m[1]) * 10n ** 24n + BigInt((m[2] ?? '').padEnd(24, '0'));
}

export function yoctoToNear(y: bigint): string {
  const whole = y / 10n ** 24n;
  const frac = (y % 10n ** 24n).toString().padStart(24, '0').slice(0, 4).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export interface PolicyView {
  maxPerPayment: bigint;
  dailyCap: bigint;
  remainingToday: bigint;
  paused: boolean;
  cooldownSeconds: number;
  pendingTotal: bigint;
  revenueTotal: bigint;
}

export interface ApprovalInfo {
  reference: string;
  recipient: string;
  amount: bigint;
  expiresMs: number;
}

export interface SplitShare {
  account: string;
  bps: number;
}

export interface AccountInfo {
  exists: boolean;
  isContract: boolean;
  balance: bigint;
}

export type PayOutcome =
  // settled=false means the contract accepted the request but the transfer has not been confirmed yet
  | { ok: true; txHash?: string; settled: boolean }
  | { ok: false; error: string };

/** What the agent is allowed to do on chain: look, and ask the contract to pay. Nothing else. */
export interface Chain {
  isAllowed(address: string): Promise<boolean>;
  policy(): Promise<PolicyView>;
  /** Earliest time (ms since epoch) this recipient can be paid, or null if not approved. */
  payableAfterMs(address: string): Promise<number | null>;
  /** The owner's approval for this exact reference, if one is open. */
  approval(reference: string): Promise<ApprovalInfo | null>;
  listApprovals(): Promise<ApprovalInfo[]>;
  /** Addresses on the owner's standing approved list. */
  recipients(): Promise<string[]>;
  split(): Promise<SplitShare[]>;
  /** What the chain says about an address: does it exist, is it a contract. */
  accountInfo(address: string): Promise<AccountInfo>;
  /** NEAR held by the policy contract (the treasury). */
  treasuryBalance(): Promise<bigint>;
  pay(recipient: string, amount: bigint, reference: string): Promise<PayOutcome>;
}

/**
 * Offline stand-in that applies the SAME rules as contract/src/lib.rs, in the same order,
 * with the same messages. It exists so the demo and tests run with no network.
 * It is NOT the security boundary: the real one is the deployed contract.
 */
export class MockChain implements Chain {
  private used = new Set<string>();
  private reserved = 0n;
  private allow: Set<string>;
  private max: bigint;
  private cap: bigint;
  private balance: bigint;
  private paused: boolean;
  approvedAtMs = new Map<string, number>();
  cooldownSeconds = 0;
  now = () => Date.now();
  constructor(allow: Set<string>, max: bigint, cap: bigint, balance: bigint, paused = false) {
    this.allow = allow; this.max = max; this.cap = cap; this.balance = balance; this.paused = paused;
    for (const a of allow) this.approvedAtMs.set(a, 0);
  }
  accounts = new Map<string, AccountInfo>();
  approvals = new Map<string, ApprovalInfo>();
  shares: SplitShare[] = [];
  revenue = 0n;
  // --- owner-only actions (the agent never has these); used by tests and the offline demo
  approvePayment(reference: string, recipient: string, amount: bigint, seconds: number) {
    this.approvals.set(reference, { reference, recipient, amount, expiresMs: this.now() + seconds * 1000 });
  }
  setLimits(max: bigint, cap: bigint) {
    if (max <= 0n) throw new Error('Max per payment must be above zero');
    if (cap < max) throw new Error('Daily limit cannot be lower than the per-payment limit');
    this.max = max; this.cap = cap;
  }
  addRecipient(a: string) { if (!this.allow.has(a)) { this.allow.add(a); this.approvedAtMs.set(a, this.now()); } }
  removeRecipient(a: string) { this.allow.delete(a); this.approvedAtMs.delete(a); }
  setPaused(p: boolean) { this.paused = p; }
  setSplit(shares: SplitShare[]) {
    if (shares.reduce((s, x) => s + x.bps, 0) > 10_000) throw new Error('Shares cannot add up to more than 10000 basis points');
    this.shares = shares;
  }
  /** What each share receives. Whatever is not paid out (treasury share + rounding dust) is retained, like the contract. */
  receiveRevenue(amount: bigint): { payouts: { account: string; amount: bigint }[]; retained: bigint } {
    if (!this.shares.length) throw new Error('No revenue split has been configured');
    let paid = 0n;
    const payouts = this.shares.map((s) => {
      const a = (amount * BigInt(s.bps)) / 10_000n;
      paid += a;
      return { account: s.account, amount: a };
    });
    this.revenue += amount;
    this.balance += amount - paid;
    return { payouts, retained: amount - paid };
  }
  async treasuryBalance() { return this.balance; }
  async recipients() { return [...this.allow]; }
  async approval(r: string) { return this.approvals.get(r) ?? null; }
  async listApprovals() { return [...this.approvals.values()]; }
  async split() { return this.shares; }
  async accountInfo(a: string): Promise<AccountInfo> {
    return this.accounts.get(a) ?? { exists: true, isContract: false, balance: 10n ** 24n };
  }
  async payableAfterMs(a: string) {
    return this.allow.has(a) ? (this.approvedAtMs.get(a) ?? 0) + this.cooldownSeconds * 1000 : null;
  }
  async isAllowed(a: string) { return this.allow.has(a); }
  async policy(): Promise<PolicyView> {
    return { maxPerPayment: this.max, dailyCap: this.cap, remainingToday: this.cap - this.reserved, paused: this.paused, cooldownSeconds: this.cooldownSeconds, pendingTotal: 0n, revenueTotal: this.revenue };
  }
  async pay(recipient: string, amount: bigint, reference: string): Promise<PayOutcome> {
    if (this.paused) return { ok: false, error: 'BLOCKED: payments are paused' };
    if (reference.length < 1 || reference.length > 64) return { ok: false, error: 'reference must be 1-64 characters' };
    if (this.used.has(reference)) return { ok: false, error: 'BLOCKED: this payment reference was already used' };
    if (amount <= 0n) return { ok: false, error: 'Amount must be above zero' };
    const appr = this.approvals.get(reference);
    if (appr) {
      if (appr.recipient !== recipient || appr.amount !== amount)
        return { ok: false, error: 'BLOCKED: this payment does not match what the owner approved for this reference' };
      if (this.now() > appr.expiresMs) return { ok: false, error: "BLOCKED: the owner's approval for this reference has expired" };
    } else {
      if (!this.allow.has(recipient)) return { ok: false, error: 'BLOCKED: recipient is not on the approved list' };
      if (this.now() < ((await this.payableAfterMs(recipient)) ?? 0)) return { ok: false, error: 'BLOCKED: recipient was approved too recently (cooldown not finished)' };
      if (amount > this.max) return { ok: false, error: 'BLOCKED: amount is over the per-payment limit' };
    }
    if (this.reserved + amount > this.cap) return { ok: false, error: 'BLOCKED: amount is over the remaining daily limit' };
    if (amount > this.balance) return { ok: false, error: 'the policy contract does not hold enough funds' };
    if (appr) this.approvals.delete(reference);
    this.used.add(reference);
    this.reserved += amount;
    this.balance -= amount;
    return { ok: true, txHash: 'mock-' + reference, settled: true };
  }
}

/**
 * Real NEAR testnet adapter. It signs with the agent's RESTRICTED key (function-call key,
 * limited to `pay` on the policy contract). Even if this code were fully hijacked, the key
 * cannot transfer NEAR, add keys or call anything else; and the contract rules still apply.
 */
export class NearChain implements Chain {
  private provider: JsonRpcProvider;
  private account: Account;
  private contractId: string;
  constructor(
    ownerId: string,
    contractId: string,
    agentKey: string, // "ed25519:..." read from .env, never printed
    rpcUrl = 'https://rpc.testnet.fastnear.com'
  ) {
    this.contractId = contractId;
    this.provider = new JsonRpcProvider({ url: rpcUrl });
    this.account = new Account(ownerId, this.provider, KeyPairSigner.fromSecretKey(agentKey as any));
  }
  private view<T>(method: string, args: object): Promise<T> {
    return this.provider.callFunction({ contractId: this.contractId, method, args }) as Promise<T>;
  }
  async isAllowed(a: string) { return await this.view<boolean>('is_allowed', { account_id: a }); }
  async policy(): Promise<PolicyView> {
    const p = await this.view<any>('get_policy', {});
    return {
      maxPerPayment: BigInt(p.max_per_payment),
      dailyCap: BigInt(p.daily_cap),
      remainingToday: BigInt(p.remaining_today),
      paused: !!p.paused,
      cooldownSeconds: Number(p.cooldown_seconds ?? 0),
      pendingTotal: BigInt(p.pending_total ?? '0'),
      revenueTotal: BigInt(p.revenue_total ?? '0'),
    };
  }
  private toApproval(a: any): ApprovalInfo {
    return {
      reference: a.reference,
      recipient: a.recipient,
      amount: BigInt(a.amount),
      expiresMs: Number(BigInt(a.expires_at) / 1_000_000n),
    };
  }
  async approval(reference: string): Promise<ApprovalInfo | null> {
    const a = await this.view<any>('get_approval', { reference });
    return a ? this.toApproval(a) : null;
  }
  async recipients(): Promise<string[]> {
    return await this.view<string[]>('get_recipients', {});
  }
  async listApprovals(): Promise<ApprovalInfo[]> {
    return (await this.view<any[]>('list_approvals', {})).map((a) => this.toApproval(a));
  }
  async split(): Promise<SplitShare[]> {
    return (await this.view<any[]>('get_split', {})).map((s) => ({ account: s.account_id, bps: Number(s.bps) }));
  }
  async treasuryBalance(): Promise<bigint> {
    const v: any = await this.provider.viewAccount({ accountId: this.contractId });
    return BigInt(v.amount ?? 0);
  }
  async accountInfo(a: string): Promise<AccountInfo> {
    try {
      const v: any = await this.provider.viewAccount({ accountId: a });
      const hash = String(v.codeHash ?? v.code_hash ?? '');
      return { exists: true, isContract: hash !== '' && !/^1+$/.test(hash), balance: BigInt(v.amount ?? 0) };
    } catch (e: any) {
      // Only a clear "no such account" answer counts as non-existent; any other failure is rethrown.
      if (/does not exist|UNKNOWN_ACCOUNT|doesn't exist/i.test(String(e?.message ?? e) + String(e?.type ?? ''))) {
        return { exists: false, isContract: false, balance: 0n };
      }
      throw e;
    }
  }
  async payableAfterMs(a: string): Promise<number | null> {
    const v = await this.view<string | null>('payable_after', { account_id: a });
    return v === null ? null : Number(BigInt(v) / 1_000_000n); // ns -> ms
  }
  async pay(recipient: string, amount: bigint, reference: string): Promise<PayOutcome> {
    try {
      const out: any = await this.account.callFunction({
        contractId: this.contractId,
        methodName: 'pay',
        args: { recipient, amount: amount.toString(), reference },
        gas: 50_000_000_000_000n,
        deposit: 0n,
      });
      const txHash = out?.transaction?.hash ?? undefined;
      // The contract pays in a second step (callback). Only report "settled" once the
      // contract itself says Completed; a Failed transfer is reported as an error.
      for (let i = 0; i < 12; i++) {
        const p = await this.view<any>('get_payment', { reference }).catch(() => null);
        const st = p?.status;
        if (st === 'Completed') return { ok: true, txHash, settled: true };
        if (st === 'Failed') return { ok: false, error: 'Transfer failed after the contract accepted it; the reservation was released' };
        await new Promise((r) => setTimeout(r, 1500));
      }
      return { ok: true, txHash, settled: false };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e).slice(0, 300) };
    }
  }
}
