# FLOW.md — Spillflyten, beat for beat

**Formål:** dette er kartet over selve spillopplevelsen — hva hver rolle ser, beat for beat, fra korttrekk til vinner.
**Autoritet:** PRD §5.2 eier flyten. `Reference/cocky-monk-demo.html` er kanon når prosa er tvetydig; poeng og kanttilfeller avgjøres av `Tools/engine-vectors.json`. Dette dokumentet er kart, ikke lov.
**Skjermnumre** (01–18) refererer til registeret — detaljer per skjerm i `Screens/SCREENS.md`.

## Slik leser du kartet

- Modi: **Hotseat** (én telefon vandrer rundt bordet) · **Party** (egen telefon hver, spillmesterens telefon er vert) · **Practice** (party-skjermene mot roboter — Lab-kolonnen).
- Der hotseat og party skiller lag, står begge i cellen med prefiks.
- Robot-konstantene i siste kolonne er navnene i `TUNING`-blokken i `Lab/js/bots.js` — tallene står i pacing-tabellen under.

## Kjernetabellen — én runde, beat for beat

| Fase | Skjerm | Spillmesteren ser | En spiller ser | Robotene (Lab) gjør |
|---|---|---|---|---|
| **1 · Ny runde** | 07 | Fanfare: «Du er spillmester!» — nytt kort trekkes. Rollen roterer i oppsett-rekkefølge | Hvem som er ny spillmester | Bot-GM går videre fra introen etter `GM_INTRO_AUTO_MS`. I practice er brukeren alltid spillmester i runde 1 (PRD §4) |
| **2 · Kortet & sannheten** | 08 | Ordet + **den hemmelige sannheten** + lokkemat-komponisten (0–2 lokke-forklaringer, 1 anbefalt) | Bare ordet — aldri sannheten | Bot-GM dikter én lokkemat før stokkingen (PRD §4) |
| **3 · Bløffing** | 09 / 10 | Pulten (08): spillerbrikker flipper fra «tenker …» til «klar ✓» etter hvert som bløffene tikker inn | Hotseat: telefonen sendes rundt med privat handover-overlegg mellom hver hånd, og ender hos spillmesteren (09). Party: alle skriver samtidig på egen telefon (maks 140 tegn), deretter Venterommet (10) | Begynner å «skrive» mens brukeren ennå taster: `BLUFF_DELAY_MS` + `BLUFF_STAGGER_MS` per robot |
| **4 · Klargjøring** | 08 | Den store pulserende **«Åpne avstemning»**-knappen — armeres først når ALLE bløffer er inne OG lokkemat-tilstanden er avgjort (`canOpenVote = allBluffsIn && gmDecoyDone` i `Lab/js/engine.js`; decoy-gating, PRD §5.5) | «Spillmesteren blander kortene …» | Bot-GM åpner `GM_SHUFFLE_MS` etter siste bløff |
| **— showstopperen** | 08→11 | Gong + blits idet knappen trykkes — Kahoot-øyeblikket. PRD §11 krever at dette får en reaksjon fra rommet hver eneste runde | Samme gong/blits, synkront i party | — |
| **5 · Avstemning** | 11 | Spillmesteren stemmer ikke — går rett til tellingen | Sannhet + bløffer + lokkemat stokket og bokstavert A, B, C … **Eget svar er skjult fra egen liste.** Hotseat: telefonen vandrer igjen, én stemme per hånd | Stemmer etter `VOTE_DELAY_MS` + `VOTE_STAGGER_MS`; finner sannheten 35 % av gangene (`TRUTH_FIND_RATE`) |
| **6 · Stemmene tikker inn** | 12 | Levende, anonym telling | Etter avgitt stemme: prikker lander per alternativ, «n/total inne» — anonymt til avsløringen | — |
| **7 · Avsløringen** | 13 | Styrer tempoet — ett tapp per beat | Løgn for løgn: stemmene flyr til svaret, forfatteren avsløres, **nesen vokser** ett hakk per stemme svaret sanket. Dobbeltreff er slått sammen med sannheten. **Sannheten kommer alltid sist** — fanfare hvis noen fant den; fant ingen den, stjeler spillmesteren runden (+2, seierssting + risting) | Bot-GM auto-pacer med `REVEAL_BEAT_MS` per beat, tapp-for-å-hoppe-over |
| **8 · Brettet** | 14 | Samme brett som alle andre | Brikkene hopper felt for felt (haptikk + lyd per felt), kameraet følger lederen, forbikjøringer og ⅓/⅔-landemerker feires. Party: synkront på alle enheter | Går videre til brettet etter `REVEAL_TO_BOARD_MS` |
| **9 · Neste runde** | → 07 | Rollen går til nestemann | Seier sjekkes kun når en full spillmester-rotasjon er komplett — alle er spillmester like mange ganger (PRD §5.4) | Neste bot-GM tar over |
| **10 · Omkamp** *(unntak)* | 15 | Kun ved uavgjort forbi mål ved rotasjonsslutt: én sudden death-runde. De uavgjorte bløffer, alle stemmer, nest høyeste poengsum agerer spillmester | Fortsatt likt etterpå → delt seier, delt konfetti | Spilles som vanlig runde |
| **11 · Vinner** | 16 | Konfetti + kåring av **Gullnesen** — prisen til spillets beste løgner (flest stemmer sanket på egne bløffer) | Samme fest på alle skjermer | — |

