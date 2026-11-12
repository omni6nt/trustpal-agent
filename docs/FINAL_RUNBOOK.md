# Final runbook (Nov 12 - Nov 14)

Do these in order. One command per line. Stop and ask if any output looks wrong.

## 1. Test the frozen build (Nov 12, before midday Lagos)
1. `npm install`
2. `npm test` (expect 55 pass, 0 fail)
3. `npm run web -- --live` (Codespace). Open the printed `/?t=` link.
4. Run a clean invoice, then the sample with the hidden instruction. Pause and resume from the Pause bar.
5. `npm run verify-live` (expect "All checks passed" and `paused: false`).

## 2. Record the video (docs/VIDEO.md)
Open `/logo-reveal.html` first for the 4-second logo intro. Click the page to replay it. Record the screen, then the voiceover.

## 3. Practice freeze (the fallback account)
1. `POLICY=omni6nt-policy2.testnet bash scripts/freeze-contract.sh list`
2. Copy the FullAccess key, then: `POLICY=omni6nt-policy2.testnet bash scripts/freeze-contract.sh delete ed25519:KEY`
3. List again: no FullAccess key should remain.

## 4. Repo public
1. GitHub, repo Settings, "Change visibility", Public.
2. Add the About text and topics (near, ai-agent, security, hackathon).
3. Confirm LICENSE is shown. Run `bash scripts/fresh-clone-check.sh` once more.

## 5. Freeze the live policy contract (last, cannot be undone)
1. `POLICY=omni6nt-policy3.testnet bash scripts/freeze-contract.sh list`
2. `POLICY=omni6nt-policy3.testnet bash scripts/freeze-contract.sh delete ed25519:KEY`
3. `npm run verify-live` once more. It must still pass.

## 6. Submit (Nov 13)
1. Re-read https://nearhackathon.com/HACKATHON.md for changes.
2. Fill the form from docs/SUBMISSION.md. Confirm every field with a second pair of eyes.
3. Save the requestId. Nov 14 is buffer only.
