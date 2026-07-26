# START HER

Ny i mappa? Det er tre dører inn:

| Vil du … | Åpne |
|---|---|
| **Spille spillet** | dobbeltklikk `Play Cocky Monk.cmd` |
| **Se alle skjermene (01–18)** | dobbeltklikk `Open Screen Gallery.cmd` |
| **Jobbe på spillet** | les `TEAM.md` (5 min) → finn segmentet ditt → mappa står i tabellen under |

*Utforsker-tips: sortér etter **Navn**, ikke dato — da ligger mappene samlet og denne fila øverst.*

## Mappene

| Mappe | Der finner du |
|---|---|
| `Lab/` | **Selve spillet** (nettleserform) — koden dere endrer daglig: `js/` + `css/` |
| `Screens/` | Skjermregisteret 01–18 + PNG-referanser — alt visuelt refereres herfra («endre 07») |
| `Specs/` | Poengarket (`SCORING.md`), flytkartet (`FLOW.md`), online-planen (`ONLINE-PLAY.md`) |
| `Resources/` | Ordlistene (`deck_nb/en.json`), bot-løgnene, lyd, Lottie-feiringer — det som skipper |
| `Content/` | Ordverkstedet: kandidatlister per språk + VERIFY-køen (råvarer, ikke ferdigvare) |
| `DesignSystem/` | `tokens.json` — **eneste** kilde til farger/fonter/motion; css/Swift genereres |
| `Tools/` | Node-verktøyene: bygg (`build-standalone`), valider (`validate_deck`), server (`serve-lab`), snap (`snap-screens`) |
| `dist/` | Ferdigbygd én-fils spill — **generert**, aldri rediger for hånd |
| `Reference/` | Den **FROSNE** originalprototypen — fasit, aldri rør |
| `AssetsIncoming/` | Rått CC0-steinbrudd (Kenney) — kun asset-wrangler flytter ting ut |
| `Sources/` + `Tests/` + `scripts/` | iOS-koden og macOS-skriptene — venter på Mac-dagen (`MAC_RUNBOOK.md`) |
| `.claude/` | Claude Code-skills og kommandoer (`/qa`, `/director`, `/newcards`) — følger med repoet |

## Filene i rota

| Fil | Hva |
|---|---|
| `TEAM.md` | **Lagkartet** — de 7 segmentene, portene, samarbeidsprotokollen (bokmål) |
| `README.md` | Teknisk oversikt + full fil-tabell (engelsk) |
| `PRD.md` / `DESIGN.md` | Spillspesifikasjonen / designspråket — loven når noe er uklart |
| `CLAUDE.md` | Grunnloven Claude Code følger i hver økt |
| `LANES.md` | Teknisk segmentmatrise + grensesnittkontraktene (engelsk) |
| `ASSETS.md` | Lisensboka — hver ressurs i spillet har en rad her |
| `TOOLBELT.md` | Hvilke eksterne verktøy/plugins som er invitert inn |
| `GITHUB_RUNBOOK.md` | Alt om GitHub: første push, grener, pull requests, versjoner, konflikter |
| `MAC_RUNBOOK.md` | Alt som venter på en Mac: Xcode → TestFlight → App Store |
| `project.yml` | XcodeGen-oppskriften (Mac-dagen) |
| `.gitignore` / `.gitattributes` | Git-rørlegging — la stå |

**Én regel å huske:** `Reference/` er frossen; `dist/`, `Lab/css/tokens.css` og `Specs/SCORING.md` er generert. Alt annet: egen grein, og segmentets port (test) grønn før merge — se `TEAM.md`.
