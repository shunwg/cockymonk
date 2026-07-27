# TEAM.md — fire generalister, ett spill

Ny i mappa? Tre dører inn:

| Vil du … | Gjør |
|---|---|
| **Spille spillet** | dobbeltklikk `Play Snifferoo.cmd` |
| **Se alle skjermene (01–23)** | dobbeltklikk `Open Screen Gallery.cmd` |
| **Jobbe på spillet** | les videre — 5 minutter — og finn segmentet ditt |

Kort versjon: **prosjektet er delt i 7 segmenter. Alle kan jobbe med alt — men én gren jobber i ett
segment, og hvert segment har sin egen port (test) som må være grønn før merge.** Alt visuelt
refereres med skjermnummer 01–23.

## Kartet — de 7 segmentene

| # | Segment | Der bor det | Porten (kjør før merge) | Skjermer |
|---|---|---|---|---|
| 1 | **Design-system** — farger, fonter, motion, logo | `DesignSystem/tokens.json` (eneste kilde — css/Swift genereres) | `node Tools/tokens-build.mjs --check` | alle |
| 2 | **Skjermer** — hver skjerms utseende og oppførsel | `Lab/js/ui.js` + `Lab/css/screens.css`/`components.css` + `Lab/js/fixtures.js` | `node --test Lab/js/fixtures.test.mjs` + sjekk galleriet | 01–23 |
| 3 | **Regler & poeng** — motoren | `Lab/js/engine.js` + `Tools/engine-vectors.json` (autoriteten) | `node --test Lab/js/engine.test.mjs` | 13–16 |
| 4 | **Ordlister** — kort og bot-løgner, nb + en | `Resources/deck_*.json` + `Content/` (kun via `/newcards`) | `node Tools/validate_deck.mjs --all` | 08–11 |
| 5 | **Nett, frister & rating** — spill med venner over nett | `Lab/js/net.js` + `clock.js` + `rating.js` + `Specs/ONLINE-PLAY.md` | `node --test Lab/js/online.test.mjs` | 19–23 |
| 6 | **Brettet & temaer** — Salongen/Fjellet/Verdensrommet | `Lab/js/themes.js` + `Lab/css/themes.css` + `Resources/Lottie/` | motor-vektorene + en runde i browseren | 14 |
| 7 | **Spillflyt & opplevelse** — pacing, lyd, feiringer | `Lab/js/bots.js` (TUNING) + `audio.js` + `lottie.js` + `Specs/FLOW.md` | motor-vektorene + en runde i browseren | 07–16 |

Dybde per segment: poengreglene svart på hvitt i `Specs/SCORING.md` (generert — aldri håndrediger),
flyten beat for beat i `Specs/FLOW.md`, skjermregisteret i `Screens/SCREENS.md`. Teknisk
eierskaps-/grensekart (engelsk): `LANES.md`.

## Mappene

| Mappe | Der finner du |
|---|---|
| `Lab/` | **Selve spillet** (nettleserform) — koden dere endrer daglig: `js/` + `css/` |
| `Screens/` | Skjermregisteret 01–23 + PNG-referanser — alt visuelt refereres herfra («endre 07») |
| `Specs/` | Poengarket (`SCORING.md`), flytkartet (`FLOW.md`), nett-spillet (`ONLINE-PLAY.md`) |
| `Resources/` | Ordlistene (`deck_nb/en.json`), bot-løgnene, lyd, Lottie-feiringer — det som skipper |
| `Content/` | Ordverkstedet: kandidatlister per språk + VERIFY-køen (råvarer, ikke ferdigvare) |
| `DesignSystem/` | `tokens.json` — **eneste** kilde til farger/fonter/motion; css/Swift genereres |
| `Tools/` | Node-verktøyene: bygg, valider, server, snap — og alle portene |
| `dist/` | Ferdigbygd én-fils spill — **generert**, aldri rediger for hånd |
| `Reference/` | Den **FROSNE** originalprototypen — fasit, aldri rør |
| `AssetsIncoming/` | Rått CC0-steinbrudd (Kenney) — **ikke i git**, se `ASSETS.md` for å hente det ned |
| `Sources/` + `Tests/` + `scripts/` | iOS-koden og macOS-skriptene — venter på Mac-dagen (`MAC_RUNBOOK.md`) |
| `.claude/` | Claude Code-skills og kommandoer (`/qa`, `/director`, `/newcards`) — følger med repoet |

