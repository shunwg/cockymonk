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
| festermål | gammel bindende forlovelse/trolovelse (sjekk form: festermål vs festarmål/festemål) | ord-0083 | pending |
| gimre | ung søye som ennå ikke har lammet (sjekk form: gimre vs gimmer) | ord-0137 | pending |
| signekjerring | folkelig helbrederkvinne som «leste» over syke (jf. signekone) | ord-0140 | pending |
| åsgårdsrei | det ville nattlige rittet i folketroa (jf. oskorei; sjekk lemmaform) | ord-0143 | pending |
| gardvord | vette som vokter gården i folketroa | ord-0144 | pending |
| mylse | søt melkerett kokt på myse (nynorsk/dialekt) | ord-0149 | pending |

## English deck

Rows from `deck_en.json` — resolve against a reputable English dictionary (OED, Merriam-Webster,
Collins, or the Dictionaries of the Scots Language for Scots entries).

| Word | Claimed meaning | Card id | Status |
|------|-----------------|---------|--------|
| smeuse | A gap at the bottom of a hedge worn smooth by the regular passage of small animals (English dialect; also spelled meuse) | ord-0063 | pending |
| sitooterie | Scots: a place to sit out in — a gazebo or conservatory, or a secluded corner at a dance | ord-0098 | pending |
| nudiustertian | Relating to the day before yesterday (from Latin nudius tertius; rare, 17th-century) | ord-0099 | pending |
