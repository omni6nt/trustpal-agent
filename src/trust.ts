import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

export type ClaimStatus = 'completed' | 'failed' | 'refunded' | 'blocked';

export interface ClaimInput {
  subject: string; // the counterparty the claim is about
  amountUsd: number;
  status: ClaimStatus;
  ref: string; // invoice or payment reference
  at?: string; // ISO timestamp, defaults to now
}

export interface Claim {
  subject: string;
  amountUsd: number;
  status: ClaimStatus;
  ref: string;
  at: string;
  prev: string;
  hash: string;
}

const GENESIS = '0'.repeat(64);

function hashClaim(prev: string, c: Omit<Claim, 'prev' | 'hash'>): string {
  return createHash('sha256')
    .update(JSON.stringify([prev, c.subject, c.amountUsd, c.status, c.ref, c.at]))
    .digest('hex');
}

/** Append-only, hash-chained claim ledger. Editing any past entry breaks verify(). */
export class Ledger {
  claims: Claim[] = [];
  file?: string;

  constructor(file?: string) {
    this.file = file;
    if (file && existsSync(file)) {
      this.claims = readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Claim);
    }
  }

  append(input: ClaimInput): Claim {
    const prev = this.claims.length ? this.claims[this.claims.length - 1].hash : GENESIS;
    const base = {
      subject: input.subject,
      amountUsd: input.amountUsd,
      status: input.status,
      ref: input.ref,
      at: input.at ?? new Date().toISOString(),
    };
    const claim: Claim = { ...base, prev, hash: hashClaim(prev, base) };
    this.claims.push(claim);
    if (this.file) appendFileSync(this.file, JSON.stringify(claim) + '\n');
    return claim;
  }

  verify(): { ok: boolean; brokenAt?: number } {
    let prev = GENESIS;
    for (let i = 0; i < this.claims.length; i++) {
      const c = this.claims[i];
      if (c.prev !== prev || c.hash !== hashClaim(prev, c)) return { ok: false, brokenAt: i };
      prev = c.hash;
    }
    return { ok: true };
  }

  private about(subject: string): Claim[] {
    const s = subject.toLowerCase();
    return this.claims.filter((c) => c.subject.toLowerCase() === s);
  }

  completedCount(subject: string): number {
    return this.about(subject).filter((c) => c.status === 'completed').length;
  }

  /** 0-100. Starts neutral at 50; completed +10, refunded -5, failed -20. */
  score(subject: string): number {
    let s = 50;
    for (const c of this.about(subject)) {
      if (c.status === 'completed') s += 10;
      else if (c.status === 'refunded') s -= 5;
      else if (c.status === 'blocked') continue; // a refused attempt is not a payment outcome
      else s -= 20;
      s = Math.max(0, Math.min(100, s));
    }
    return s;
  }

  spentToday(now: Date = new Date()): number {
    const day = now.toISOString().slice(0, 10);
    return this.claims
      .filter((c) => c.status === 'completed' && c.at.slice(0, 10) === day)
      .reduce((sum, c) => sum + c.amountUsd, 0);
  }
}