Rotfilene: `PRD.md` (spesifikasjonen) · `DESIGN.md` (designspråket) · `CLAUDE.md` (grunnloven
Claude følger) · `README.md` (teknisk oversikt + git-arbeidsflyt, engelsk) · `LANES.md`
(segmentmatrise, engelsk) · `ASSETS.md` (lisensboka) · `TOOLBELT.md` (inviterte verktøy) ·
`MAC_RUNBOOK.md` (Mac-dagen).

## Skjermspråket — si «endre 07»

Alle 23 skjermer har permanent nummer. «Nesen overlapper navnet på 13» er en komplett feilrapport —
alle (og Claude) vet nøyaktig hvor det er.

- **Se alt:** `node Tools/serve-lab.mjs` → <http://localhost:8787/Lab/gallery.html> (eller dobbeltklikk `Open Screen Gallery.cmd`)
- **Én skjerm:** `…/Lab/index.html?fixture=07` — også `dist/Snifferoo.html?fixture=07` rett fra disk
- **Stillbilder:** `Screens/png/` — regenerer med `node Tools/snap-screens.mjs` etter UI-endringer

## Sånn jobber vi (protokollen for generalister)

1. **Én gren = ett segment.** Navngi den `segment/kort-hva`, f.eks. `skjermer/13-nese-overlapp`, `ordlister/25-nye-nb`, `brettet/tema-4-badstue`.
2. **Kjør segmentets port før du merger.** Grønn port = trygg merge; ingen venter på ingen.
3. **Krysser endringen et segment-skille** (ny motor-hendelse, nytt deck-felt, nye tokens)? Ikke rediger naboens filer — kjør `/director` i Claude Code, den orkestrerer begge sider i én commit.
4. **Genererte filer løses aldri for hånd** i merge-konflikter — regenerer: `node Tools/tokens-build.mjs` og `node Tools/rules-sheet.mjs`.
5. **Før main:** `/qa` (hele batteriet, inkl. varemerke-sjekken). Før noe skal ut: `/qa --ship`.
6. Commit-meldinger refererer PRD-seksjon eller skjermnummer. Engelsk i kode og commits, bokmål i disse dokumentene.

Grener, pull requests og konflikthåndtering står i `README.md`.

## Lag din egen variant (det morsomme)

- **Eget brett (~30 min, null motorkode):** nytt tema-objekt i `Lab/js/themes.js`, en CSS-blokk i `Lab/css/themes.css`, temafarger i `tokens.json` → rebuild. Temaregelen i CLAUDE.md garanterer at reglene aldri bryr seg om brettet ditt.
- **Egen ordliste:** jaktlister i `Content/wordlists/`, så `/newcards nb 25` — validatoren og VERIFY-køen passer på deg. Aldri rediger `deck_*.json` for hånd.
- **Egen skjerm-vri:** finn nummeret i galleriet → gren → endre → `node --test Lab/js/fixtures.test.mjs` → sammenlign i galleriet → vis frem PNG-en i chatten.
- **Helt egen smak av spillet?** Ta en gren og gå amok — portene sier ifra om du har knust noe som betyr noe.

## Verktøykassa

| Vil du … | Gjør |
|---|---|
| Spille lokalt | Dobbeltklikk `Play Snifferoo.cmd` (eller `dist/Snifferoo.html`) |
| Se alle skjermene | `Open Screen Gallery.cmd` |
| Spille med andre over nett | Åpne <https://shunwg.github.io/cockymonk/> og del rom-lenka |
| Utvikle med live-reload | `node Tools/serve-lab.mjs` → <http://localhost:8787/Lab/> |
| Bygge én-fils-versjonen på nytt | `node Tools/build-standalone.mjs` (etter hver Lab-endring — `dist/` er sjekket inn) |
| Kjøre ALT | `/qa` i Claude Code |

## Kom i gang som lagmedlem (engangs)

1. Klon repoet: `git clone https://github.com/shunwg/cockymonk.git` — spillet ligger i `shunwg/`.
2. Installer [Node ≥ 18](https://nodejs.org) — **eneste** verktøykrav på Windows.
3. Åpne Claude Code i repo-mappa — skills (`/director`, `/qa`, `/newcards`, kort-forfatteren, panelet) følger med repoet i `.claude/`.
4. Kjør alle portene én gang så du vet hvordan grønt ser ut (`/qa`). Les så `Screens/SCREENS.md` (5 min) og ditt favorittsegments filer.
5. iPhone-bygget venter på en Mac — hele oppskriften står klar i `MAC_RUNBOOK.md`; alt vi gjør nå på Windows er gjenbrukbart der.

*Regelen over alle regler: du kan lese alt, du kan prøve alt — men porten til segmentet du endret
skal være grønn, og kanon (`Reference/cocky-monk-demo.html` + PRD) endres aldri i forbifarten.*
