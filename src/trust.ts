import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

export type ClaimStatus = 'completed' | 'failed' | 'refunded' | 'blocked';

export interface ClaimInput {
  subject: string; // the counterparty the claim is about
  amountUsd: number;
  amountNear?: string; // the NEAR amount (decimal text) when the claim is about a NEAR payment
  status: ClaimStatus;
  ref: string; // invoice or payment reference
  at?: string; // ISO timestamp, defaults to now
}

export interface Claim {
  subject: string;
  amountUsd: number;
  amountNear?: string;
  status: ClaimStatus;
  ref: string;
  at: string;
  prev: string;
  hash: string;
}

const GENESIS = '0'.repeat(64);

function hashClaim(prev: string, c: Omit<Claim, 'prev' | 'hash'>): string {
  return createHash('sha256')
    // amountNear joins the hash only when present, so older logs without it still verify
    .update(JSON.stringify(c.amountNear === undefined ? [prev, c.subject, c.amountUsd, c.status, c.ref, c.at] : [prev, c.subject, c.amountUsd, c.status, c.ref, c.at, c.amountNear]))
    .digest('hex');
}

/** Append-only, hash-chained claim ledger. Editing any past entry breaks verify(). */
export class Ledger {
  claims: Claim[] = [];
  /** True when the file had a line that could not be read. The log is then treated as altered. */
  unreadable = false;
  file?: string;

  constructor(file?: string) {
    this.file = file;
    if (file && existsSync(file)) {
      for (const l of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
        try { this.claims.push(JSON.parse(l) as Claim); } catch { this.unreadable = true; }
      }
    }
  }

  append(input: ClaimInput): Claim {
    const prev = this.claims.length ? this.claims[this.claims.length - 1].hash : GENESIS;
    const base = {
      subject: input.subject,
      amountUsd: input.amountUsd,
      ...(input.amountNear !== undefined ? { amountNear: input.amountNear } : {}),
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
    if (this.unreadable) return { ok: false, brokenAt: -1 };
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
}
