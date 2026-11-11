# Demo video (90-120 seconds): one story, recorded against the frozen build

Record real screens (practice mode for the setup, live testnet for the proof if the wallet is working). Use the real Gemini run for the invoice read.

| Time | Screen | Voiceover |
|---|---|---|
| 0-12 s | Landing page, two cards | "What happens when an AI that handles your money gets fooled? Trustpal is a business treasury an AI can help run, but cannot rob." |
| 12-30 s | Setup wizard: limits, a payee, a split, "You're protected" | "The owner sets the rules: how much per payment, how much per day, who is trusted, how client money is shared." |
| 30-55 s | Payments: clean invoice, AI proposes, payment goes through | "The AI reads an invoice and proposes a payment. A trusted payee, an amount that matches the invoice: it is paid within the limits." |
| 55-85 s | Poisoned invoice, held card, then Approvals with an exact approval | "This invoice hides an instruction to pay a stranger. The AI is fooled, but Trustpal holds it. Nothing is paid. The owner can approve an exact payment in their wallet, one use, with an expiry." |
| 85-105 s | Security lab: Run all five, then the 'guard switched off' result | "Even with the guard switched off, the NEAR contract still refuses. The AI's key can only call pay." |
| 105-118 s | verify-live output or the red-team summary, then the title | "A real model was tricked in our red team. No money moved wrongly. Trustpal: a business an AI can run, but cannot rob. Built at NEAR HACKATHON." |

Say plainly: practice mode is simulated; the live treasury is one configured testnet business; not audited.
