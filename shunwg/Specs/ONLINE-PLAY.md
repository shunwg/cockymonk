# ONLINE-PLAY.md — parring i dag, nett i nettleseren, poengliste i morgen

> **STATUS ENDRET 2026-07-25.** PRD **§2.1** flyttet nett-spill inn i scope — men **kun for nettleser-bygget** (`Lab/`, `dist/CockyMonk.html`, GitHub Pages). iOS-appen i `Sources/` er urørt: fortsatt kun lokal MultipeerConnectivity, fortsatt «Data Not Collected».
>
> Del 1 og 2 er **bygget**. Del 4 (Game Center på iOS) er fortsatt **fremtid** og venter på Mac-dag.

## Del 1 — Lokal party-modus på iPhone (uendret)

Party-modus er Kahoot-følelsen rundt ett bord: hver spiller på egen iPhone, samme rom, ingen server (PRD §4). Spillmesterens telefon er vert.

| Beat | Hva skjer | Kilde |
|---|---|---|
| 1 · Annonsering | Vertens telefon annonserer spillet via nearby discovery (MultipeerConnectivity) | PRD §4 |
| 2 · Oppdagelse | Spillere ser rommet i **PartyLobby** og trykker for å bli med | PRD §8 |
| 3 · Navnevalg | Hver spiller velger navn + farge; verten ser lobbyen fylles | PRD §8 |
| 4 · Klar-status | Verten starter når alle er inne; rollene deles ut (verten er første spillmester) | PRD §4 |
| 5 · Spill | All spilltilstand flyter vert ↔ spillere over MPC; ingen data forlater rommet | PRD §10 |

**Arkitektur-regelen som gjorde nett billig:** `GameEngine` snakker aldri med enheter direkte — kun med `Transport`-protokollen. Nett-rom ble nøyaktig det denne regelen lovet: **en tredje transport**, uten at motoren eller skjermene merket noe.

**Status:** MPC-transporten er fortsatt Mac-dag-arbeid (MAC_RUNBOOK.md). Nettleseren har ikke MPC — der er det WebRTC som gjelder (Del 2).

## Del 2 — Nett-rom i nettleser-bygget *(bygget, PRD §2.1)*

Verten lager et rom, deler en **kode på 6 tegn** eller en **lenke**, og starter når nok folk er inne. Ingen konto, ingen innlogging, ingen spillserver.

| Beat | Hva skjer | Skjerm |
|---|---|---|
| 1 · Verten åpner rom | Får en kode (`ABC234`) og en delbar lenke `…/?room=ABC234` | 19 Vertens lobby |
| 2 · Spillerne blir med | Lenken fyller koden inn selv; ellers taster man den | 20 Bli med |
| 3 · Lobbyen fylles | Alle ser hverandres navn, farge og rating-merke | 19 / 22 |
| 4 · Verten starter | «Start spillet» våkner ved 3 spillere. Verten er første spillmester | 19 |
| 5 · Spill | Verten eier tilstanden og kringkaster den; alle andre tegner det de får | 07–16 |

### Hvordan det henger sammen teknisk

**PeerJS (MIT), lagt i `Lab/vendor/peerjs.min.js`, brukt kun i `Lab/js/net.js`.** Vertens peer-id *er* romkoden (med `cm-`-prefiks, så vi ikke kolliderer med andre apper på den delte megleren). En offentlig megler brukes til **signalering** — å koble to nettlesere sammen. Selve spillet går deretter direkte mellom nettleserne (WebRTC data channels): **meglere ser aldri et kort, en løgn eller en stemme.**

**Verten er fasit.** Bare verten trekker kort, åpner avstemning, regner poeng og går videre. Klientene sender handlinger og tegner svaret. Ingen sammensmelting av tilstand, ingen desync-klasse vi ikke kan feilsøke uten server.

**`netProject(G, sete)` — den viktigste funksjonen i hele nett-laget.** Verten sender aldri rå tilstand. Hver mottaker får en sensurert kopi:

| Hva | Hvem ser det | Hvorfor |
|---|---|---|
| `card.truth` | kun spillmesteren, fram til avsløringen | ellers er spillet ødelagt — og en test alene på én maskin ville sett helt fin ut |
| `decoys` | kun spillmesteren | halvskrevne lokkematretter er private |
| bløff-tekster | ingen før avstemningen åpner | før det vises kun *hvem* som er ferdig (chips), ikke *hva* de skrev |
| hvem stemte hva | ingen før avsløringen | PRD §5.2#4 — tellingen er anonym mens den pågår |

