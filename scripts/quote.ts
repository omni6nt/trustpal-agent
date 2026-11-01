// Task 1: get a DRY quote from NEAR Intents (1Click). No funds move.
// Run: npx tsx quote.ts
import {
  OpenAPI,
  OneClickService,
  QuoteRequest,
} from '@defuse-protocol/one-click-sdk-typescript';

OpenAPI.BASE = 'https://1click.chaindefuser.com';
OpenAPI.TOKEN = process.env.ONE_CLICK_JWT ?? '';

// Look up asset IDs from the live token list instead of hardcoding them.
async function findAssetId(symbol: string, blockchain: string) {
  const tokens = await OneClickService.getTokens();
  const t = tokens.find(
    (x: any) => x.symbol === symbol && x.blockchain === blockchain
  );
  if (!t) throw new Error(`Token ${symbol} on ${blockchain} not found`);
  return t.assetId as string;
}

async function main() {
  const originAsset = await findAssetId('USDC', 'arb');
  const destinationAsset = await findAssetId('USDC', 'sol');

  const request: QuoteRequest = {
    dry: true, // dry run: no depositAddress, no execution
    swapType: QuoteRequest.swapType.EXACT_INPUT,
    slippageTolerance: 100, // 1% (basis points)
    originAsset,
    destinationAsset,
    amount: '1000000', // 1 USDC (6 decimals)
    depositType: QuoteRequest.depositType.ORIGIN_CHAIN,
    refundType: QuoteRequest.refundType.ORIGIN_CHAIN,
    refundTo: process.env.REFUND_ADDRESS!, // your Arbitrum address
    recipientType: QuoteRequest.recipientType.DESTINATION_CHAIN,
    recipient: process.env.RECIPIENT_ADDRESS!, // a Solana address
    deadline: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
  };

  const quote = await OneClickService.getQuote(request);
  console.log(JSON.stringify(quote, null, 2));
}

main().catch((e) => {
  console.error(e?.status ?? '', e?.message ?? e);
  process.exit(1);
});
