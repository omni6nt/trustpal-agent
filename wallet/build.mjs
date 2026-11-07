import { build } from 'esbuild';
import { copyFileSync } from 'node:fs';
await build({
  entryPoints: ['wallet/wallet.js'], bundle: true, minify: true, format: 'iife', globalName: 'TrustpalWallet', platform: 'browser',
  outfile: 'public/wallet.js', inject: ['wallet/shim.js'], define: { global: 'globalThis', 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
copyFileSync('node_modules/@near-wallet-selector/modal-ui/styles.css', 'public/wallet-modal.css');
console.log('built public/wallet.js');
