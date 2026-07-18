# VERIFY queue — words awaiting dictionary confirmation

Every card the card-author skill flags with `"note": "VERIFY"` gets one row here, carrying
the meaning the card claims. This is the human checkpoint between "sounds real" and "is real".

**Workflow**

1. Card drafted on a borderline word → `"note": "VERIFY"` in the deck **and** a row in the table below.
2. A human resolves the word against [ordbokene.no](https://ordbokene.no) (nb) or a reputable
   English dictionary (en) — does the word exist with the claimed meaning?
3. **Confirmed** → clear the `note` in the deck file and delete the row (or mark `confirmed`
   until the next cleanup). **Not confirmed** → cut the card and delete the row.
4. Ship gate: `/qa --ship` and `node Tools/validate_deck.mjs --ship` hard-fail while any
   `VERIFY` note exists — this queue must be empty before release.

| Word | Claimed meaning | Card id | Status |
|------|-----------------|---------|--------|
| fjåg | glad, kry og opplagt (nynorsk/dialekt) | ord-0010 | pending |