### Poengene som flytter brikkene (hurtigreferanse — autoritativt i PRD §5.3)

| Hendelse | Poeng | Til |
|---|---|---|
| Stemte på sannheten | +2 | Velgeren |
| Svaret ditt fikk stemmer (bløff **eller** lokkemat) | +1 per stemme | Forfatteren |
| Ingen fant sannheten | +2 | Spillmesteren («Spillmesteren vant runden!») |
| Dobbeltreff — bløff ≈ sannheten | +3, svaret slås sammen med sannheten | Bløfferen |

### Hotseat vs. party — de tre forskjellene som betyr noe

| Moment | Hotseat (én telefon) | Party (egen telefon hver) |
|---|---|---|
| Bløffing | Telefonen vandrer; privat handover-overlegg skjuler skjermen mellom hver hånd; ender hos spillmesteren | Alle skriver samtidig; Venterommet (10) holder stemningen imens |
| Avstemning | Telefonen vandrer igjen, én stemme per hånd | Alle stemmer samtidig fra egen liste |
| Avsløring + brett | Én skjerm på bordet er scenen | Synkron spectacle på alle enheter, latensbudsjett ≤ 300 ms (PRD §10) |

## Pacing — de faktiske tallene

Robot-tempoet bor i `TUNING`-blokken i `Lab/js/bots.js` (speiles til `BotTuning.swift`).
**Regel: pacing-konstanter finnes KUN i to frosne blokker — aldri inline i UI- eller motorkode.**
`bots.js TUNING` = robot-følelse (hvor menneskelig en robot oppfører seg). `clock.js TIMERS` = fasefrister (regler verten setter og alle enheter adlyder). To blokker fordi de svarer til hver sin herre; se LANES.md kontrakt 5.
Menneskelige spillmestre pacer selv (tapp per beat) — TUNING-konstantene gjelder bot-GM og robotenes «menneskefølelse».

| Konstant | Verdi | Styrer |
|---|---|---|
| `TRUTH_FIND_RATE` | 0,35 | Sjansen for at en robot stemmer på sannheten (PRD §4) |
| `BLUFF_DELAY_MS` | 1 800–3 500 ms | Første robot «begynner å skrive» mens brukeren ennå taster |
| `BLUFF_STAGGER_MS` | 800–2 200 ms | Ekstra forskyvning per robot etter den første |
| `VOTE_DELAY_MS` | 1 500–3 000 ms | Robotenes første stemme etter at avstemningen åpner |
| `VOTE_STAGGER_MS` | 700–1 800 ms | Ekstra forskyvning per robot |
| `USER_DECOY_MS` | 2 500–5 000 ms | Party-demoen: vinduet for brukerens auto-lokkemat |
| `GM_INTRO_AUTO_MS` | 2 000 ms | Bot-GM går videre fra runde-introen |
| `GM_SHUFFLE_MS` | 1 200 ms | Bot-GM: alle bløffer inne → «Åpne avstemning» |
| `REVEAL_BEAT_MS` | 1 700 ms | Bot-GM sitt auto-pacede avsløringsbeat (PRD §4: ~1,7 s) |
| `REVEAL_TO_BOARD_MS` | 1 600 ms | Fra siste avsløring til brettet |

