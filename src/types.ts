export interface Intent {
  amountUsd: number;
  recipient: string;
}

export interface Contact {
  name: string;
  aliases?: string[];
  chain: string; // chain code as listed by the 1Click token list, e.g. "sol"
  address: string;
}

export interface SwapQuote {
  amountInUsd: number;
  amountOutUsd: number;
  feeUsd: number;
  etaSeconds: number;
}

export type SwapStatus = 'SUCCESS' | 'FAILED' | 'REFUNDED' | 'TIMEOUT';

export interface SwapResult {
  ref: string;
  status: SwapStatus;
}

export interface SwapInput {
  amountUsd: number;
  contact: Contact;
}

export interface SwapProvider {
  quote(input: SwapInput): Promise<SwapQuote>;
  execute(input: SwapInput, notify: (msg: string) => void): Promise<SwapResult>;
}
