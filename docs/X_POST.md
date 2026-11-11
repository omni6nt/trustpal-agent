# X post draft (you post it; attach the video)

Giving an AI your invoices is easy. Letting it near the money is the scary part: one hidden line in a PDF can tell it to pay a stranger.

I built Trustpal at NEAR HACKATHON. The AI reads invoices and proposes payments, but it only holds a NEAR key that can call `pay`. A policy contract enforces the limits, so a tricked AI still can't change the rules or approve itself. I red-teamed it with a real model: it got fooled, and no money moved wrongly.

Try it (practice mode, no wallet): github.com/omni6nt/trustpal-agent

@NEARProtocol #NEARHackathon

Question for you: what would you want an AI to be allowed to pay on its own, and what should always need your approval?