**Budsjettene fra PRD §11:** median runde ≤ 3 min med 5 spillere · brettfasen ≤ 20 s · «Åpne avstemning» skal få en reaksjon fra rommet hver eneste runde. Enhver flyt-endring måles mot disse tre.

## Fasefrister *(VEDTATT 2026-07-25 — PRD §5.2a)*

> **Avgjort: vei B (auto-hopp), og ikke bare på bløffingen — på fire faser.** Forslaget over ble tatt opp i PRD §13 og vedtatt utvidet: nett-spill uten frister lar én person som går fra telefonen fryse hele rommet, og der biter ikke sosialt press slik det gjør rundt et bord.
>
> **Gjelder nettleser-bygget.** iOS-appen har ingen frister før PRD §5.2a utvides dit.

| Fase | Standard | Ved 0:00 | Vises på |
|---|---|---|---|
| Bløffing | 60 s | Ventende bløffere hoppes over for **den runden**; svaret når aldri alternativlista, og et sent svar avvises | 09, 10 |
| Lokkemat | 45 s | Avstemningen åpner uansett. Det spillmesteren rakk å skrive beholdes | 08 |
| Avstemning | 45 s | De som ikke rakk å stemme, stemmer ikke; runden regnes ut med stemmene som kom | 11, 12 |
| Avsløring | 25 s per beat | Seremonien går videre selv, slik en bot-GM allerede gjør | 13 |

- **Bryter:** verten setter lengdene på skjerm 06 Spilloppsett. **Standard: PÅ i nett og practice, AV i hotseat** — å sende én telefon rundt pacer seg selv.
- **Hvorfor lokkemat likevel vises på pulten (08):** forslaget over sa «ikke på pulten». Det holdt så lenge timeren bare gjaldt bløfferne. Nå har spillmesteren sin egen frist, og en frist man ikke ser er en felle.
- **Hopp er ikke frafall.** Den som mister en frist beholder poengene sine, teller fortsatt i spillerantallet og i rotasjonen, og forventes igjen neste runde (PRD §5.5). Kun ekte frakobling forbi reconnect-vinduet fjerner noen.

**De to åpne spørsmålene, besvart:**
1. *Skal timeren skjules i practice?* **Nei.** Robotene leverer på rundt 12 s mot et 60 s-vindu, så den utløses nesten aldri — men practice er der spillere lærer at den finnes. Å skjule den gjør første nett-runde til en overraskelse.
2. *Frakobling vs. somling?* En spiller inne i 30 s-reconnect-vinduet holdes **helt utenfor** somle-settet. Først når vinduet renner ut blir de et ekte frafall (PRD §5.5).

**Klokka er ikke en regelmotor.** Fristene bor i `Lab/js/clock.js TIMERS` — ikke i `bots.js TUNING`, som er robot-følelse. Motoren forblir tidløs (LANES.md kontrakt 1): utløp kommer inn som en vanlig aksjon, og **bare verten fyrer den av**, så to klokker aldri kan krangle. Regelen er bevist av vektorer uten tid i seg (`Tools/engine-vectors.json`: D4, R8, R9, E7–E9).

**Mot budsjettene i PRD §11:** verste bot-vindu er ca. 12,3 s bløffing og 10,2 s avstemning med 5 roboter — godt innenfor 60/45 s, så frister endrer ikke pacingen i practice. I nett-spill senker de taket på en runde fra «uendelig» til ca. 3 min, som er nøyaktig medianbudsjettet.

---

*Endringer i flyt = endring i PRD §5.2 først. Skjermdetaljer: `Screens/SCREENS.md`.*