Regelen er kodet én gang og testet først i `Lab/js/online.test.mjs`.

### Å komme inn i et spill som alt er i gang *(PRD §5.5, 2026-07-27b)*

Døra står **åpen hele spillet**. Bare et ferdigspilt rom sier nei — eller et fullt et
(åtte er maks, og de som venter i døra telles med). Den gamle tremmintuttersfristen
er borte: et festspill varer i tjue minutter, folk kommer når de kommer, og en venn
med lenka skal kunne sette seg ned på attende minutt.

Det finnes nøyaktig **to veier inn**, og det er regnestykket som bestemmer hvilken:

| Situasjon | Hva skjer | Hvorfor |
|---|---|---|
| Det sitter en robot | Du tar robotens plass med én gang — og poengene dens, som banneret sier høyt | `players.length` rører seg ikke |
| Ingen robot å skyve ut | Du venter i venterommet og blir med fra neste ord, på **samme poengsum som sisteplassen** | En ny stol kan ikke dukke opp midt i en runde |

Den nederste raden er ikke en nødløsning. `gmForRound()`, `winCheck()` og
`scoreRound()` leser alle `playerCount`: endrer tallet seg midt i en runde, blir
spillmesterrekkefølgen stokket om, vinnersjekken forskjøvet, og poengtabellen
endrer størrelse mellom avstemning og oppgjør. Rundeskiftet er det eneste trygge
øyeblikket — så venterommet spilleren opplever og kravet motoren har, er samme regel.

Sisteplass og ikke null: å bli med i et spill til 15 på runde ni med null poeng er
ikke en frisk start, det er en tilskuerplass med ekstra steg. Ingen som alt spiller
blir forbigått av en som nettopp kom inn.

**Den som ser på, får se på.** Ordet, brikkene, klokka og den løpende tellingen —
et tomt venteskjermbilde er et dårlig førsteinntrykk, og ingenting av det hjelper
deg neste runde uansett (da er ordet et annet). Men skjermen må si hvem du er:
det grønne ✓-et («løgnen din er inne») og «du stemte» vises nå bare til den som
faktisk har svart. Den som ennå ikke har stol, blir aldri sendt til et
skriveskjermbilde, og verten sender aldri sannheten dit — `netProject()` regner
«ingen plass» som «ikke spillmester».

### Somling og frafall

- **Fasefrister** (PRD §5.2a) gjør at ingen kan fryse rommet: 60 s bløffing, 45 s lokkemat, 45 s avstemning, 25 s per avsløringsbeat. Bare verten fyrer av utløpet, så to klokker kan aldri krangle. Detaljert flyt i `FLOW.md`.
- **Frafall:** mister en spiller kontakten, får de skjerm 23 med 30 sekunders nedtelling og kobler seg på igjen med **samme id** — verten sender hele tilstanden på nytt, så det finnes ingenting å spille av. Mens vinduet løper blir de **ikke** regnet som somlere (PRD §5.5).
- **Faller verten ut** er rommet over: vertens id *er* romkoden, så det finnes ingen ny vert å velge. Klientene får tilbud om «fortsett i hotseat» fra siste kringkastede tilstand — de har den allerede. Dette er en ærlig begrensning, ikke en skjult feil.
- **Når WebRTC ikke kommer gjennom** (stramt bedriftsnett, enkelte mobilnett uten TURN-relé): rommet feiler synlig etter 8 sekunder med en begrunnelse og en knapp for å spille mot roboter i stedet. Vi kjøper ikke TURN-servere for et festspill.

## Del 3 — Rating: «løgnkarrieren» *(bygget)*

Runde-poeng er meningsløse på tvers av spill (de nullstilles). Det som er verdt å samle på er hvor god løgner du er **over tid**, og mot hvem.

**Matematikken:** Elo, brutt ned parvis. Mot hver ratede motstander regnes forventet resultat `E = 1/(1+10^((Rmot−Rdeg)/400))`, du får 1 for å ende over dem, 0,5 likt, 0 under — og summen deles på `(N−1)` slik at et spill med 8 gir omtrent samme utslag som et med 3. **Å slå noen med høyere rating gir mer.** Start 1000, K = 40 de første 10 spillene, så 24, så 16.

