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
}

export type PayOutcome =
  | { ok: true; txHash?: string }
  | { ok: false; error: string };

/** What the agent is allowed to do on chain: look, and ask the contract to pay. Nothing else. */
export interface Chain {
  isAllowed(address: string): Promise<boolean>;
  policy(): Promise<PolicyView>;
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
  constructor(allow: Set<string>, max: bigint, cap: bigint, balance: bigint, paused = false) {
    this.allow = allow; this.max = max; this.cap = cap; this.balance = balance; this.paused = paused;
  }
  async isAllowed(a: string) { return this.allow.has(a); }
  async policy(): Promise<PolicyView> {
    return { maxPerPayment: this.max, dailyCap: this.cap, remainingToday: this.cap - this.reserved, paused: this.paused };
  }
  async pay(recipient: string, amount: bigint, reference: string): Promise<PayOutcome> {
    if (this.paused) return { ok: false, error: 'BLOCKED: payments are paused' };
    if (reference.length < 1 || reference.length > 64) return { ok: false, error: 'reference must be 1-64 characters' };
    if (this.used.has(reference)) return { ok: false, error: 'BLOCKED: this payment reference was already used' };
    if (!this.allow.has(recipient)) return { ok: false, error: 'BLOCKED: recipient is not on the approved list' };
    if (amount <= 0n) return { ok: false, error: 'Amount must be above zero' };
    if (amount > this.max) return { ok: false, error: 'BLOCKED: amount is over the per-payment limit' };
    if (this.reserved + amount > this.cap) return { ok: false, error: 'BLOCKED: amount is over the remaining daily limit' };
    if (amount > this.balance) return { ok: false, error: 'the policy contract does not hold enough funds' };
    this.used.add(reference);
    this.reserved += amount;
    this.balance -= amount;
    return { ok: true, txHash: 'mock-' + reference };
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
    };
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
      return { ok: true, txHash: out?.transaction?.hash ?? undefined };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e).slice(0, 300) };
    }
  }
}
