# VERIFY queue (EN) — English words awaiting dictionary confirmation

Every `deck_en.json` card the card-author skill flags with `"note": "VERIFY"` gets one row here,
carrying the meaning the card claims. This is the human checkpoint between "sounds real" and
"is real". A later step merges this file into `VERIFY-QUEUE.md` — do not edit that file from here.

**Workflow**

1. Card drafted on a borderline word → `"note": "VERIFY"` in `Resources/deck_en.json` **and** a
   row in the table below.
2. A human resolves the word against a reputable English dictionary (OED, Merriam-Webster,
   Collins, or the Dictionaries of the Scots Language for Scots entries) — does the word exist
   with the claimed meaning?
3. **Confirmed** → clear the `note` in the deck file and delete the row (or mark `confirmed`
   until the next cleanup). **Not confirmed** → cut the card and delete the row.
4. Ship gate: `/qa --ship` and `node Tools/validate_deck.mjs --ship` hard-fail while any
   `VERIFY` note exists — this queue must be empty before release.

| Word | Claimed meaning | Card id | Status |
|------|-----------------|---------|--------|
| smeuse | A gap at the bottom of a hedge worn smooth by the regular passage of small animals (English dialect; also spelled meuse) | ord-0063 | pending |
| sitooterie | Scots: a place to sit out in — a gazebo or conservatory, or a secluded corner at a dance | ord-0098 | pending |
| nudiustertian | Relating to the day before yesterday (from Latin nudius tertius; rare, 17th-century) | ord-0099 | pending |