**Roboter teller ikke.** Er du alene mot roboter skjer det ingenting med ratingen — practice skal ikke kunne pumpes. Et spill som aldri når vinnerskjermen teller heller ikke: en venn som går tom for batteri skal ikke straffes.

**Hvor den bor:** i din egen nettleser (`localStorage`, én versjonert nøkkel), ikke på en server. Når du blir med i et rom sender du ratingen din dit, så alle rundt bordet ser hverandres. Verten regner ut endringene når spillet er ferdig og kringkaster dem; hver enhet tar imot **kun sin egen**.

**Ærlig om juks:** tallene er klient-rapporterte, og det er et bevisst valg. Vi tar de billige grepene — man kan bare endre sin egen rating, endringer over ±64 avvises, 👃-tellingen har et tak på `(spillere − 1) × runder`, og det finnes ingen global liste å klatre på. Signering og server-validering er over-engineering når innsatsen er skryterett. Se `Screens/SCREENS.md` skjerm 21 for «Slett profilen».

## Del 4 — Fremtid: global poengliste på iOS *(fortsatt ikke bygget)*

Nett-rom i nettleseren gir *rommet* en rangering. En **verdensliste** er noe annet, og der er Game Center fortsatt riktig vei på iOS: Apple-kontoen finnes allerede på telefonen — ingen egne kontoer, ingen server, ingen driftskostnad.

| Byggekloss | Hva den gir | Hva den IKKE løser |
|---|---|---|
| GameKit matchmaking (`GKMatch`) | Finn venner / åpne rom over nett mellom 3–8 spillere | Somle-toleranse og reconnection — men det er nå løst i Del 2 og kan gjenbrukes |
| GameKit leaderboards | Global poengliste uten backend; ukes- og evighetsvarianter innebygd | Juksesikring |

Listene, om de bygges: **Gullnese-ligaen** (karriere-sum av stemmer bløffene dine har sanket — spillets sjel, beste løgner ikke beste gjetter) · **Ukens nese** (rullerende 7 dager, så nye spillere har noe å nå toppen av) · **Raskeste seier** (færrest runder, min. 4 spillere). Per språk — å lyve på norsk og engelsk er ulike idretter.

## Personvern — den ærlige linja

**iOS: uendret.** «Data Not Collected» står, og PRD §2.1 holder nett-spill utenfor `Sources/` nettopp for at den skal fortsette å stå.

**Nettleseren: endret, og vi sier det høyt.** En romkode og tilkoblingsdetaljer når en offentlig megler; **spillinnhold gjør det aldri**. Navn, rating og nesetelling ligger i din egen nettleser og sendes kun til rommet du blir med i. Ingen server har et tall om deg. Men «vi lagrer ingenting i det hele tatt» er ikke lenger sant — så Om-skjermen sier hva som faktisk lagres, og profilen kan slettes med én knapp. Gjenta aldri den gamle linja.

**Bygger noen Del 4:** personvernskjemaet må besvares på nytt med faktisk GameKit-oppsett (Game Center er typisk «Identifiers/Gameplay Content — knyttet til deg»). Ryker etiketten, er det en PRD-beslutning om det er verdt det — ikke en teknisk detalj.

## Porten — hvor vi står

1. ✅ **PRD §2-amendment vedtatt** — §2.1, 2026-07-25, nett-rom + rating i scope for nettleser-bygget.
2. ✅ **CLAUDE.md-nettverksregelen oppdatert** — eksplisitt PeerJS-unntak, samme form som lottie-ios-unntaket.
3. ⬜ **Personvern-etiketten re-vurderes med GameKit** — gjelder kun Del 4, venter på Mac-dag. Nettleserens linje er allerede skrevet om (over).
4. ✅ **Bygget som en tredje transport** bak `Transport`-sømmen — motoren og skjermene merker ikke forskjell. Null nettverkskode utenfor `Lab/js/net.js`.

---

*Autoritet: PRD §2.1/§4/§5.2a/§5.5/§8/§10 + CLAUDE.md + LANES.md kontrakt 7. Del 1 og 4 beskriver iOS; Del 2 og 3 beskriver nettleser-bygget som er bygget.*
