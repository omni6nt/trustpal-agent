# Final runbook (Nov 12 - Nov 14)

Do these in order. One command per line. Stop and ask if any output looks wrong.

## 1. Test the frozen build (Nov 12, before midday Lagos)
1. `npm install`
2. `npm test` (expect 55 pass, 0 fail)
3. `npm run web -- --live` (Codespace). Open the printed `/?t=` link.
4. Run a clean invoice, then the sample with the hidden instruction. Pause and resume from the Pause bar.
5. `npm run verify-live` (expect "All checks passed" and `paused: false`).

## 1b. New in v31: evidence and deployed code (Codespace, before the freeze)
1. `npm run redteam` and `npm run redteam -- --naive` (the payee check changed, so refresh the evidence). The README quotes 1 of 20 and 8 of 20 bad proposals: if your numbers differ, tell me and I will update the README.
2. `npm run key-limits` and save the output: `npm run key-limits > evidence/key-limits-2026-11-12.txt`
3. On your Windows laptop, copy the deployed bytecode into the repo: `copy contract\target\near\trustpal_policy.wasm contract\deployed\trustpal_policy.wasm` (if you no longer have it, run `npm run verify-live` and tell me; we will drop that step).
4. `npm run verify-live` must still say MATCH.
5. `git add .`, `git commit -m "evidence and deployed bytecode"`, `git push`

## 2. Record the video (docs/VIDEO.md)
Open `/logo-reveal.html` first for the 4-second logo intro. Click the page to replay it. Record the screen, then the voiceover.

## 3. Practice freeze (the fallback account)
1. `POLICY=omni6nt-policy2.testnet bash scripts/freeze-contract.sh list`
2. Copy the FullAccess key, then: `POLICY=omni6nt-policy2.testnet bash scripts/freeze-contract.sh delete ed25519:KEY` (add `CONFIRM_FREEZE=yes` before it)
3. List again: no FullAccess key should remain.

## 4. Repo public
1. GitHub, repo Settings, "Change visibility", Public.
2. Add the About text and topics (near, ai-agent, security, hackathon).
3. Confirm LICENSE is shown. Run `bash scripts/fresh-clone-check.sh` once more.

## 5. Freeze the live policy contract (last, cannot be undone)
1. `POLICY=omni6nt-policy3.testnet bash scripts/freeze-contract.sh list`
2. `POLICY=omni6nt-policy3.testnet bash scripts/freeze-contract.sh delete ed25519:KEY` (add `CONFIRM_FREEZE=yes` before it)
3. `npm run verify-live` once more. It must still pass.

## 6. Submit (Nov 13)
1. Re-read https://nearhackathon.com/HACKATHON.md for changes.
2. Fill the form from docs/SUBMISSION.md. Confirm every field with a second pair of eyes.
3. Save the requestId. Nov 14 is buffer only.
