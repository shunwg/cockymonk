---
name: card-author
description: Author, expand, review, or fix cards in the Snifferoo deck (Resources/deck_nb.json, deck_en.json) and the practice-mode bot fake pools (fakes_nb.json, fakes_en.json). Use this skill whenever the user asks for new cards, more cards, deck content, obscure words, card ideas, deck cleanup, difficulty balancing, or anything touching deck_nb.json — even if they don't say "card-author". Also use it when validate_deck.sh fails.
---

# Card Author

You write the cards this game lives or dies on. A great card = a real Norwegian word almost nobody knows, with a true definition surprising enough that the truth itself sounds like a bluff.

## Hard rules
1. **Original only.** Never reproduce card text from the game named in PRD §3, Balderdash, or any published game. If you can't be sure a formulation is yours, rewrite it.
2. **Real words only.** Every `prompt` must be a verifiable Norwegian word (bokmål, nynorsk, dialect, archaic, or technical all welcome). If you are not confident the word exists with that meaning, **cut it** — never pad the deck with guesses. Mark any borderline entry with `"note": "VERIFY"`, add a matching row (word, claimed meaning, card id) to `Content/VERIFY-QUEUE.md`, and tell the user to check it against ordbokene.no before shipping.
3. **Truth ≤ 140 chars**, written to be read aloud, no leading "Betyr:" or similar.
4. Tone per PRD §7: cheeky, never crude, fine for a 12-year-old at the table.
5. Only this skill writes to `Resources/deck_nb.json`. Append/patch — never bulk-rewrite (CLAUDE.md guardrail).
6. **deck_en is English-obscure.** English cards are originals built on genuinely obscure English words — never translations of Norwegian cards (PRD §9).

## Bot fake pools (fakes_nb.json / fakes_en.json)
Generic, original, plausible-against-any-word definitions for practice-mode bots (PRD §9). Same originality and tone rules; each ≤120 chars; never a real definition of anything in the deck; ≥40 per language. The 16-per-language starter set is in `Reference/cocky-monk-demo.html` — extract, then extend.

## Card schema (see Resources/deck_nb.sample.json)
```json
{ "id": "ord-0042", "category": "ord", "prompt": "dvergmål",
  "truth": "Gammelt og poetisk ord for ekko.", "difficulty": 2, "note": "" }
```
- `id`: `{category}-{4 digits}`, sequential, never reused.
- `difficulty`: 1 = a few at the table may know it · 2 = almost nobody knows it · 3 = looks fake, is real. Target mix ≈ 20/60/20.

## Workflow
1. Read the current deck; note the highest id and the difficulty mix.
2. Draft in batches of 25, pulling candidates from the `Content/wordlists/` domain files (inspiration only, never card text) and rotating domains between batches. For each word, silently ask: *Would two Norwegians at a party plausibly know this? If yes → too easy, cut.* And: *Does the truth make people say "that can't be right"? If yes → keep.*
3. Self-review the batch against Hard rules 1–4. Cut weak cards rather than fixing them — volume is cheap, quality isn't.
4. Append to the target deck (`Resources/deck_nb.json` / `deck_en.json`), then run `node Tools/validate_deck.mjs`. Fix anything it flags before reporting done.
5. Report: how many added, difficulty mix, any `VERIFY` notes for the human — every `VERIFY` card must also have its row in `Content/VERIFY-QUEUE.md`.

## Word-hunting grounds (for inspiration, not copying)
Dialect words for weather/moods/tools · maritime and farming terms · archaic legal/church vocabulary · nynorsk gems bokmål speakers never meet · loanword oddities · words for very specific relatives, foods, or types of snow. Vary the domains within every batch so the deck doesn't feel samey.
