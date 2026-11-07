// Browser wallet connection for Trustpal. Bundled into public/wallet.js by `npm run build:wallet`.
// The page never sees a private key. Every owner action is signed inside the person's own wallet.
import { setupWalletSelector } from '@near-wallet-selector/core';
import { setupModal } from '@near-wallet-selector/modal-ui';
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { actionCreators } from '@near-js/transactions';

const GAS = 60n * 10n ** 12n; // 60 Tgas
let selector, modal, contractId;
const listeners = [];
const emit = () => listeners.forEach((f) => { try { f(account()); } catch {} });

export function toYocto(nearText) {
  const [w, f = ''] = String(nearText).trim().split('.');
  if (!/^\d+$/.test(w) || !/^\d*$/.test(f) || f.length > 24) throw new Error('Amount must be a plain number like 0.5');
  return (BigInt(w) * 10n ** 24n + BigInt(f.padEnd(24, '0'))).toString();
}

export async function init(policyContractId) {
  contractId = policyContractId;
  selector = await setupWalletSelector({ network: 'testnet', modules: [setupMeteorWallet(), setupMyNearWallet()] });
  // methodNames: ['get_policy'] keeps the access key the wallet creates at sign-in harmless:
  // it can only call a read method. Approvals are never signed by a key the page holds.
  modal = setupModal(selector, { contractId, methodNames: ['get_policy'], description: 'Connect the wallet that holds your Trustpal owner account. Nothing is sent until you confirm inside your wallet.' });
  selector.store.observable.subscribe(emit);
  // Wallets that redirect (MyNearWallet) come back with the transaction hash in the address bar.
  const u = new URL(location.href), h = u.searchParams.get('transactionHashes');
  if (h) { u.searchParams.delete('transactionHashes'); history.replaceState({}, '', u.pathname + u.search + u.hash); return { returnedTx: h.split(',').pop() }; }
  return {};
}

export function account() {
  if (!selector) return null;
  const st = selector.store.getState();
  const a = st.accounts.find((x) => x.active) || st.accounts[0];
  return a ? a.accountId : null;
}
export const onChange = (f) => listeners.push(f);
export const connect = () => modal.show();
export async function disconnect() { const w = await selector.wallet(); await w.signOut(); emit(); }

async function call(methodName, args) {
  const w = await selector.wallet();
  const out = await w.signAndSendTransaction({ receiverId: contractId, actions: [actionCreators.functionCall(methodName, args, GAS, 0n)] });
  const hash = out && (out.transaction?.hash || out.transaction_outcome?.id);
  const failure = out && out.status && out.status.Failure;
  if (failure) throw new Error(JSON.stringify(failure).replace(/\\"/g, '"').slice(0, 300));
  return { hash: hash || null };
}
export const approvePayment = ({ reference, recipient, amountNear, seconds }) =>
  call('approve_payment', { reference, recipient, amount: toYocto(amountNear), valid_for_seconds: Number(seconds) });
export const cancelApproval = (reference) => call('cancel_approval', { reference });
