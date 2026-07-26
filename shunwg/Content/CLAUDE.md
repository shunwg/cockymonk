# Content/ — lane rules (auto-loaded when working here)

Lane C's workshop. **Ship truth lives in `Resources/` — this folder is where words are hunted, queued, and verified before they become cards.**

- `wordlists/nb/*.md` and `wordlists/en/*.md`: candidate words grouped by hunting domain (maritime, weather, archaic-legal, dialect…). Inspiration lists, not card text — the card-author skill drafts from here so batches don't go samey.
- `VERIFY-QUEUE.md`: every card the card-author flags `"note": "VERIFY"` lands here with its claimed meaning. Resolution = check against ordbokene.no → clear the note, or cut the card. Ship gate (`/qa --ship`) blocks while this queue is non-empty.
- Only the card-author skill writes `Resources/deck_*.json` / `fakes_*.json` — append/patch, never bulk-rewrite.
- After every batch: `node Tools/validate_deck.mjs --all`.
- Audio promoted into `Resources/Audio/` needs a row in `Resources/Audio/CREDITS.md` (asset-wrangler skill does this).
