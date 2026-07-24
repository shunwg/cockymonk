# ONLINE-PLAY.md — parring i dag, nett og poengliste i morgen

> **FREMTID — IKKE IMPLEMENTERT.** PRD §2 utelukker internett-multiplayer, kontoer og servere i v1, og CLAUDE.md forbyr nettverk utover lokal MultipeerConnectivity. Dette dokumentet er designplassen for segment 5 — den som vil eie det kan tegne fritt her, men **koden venter på PRD-endring + Mac-dag**.

## Del 1 — Slik virker lokal party-modus i dag (dette ER i scope)

Party-modus er Kahoot-følelsen rundt ett bord: hver spiller på egen iPhone, samme rom, ingen server (PRD §4). Spillmesterens telefon er vert.

| Beat | Hva skjer | Kilde |
|---|---|---|
| 1 · Annonsering | Vertens telefon annonserer spillet via nearby discovery (MultipeerConnectivity) | PRD §4 |
| 2 · Oppdagelse | Spillere ser rommet i **PartyLobby** og trykker for å bli med | PRD §8 |
| 3 · Navnevalg | Hver spiller velger navn + farge; verten ser lobbyen fylles | PRD §8 |
| 4 · Klar-status | Verten starter når alle er inne; rollene deles ut (verten er første spillmester) | PRD §4 |
| 5 · Spill | All spilltilstand flyter vert ↔ spillere over MPC; ingen data forlater rommet | PRD §10 |

**Arkitektur-regelen som gjør fremtiden billig:** `GameEngine` snakker aldri med enheter direkte — kun med `Transport`-protokollen (`LoopbackTransport` for hotseat/practice, `MultipeerTransport` for party). Alt under denne linja i dokumentet er i praksis «en tredje transport».

**Kanttilfellet:** faller verten ut, viser alle enheter en reconnect-tilstand i 30 sekunder, deretter tilbys «fortsett i Hotseat» (PRD §5.5). Latensbudsjettet er ≤ 300 ms for synkron spectacle (PRD §10).

**Status:** PartyLobby-skjermen er ikke bygget i Lab-en ennå (browser-en har ikke MPC — Lab-en simulerer party med roboter). Skjermen får nummer i `Screens/SCREENS.md` når den finnes; selve MPC-transporten er Mac-dag-arbeid (MAC_RUNBOOK.md).

## Del 2 — Fremtidsdesign: spill over nett + global poengliste

**Anbefalt vei: Game Center (GameKit).** Apple-kontoen finnes allerede på hver iPhone — ingen egne kontoer, ingen egen server, ingen driftskostnad. To byggeklosser:

| Byggekloss | Hva den gir oss | Hva den IKKE løser |
|---|---|---|
| GameKit matchmaking (`GKMatch`) | Finn venner / åpne rom over nett; sanntidsmeldinger mellom 3–8 spillere | Somle-toleranse og reconnection må vi designe selv (samme problem som MPC §5.5) |
| GameKit leaderboards | Global poengliste uten backend; ukes-/allevighets-varianter innebygd | Juksesikring (se under) |

### «Gullnese-ligaen» — hva den globale poenglisten rangerer

Runde-poeng er meningsløse globalt (de nullstilles per spill). Det som er morsomt å sammenligne på tvers av verden er *løgnkarrieren*:

| Liste | Måler | Hvorfor |
|---|---|---|
| Gullnese-ligaen (hoved) | Karriere-sum av stemmer dine bløffer har sanket (👃-tellingen) | Spillets sjel — beste løgner, ikke beste gjetter |
| Ukens nese | Samme, rullerende 7 dager | Gir nye spillere en liste de kan nå toppen av |
| Raskeste seier | Færrest runder til vunnet spill (min. 4 spillere) | Skryterett for hele bordet |

Per språk (nb/en) — å lyve på norsk og engelsk er ulike idretter.

**Ærlig om juks:** tallene er klient-rapporterte. Game Center har ingen server-side validering av våre regler. Det er et festspill — innsatsen er skryterett, ikke penger — så terskelen er «ikke pinlig lett»: rimelighetstak per innsending (maks teoretisk 👃 per spill = (spillere − 1) × runder), og aldri premier med verdi. Mer enn det er over-engineering.

### Personvern — den ærlige linja

Dagens etikett er **«Data Not Collected»** og CLAUDE.md freder den. Game Center endrer regnestykket: Apple håndterer identiteten, men App Store-personvernskjemaet må besvares på nytt (Game Center-bruk er typisk «Identifiers/Gameplay Content — knyttet til deg» avhengig av oppsett). **Dette må verifiseres konkret på Mac-dag før noen bygger.** Er svaret at etiketten ryker, er det en PRD-beslutning om det er verdt det — ikke en teknisk detalj.

### Porten for å bygge dette (i rekkefølge, ingen snarveier)

1. PRD §2-amendment vedtas (online + poengliste inn i scope, f.eks. v1.1).
2. CLAUDE.md-nettverksregelen oppdateres eksplisitt (GameKit-unntak, som lottie-ios-unntaket).
3. Personvern-etiketten re-vurderes med faktisk GameKit-oppsett (Mac-dag).
4. Bygges som **en tredje transport** bak `Transport`-protokollen + et `Leaderboard`-grensesnitt — motoren og skjermene merker ikke forskjell. Null nettverkskode utenfor transporten.

---

*Autoritet: PRD §2/§4/§5.5/§8/§10 + CLAUDE.md. Dette dokumentet endrer ingenting av det — det tegner veien for den som vil eie segment 5.*
