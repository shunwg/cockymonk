# Skjermregisteret — 01–18

Alle visuelle referanser i dette prosjektet bruker **skjermnummer**. Si «endre 07», ikke «den lilla skjermen med kortet». Da vet alle fire nøyaktig hva som menes — i chat, i commits og i Claude-økter.

**Kontrakten:** numrene er permanente. En ny skjerm får neste ledige nummer (19+), selv om den hører hjemme midt i flyten. Numre gjenbrukes aldri.

## Slik ser du skjermene

| Verktøy | Kommando / lenke |
|---|---|
| Hele galleriet (levende, alltid ferskt) | `node Tools/serve-lab.mjs` → <http://localhost:8787/Lab/gallery.html> (dyplenke: `#s07`) |
| Én skjerm i full størrelse | <http://localhost:8787/Lab/index.html?fixture=07> |
| Uten server (dobbeltklikk) | `dist/CockyMonk.html?fixture=07` — virker på `file://` |
| Stillbilder (denne mappa) | `node Tools/snap-screens.mjs` (alle) eller `… 07` (én) — regenerer etter UI-endringer og commit dem sammen |

Skjermene er *poserte*: faste spillere (Åse, Markus, Ingrid, Jonas), faste poeng, faste stemmer — definert i `Lab/js/fixtures.js`, voktet av `node --test Lab/js/fixtures.test.mjs`. PNG-ene er referanse, ikke fasit — galleriet er alltid sannheten.

## Registeret

| Nr | Skjerm-id | Navn | Hva den viser | PNG |
|---|---|---|---|---|
| 01 | `HOME` | Hjem | Tittel, maskot, språkvelger, «Nytt spill» | [01](png/01-home.png) |
| 02 | `LANG` | Språkvalg | Norsk / English (førstegangsflyt) | [02](png/02-lang.png) |
| 03 | `MODE` | Spillmodus | Én telefon (hotseat) vs hver sin telefon (party) | [03](png/03-mode.png) |
| 04 | `PLAYERS` | Spillere | Navneliste 3–8, legg til/fjern | [04](png/04-players.png) |
| 05 | `PARTYSETUP` | Party-oppsett | Ditt navn + antall roboter (Lab) | [05](png/05-partysetup.png) |
| 06 | `SETUP` | Spilloppsett | Spillengde (8/15/25) + brettvalg + start | [06](png/06-setup.png) |
| 07 | `GM_INTRO` | Ny spillmester | «X er spillmester» + runde-banner | [07](png/07-gm_intro.png) |
| 08 | `GM_DASH` | Spillmester-pulten | Ordet, hemmelig sannhet (hold for å se), lokkemat-felter, innsjekk-chips, «Åpne avstemning» | [08](png/08-gm_dash.png) |
| 09 | `BLUFF` | Dikt en løgn | Spillerbanner, ordet, løgn-tekstfelt | [09](png/09-bluff.png) |
| 10 | `WAIT` | Venterommet | Party: chips tikker inn, spillmesteren dikter | [10](png/10-wait.png) |
| 11 | `VOTE` | Avstemning | A/B/C-alternativer, eget svar skjult | [11](png/11-vote.png) |
| 12 | `VOTEWAIT` | Stemmene tikker inn | Live-telling per alternativ | [12](png/12-votewait.png) |
| 13 | `REVEAL` | Avsløringen | Løgn for løgn, voksende neser, sannheten sist | [13](png/13-reveal.png) |
| 14 | `BOARD` | Brettet | Brikker hopper, +poeng-chips, «Neste runde» | [14](png/14-board.png) |
| 15 | `OMKAMP` | Omkamp | Uavgjort forbi mål → én brutal ekstrarunde | [15](png/15-omkamp.png) |
| 16 | `WINNER` | Vinner | Seier, poengliste, Gullnesen til beste løgner | [16](png/16-winner.png) |
| 17 | `RULES` | Slik spiller du | Illustrert 30-sekunders regelgjennomgang | [17](png/17-rules.png) |
| 18 | `ABOUT` | Om | Kreditering + personvernlinja | [18](png/18-about.png) |

**Filer:** alle skjermene tegnes av `Lab/js/ui.js` (`SCREENS.<ID>`); utseendet bor i `Lab/css/screens.css` + `components.css` (og `themes.css` for 14). Tekstene bor i `Lab/js/state.js` (`STR`, nb + en). Endrer du utseende: kjør `node --test Lab/js/fixtures.test.mjs`, sjekk galleriet, og `node Tools/snap-screens.mjs NN`.

## Overlegg (uten nummer)

Disse ligger *oppå* skjermene og refereres med navn:

| Navn | Hva | Hvor i koden |
|---|---|---|
| Handover | «Gi telefonen til X» — personvernskjold i hotseat | `ui.js hand()` |
| Blits | Gult lysglimt ved «Åpne avstemning» | `ui.js flashScreen()` |
| GM-slør | Lilla puls + risting ved GM-steal | `ui.js doRevealStep()` |
| Feiringer | Lottie-konfetti, Gullnese-glitter, Mål-landemerker | `Lab/js/lottie.js` + `Resources/Lottie/` |

## Kommer (får nummer når de finnes)

PRD §8 nevner skjermer som ennå ikke er bygget i Lab-en: **PartyLobby** (ekte nearby-parring — se `Specs/ONLINE-PLAY.md` del 1) og **Pause/Innstillinger**. Den som bygger dem: legg til fixture i `fixtures.js`, gi neste ledige nummer her, kjør snap.
