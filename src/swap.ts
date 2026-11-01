import type { SwapInput, SwapProvider, SwapQuote, SwapResult } from './types.ts';

/** Offline provider so judges can run everything without funds or keys. */
export class MockProvider implements SwapProvider {
  failNext = false;
  n = 0;

  async quote(input: SwapInput): Promise<SwapQuote> {
    const feeUsd = Math.max(0.1, +(input.amountUsd * 0.005).toFixed(2));
    return {
      amountInUsd: input.amountUsd,
      amountOutUsd: +(input.amountUsd - feeUsd).toFixed(2),
      feeUsd,
      etaSeconds: 45,
    };
  }

  async execute(_input: SwapInput, notify: (m: string) => void): Promise<SwapResult> {
    this.n += 1;
    const ref = `mock-${String(this.n).padStart(4, '0')}`;
    notify(`[mock] swap ${ref} submitted`);
    if (this.failNext) {
      this.failNext = false;
      return { ref, status: 'FAILED' };
    }
    return { ref, status: 'SUCCESS' };
  }
}

interface IntentsConfig {
  jwt: string;
  refundTo: string;
  originChain: string;
  originSymbol: string;
  pollMs?: number;
  timeoutMs?: number;
}

/**
 * Live provider using the NEAR Intents 1Click API. The agent never holds keys:
 * it requests a quote, hands the user a deposit address, then watches the swap.
 */
export class IntentsProvider implements SwapProvider {
  cfg: IntentsConfig;
  constructor(cfg: IntentsConfig) {
    this.cfg = cfg;
  }

  async sdk() {
    const m = await import('@defuse-protocol/one-click-sdk-typescript');
    m.OpenAPI.BASE = 'https://1click.chaindefuser.com';
    m.OpenAPI.TOKEN = this.cfg.jwt;
    return m;
  }

  async assetId(m: any, symbol: string, chain: string): Promise<string> {
    const tokens: any[] = await m.OneClickService.getTokens();
    const t = tokens.find((x) => x.symbol === symbol && x.blockchain === chain);
    if (!t) throw new Error(`Token ${symbol} on ${chain} not found in the 1Click token list`);
    return t.assetId;
  }

  async request(input: SwapInput, dry: boolean) {
    const m: any = await this.sdk();
    const QR = m.QuoteRequest;
    const body = {
      dry,
      swapType: QR.swapType.EXACT_INPUT,
      slippageTolerance: 100,
      originAsset: await this.assetId(m, this.cfg.originSymbol, this.cfg.originChain),
      destinationAsset: await this.assetId(m, 'USDC', input.contact.chain),
      amount: String(Math.round(input.amountUsd * 1e6)), // USDC has 6 decimals
      depositType: QR.depositType.ORIGIN_CHAIN,
      refundType: QR.refundType.ORIGIN_CHAIN,
      refundTo: this.cfg.refundTo,
      recipientType: QR.recipientType.DESTINATION_CHAIN,
      recipient: input.contact.address,
      deadline: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
    return { m, res: await m.OneClickService.getQuote(body) };
  }

  async quote(input: SwapInput): Promise<SwapQuote> {
    const { res } = await this.request(input, true);
    const q = (res as any).quote ?? {};
    const inUsd = Number(q.amountInUsd ?? input.amountUsd);
    const outUsd = Number(q.amountOutUsd ?? input.amountUsd);
    return {
      amountInUsd: inUsd,
      amountOutUsd: outUsd,
      feeUsd: +(inUsd - outUsd).toFixed(2),
      etaSeconds: Number(q.timeEstimate ?? 60),
    };
  }

  async execute(input: SwapInput, notify: (m: string) => void): Promise<SwapResult> {
    const { m, res } = await this.request(input, false);
    const deposit: string | undefined = (res as any).quote?.depositAddress;
    if (!deposit) throw new Error('No deposit address returned by 1Click');
    notify(
      `Send exactly ${input.amountUsd} ${this.cfg.originSymbol} on ${this.cfg.originChain} to:\n  ${deposit}\nWaiting for the swap...`
    );
    const poll = this.cfg.pollMs ?? 5000;
    const deadline = Date.now() + (this.cfg.timeoutMs ?? 10 * 60 * 1000);
    while (Date.now() < deadline) {
      const s: any = await m.OneClickService.getExecutionStatus(deposit);
      if (s.status === 'SUCCESS') return { ref: deposit, status: 'SUCCESS' };
      if (s.status === 'REFUNDED') return { ref: deposit, status: 'REFUNDED' };
      if (s.status === 'FAILED') return { ref: deposit, status: 'FAILED' };
      await new Promise((r) => setTimeout(r, poll));
    }
    return { ref: deposit, status: 'TIMEOUT' };
  }
}
