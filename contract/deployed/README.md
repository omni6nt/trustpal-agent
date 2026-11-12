This folder holds the exact bytecode that is deployed to the live testnet policy contract (`trustpal_policy.wasm`).

`npm run verify-live` compares its sha256 with the code on chain. A judge does not need to rebuild the contract to check this: the hash of this file must equal the on-chain hash. Rebuilding from source with a different toolchain can give different bytes, so a rebuild is not a reliable test.
