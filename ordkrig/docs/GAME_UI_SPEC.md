# WORD WAR 1
## Samlet UI-, spillflyt-, animasjons- og arkitekturspesifikasjon

> Denne filen er kilden til sannhet for spillflyt, visuelt hierarki, spillerantall,
> svarantall, pille-oppførsel, teksttilpasning, animasjon, stemmesynlighet, reveal,
> bot-integrasjon og kodeorganisering. Les hele før du endrer kode.

---

# 1. Formål og overordnet designprinsipp

Word War 1 skal oppleves som én sammenhengende og levende spillflate. Matchmaking,
skriving, stemmegivning, avsløring og resultatvisning skal ikke oppleves som separate
nettsider som erstatter hverandre.

De samme visuelle elementene skal så langt som mulig: beholdes på skjermen, flytte seg,
endre størrelse, endre form, endre farge, endre innhold, skifte funksjon.

- «Spill online»-knappen blir skrivefeltet.
- Skrivefeltet og spillerboblene blir svarlinjene.
- Svarlinjene brukes videre gjennom stemmegivning og reveal.

Unngå at elementer forsvinner og dukker opp igjen på nye steder dersom de kan
transformeres og flyttes smidig. Bevegelsene skal være kontrollerte, presise, rolige,
smidige, uten overdreven sprett.

# 2. Første versjon og fremtidig spillerantall

Første versjon bruker nøyaktig fem spillere per online-runde: én lokal spiller + fire
motspillere. Alle fem lager hver sin falske forklaring. Den riktige forklaringen legges
til som et ekstra svar → 5 falske + 1 riktig = 6 svaralternativer.

    answerCount = activePlayerCount + 1

Ikke hardkod fem spillere eller seks svar. Arkitekturen skal forberedes på 7–8 spillere
(8 hhv. 9 svar) uten omskriving av spilllogikk eller komponentstruktur.

# 3. Sentral konfigurasjon

Alle verdier som justeres under testing skal ligge samlet i sentrale konfigurasjonsfiler.

    export const gameConfig = {
      onlinePlayerCount: 5,
      architectureMinimumPlayerCount: 4,
      architectureMaximumPlayerCount: 8,
      matchmakingDurationMs: 12_000,
      writingDurationMs: 25_000,
      votingDurationMs: 20_000,
      resultsDurationMs: 12_000,
      maximumAnswerCharacterCount: 120,
      typingIdleDelayMs: 700,
      defaultAnswerFontSize: 17,
      minimumAnswerFontSize: 12,
    };

Justerbart uten ombygging: spillerantall, matchmakingtid, skrivetid, stemmetid,
resultattid, maks svarlengde, standard/minste skriftstørrelse, høyde/bredde på skrivefelt
og svarlinjer, animasjonstider, animasjonsstyrke, poengregler. Ingen slike verdier skal
ligge spredt som tilfeldige tall i skjerm-/komponentkode.

# 4. Visuelle tilstander (konsekvent terminologi)

- **Aktiv** – full styrke, `opacity: 1.0`
- **Tonet** – samme grunnfarge/form, svakere, `opacity: 0.6` (standard for uvalgte svar
  etter at spilleren har valgt). En helhvit pille framstår gråere mot sort bakgrunn uten
  egen grå farge.
- **Sterkt tonet** – `opacity: 0.4`, for inaktive/ventende elementer (før runden starter,
  tomme/deaktiverte svar, svakeste punkt i blink).
- **Skjult** – `opacity: 0`.

Bruk kun disse fire begrepene. Alle overganger animeres.

# 5. Visuell hovedstil

- Bakgrunn: sort, ingen gradient/dekor/skygge (med mindre eksplisitt senere).
- **Standardknapp/statusboble (før levert):** sort fyll, hvit ramme, hvit tekst/ikon.
- **Innlevert:** hvitt fyll, sort tekst/symbol, ikon og skriveindikator fjernes, bare den
  hvite pilleformen står igjen.
- **Svaralternativer (stemmerunde):** alle gyldige svar helhvite, sort tekst, lik status,
  ingen framheving av riktig eller eget svar.
- **Pilleform:** som iPhone Messages-bobler, fullstendig avrundede ender, ingen spisse
  hjørner, ingen hale i v1. Én felles radius: `borderRadius: 999`. Én felles `Pill`-
  grunnkomponent for alt (knapper, status, skrivefelt, svar, bekreftelse).

# 6. Safe area, plassering og marger

Ta hensyn til statuslinje, Dynamic Island/hakk, hjemindikator, tastatur, skjermstørrelser.
«Midt på skjermen» = horisontalt sentrert. Svarbobler ligger vertikalt under hverandre,
men sentrert på samme horisontale akse.

    export const layoutConfig = {
      screenHorizontalMargin: 24,
      headerTopSpacing: 12,
      titleVerticalPositionRatio: 0.2,
      mainPillHeight: 56,
      playerStatusPillHeight: 36,
      answerPillHeight: 80,
      writingFieldHeight: 96,
      horizontalPillPadding: 20,
      verticalPillPadding: 12,
      pillGap: 10,
      sectionGap: 24,
      borderWidth: 2,
      selectedBorderWidth: 3,
    };

- «Word War 1» og rundens ord bruker samme faste vertikale posisjon, senter ~20 % ned i
  tilgjengelig skjermhøyde (justerbart i én config-verdi).
- Under stemming/reveal er øverst fastlåst: toppfelt, tidsbar, rundens ord. Svarlisten
  scroller under dette.

# 7. Spilltilstander (én tilstandsmaskin)

    export type GamePhase =
      | "HOME" | "MATCHMAKING" | "START_SIGNAL" | "WRITING"
      | "TRANSITION_TO_VOTING" | "VOTING" | "REVEAL" | "SCORES" | "BETWEEN_ROUNDS";

UI utledes alltid fra aktiv fase. Ikke styr flyten med mange overlappende booleans. En
fase kan ha interne animasjonstilstander, men det finnes alltid én autoritativ hovedfase.

# 8. HOME – startsiden

- **Brukerfelt** øverst til venstre under statuslinja: generisk ikon + brukernavn til
  høyre (≈ samme tekststørrelse som iPhone-klokka). Ikonet er samme grunnsymbol som
  brukes til stemmemarkering senere.
- **Tittel** «Word War 1» ~20 % ned.
- **To pilleknapper** under hverandre, sentrert: (1) Spill online, (2) Spill med venner.
  Underkanten på «Spill online» treffer ~skjermens vertikale midtlinje. «Spill med venner»
  under med sentralt definert avstand.
- Skill i kode `gameMode: "ONLINE" | "FRIENDS"`. Friends utvikles senere; online prioriteres.

# 9. Overgang HOME → MATCHMAKING

Én koordinert overgang (ikke ny side): «Spill online»-tekst fades ut → knappens venstre/
høyre/underkant beholdes, øvre kant beveger seg opp → knappen blir skrivefeltet → «Word
War 1» kryssfades til rundens ord → brukernavn erstattes av tidsbar → fem
spillerstatusplasser etableres under skrivefeltet → matchmaking starter.

# 10. MATCHMAKING

- **Tidsbar:** ikon beholdes øverst til venstre; tidsbar til høyre. Baren starter tom,
  fylles venstre→høyre, maks 12 s. Full bar = runden starter. Kan starte tidligere hvis
  alle plasser er fylt. Botter garanterer fullt rom innen 12 s.
- **Rundens ord** vises umiddelbart der «Word War 1» sto, sterkt tonet, lesbart, flytter
  seg ikke ved rundestart.
- **Skrivefelt før start:** vises under ordet, deaktivert, ramme/plassholder sterkt tonet,
  tastatur kan ikke åpnes, ikke redigerbart.

# 11. Spillerstatusbobler

Fem statusbobler under skrivefeltet: én lokal + fire motspillere (bevisst dobbel
representasjon av lokal spiller: skrivefeltet + én statusboble). Skrivefeltet + fem
statusbobler = seks visuelle beholdere → blir seks svarlinjer senere.

- **Tom plass:** liten sirkel, sort fyll, hvit ramme sterkt tonet, generisk ikon sterkt tonet.
- **Tilkoblet:** sirkelen utvider seg mot høyre → pille; hvit ramme sterkt tonet → aktiv;
  ikon synlig inne i pillen (ikke fjernet under matchmaking); kontrollert fjærbevegelse.
- **Runden starter:** ikonet fades gradvis ut, pilleform/ramme beholdes, størrelsen
  kollapser ikke, innsiden frigjøres til skriveindikator.
- **Spiller skriver:** tre animerte prikker (iMessage-stil) beveger seg bare mens
  skriveaktivitet registreres. Faktisk tekst sendes aldri før levering.
- **Spiller tenker:** ingen tastetrykk innen `typingIdleDelayMs` → animasjon stopper,
  boblen beholder størrelse/plassering, later ikke som spilleren skriver.
- **Leverer:** prikker forsvinner, innsiden fades sort→hvit, ramme forblir hvit, bare
  helhvit pille står igjen, låst. Gjelder også lokal spillers statusboble.
- **Dynamisk antall:** generér fra spillerliste (ikke fem hardkodede). 7–8 spillere: flere
  sentrerte rader / flexWrap / layoutanimasjon; pillene ikke så små at prikkene blir uleselige.

# 12. START_SIGNAL

Hver rundestart: tidsbar full → tidsbar blinker 2×, ordet blinker 2×, skrivefeltets ramme
blinker 2×, statusbobler kan blinke synkront → avslutt i aktiv hvit → ikoner i
spillerbobler fades ut → skrivefeltet aktiveres → tastatur åpnes → skrivetiden starter.

Blink = `sterkt tonet → aktiv → sterkt tonet → aktiv`. Start: `startBlinkCount: 2`,
`startBlinkStepDurationMs: 150`. (Sterkt tonet foretrekkes over helt skjult.)

# 13. WRITING – skrivefasen

- **Tidsbar:** starter full, tømmes mot null, viser faktisk gjenstående tid. Beregnes fra
  `phaseStartedAt`/`phaseEndsAt`, ikke unøyaktig `setInterval`. Skal kunne reberegne korrekt
  posisjon etter hakking/bakgrunn.
- **Skrivefelt:** fast bredde/høyde/ytre pilleform; høyden øker IKKE med tekstlengde.
- **Flere visuelle linjer:** tekst brytes automatisk ved høyre kant; ingen manuelle
  linjeskift; retur/send leverer; innlimte linjeskift → mellomrom; lagret svar uten newline.
  `normalizedText = inputText.replace(/\s*\n+\s*/g, " ");`
- **Dynamisk tekststørrelse:** start på standard; hvis for stort → bryt over flere linjer →
  reduser skriftstørrelse smidig → aldri klipp/overflow → ikke under minimum. Skrivefelt og
  svarpiller bruker samme system, basert på faktisk målt tekst og plass.
- **Maks svarlengde:** `maximumAnswerCharacterCount`, justerbar, satt så maks tekst får plass
  ved minste skrift.
- **Levering:** send/retur → tastatur lukkes, felt låses, fylles hvitt, tekst sort, kan ikke
  redigeres; lokal statusboble fylles også hvit.
- **Tomt svar:** tiden ut uten tekst → spilleren blir med videre; tom svarlinje (hvit
  grunnform, hele linja sterkt tonet, ingen tekst, kan ikke velges/motta stemmer). Spilleren
  kan fortsatt stemme og få poeng for korrekt stemme.

# 14. TRANSITION_TO_VOTING

De seks eksisterende beholderne (skrivefelt + fem statusbobler) transformeres til de seks
svarlinjene. Ingen ny synlig «korrekt-svar-boks» opprettes ved siden av.

**Sekvens:** tastatur lukkes → vent til skjermhøyde stabil → skrivefelt låses → ikoner alt
fjernet → prikker/statusgrafikk fades ut → skrivefeltet tilpasses samme svarformat → alle
seks blir anonyme hvite piller → organiseres vertikalt → seks svartekster blandes tilfeldig
→ tildeles beholderne → fades inn → stemmetiden starter.

- **Ingen synlig kobling** spiller↔svar etter avsløring. Fem spillerdefinisjoner + korrekt
  fordeles tilfeldig. Eget svar merkes ikke.
- **Separate identiteter:** `playerId`, `answerId`, `visualSlotId`. Under skriving kan et spor
  være knyttet til en spiller; før stemming brytes koblingen; svar tildeles spor tilfeldig.
- **Stabil rekkefølge:** når stokket, behold gjennom stemming og reveal (ikke flytt etter at
  spilleren har begynt å lese).

# 15. Svarlisten

- Vertikalt under hverandre, sentrert, samme marg, under fastlåst ord/tidsfelt.
- **Scroll:** svarlisten scroller (flerlinjede svar, navn i reveal, 8–9 svar senere). Ord og
  tidsbar scroller ikke ut.
- **Fast pillestørrelse:** høyden endres ikke med tekst; tekst tilpasses via linjebryting +
  dynamisk skriftreduksjon.
- **Flere linjer:** auto-brytes; ingen manuelle linjeskift; newline → mellomrom.
- **Stemmeområde:** eget område under hver svarpille for generiske ikoner (stemming) og ikon
  + navn (reveal). Dekker ikke svarteksten; nok avstand til neste svar.

# 16. VOTING – stemmefasen

- **Normal svarstatus:** helhvitt fyll, sort tekst, full opacity, lik størrelse/form, ingen
  markering av riktig/eget svar. Tomme/deaktiverte svar: hvit grunnform, sterkt tonet, ingen
  tekst, kan ikke velges.
- **Andre spilleres stemmer:** låste stemmer synlige umiddelbart (tilsiktet – spilleren kan
  påvirkes). Låst stemme = generisk ikon dukker opp *under* valgt svar (flyttes ikke fra
  annet sted), like ikoner, navn skjult. Flere stemmer → flere ikoner horisontalt, kan
  overlappe svakt, dekker ikke tekst, flere rader ved behov.
- **Foreløpig lokalt valg:** trykk på aktivt svar → valgt forblir aktivt/helhvitt (kan
  skaleres svakt opp), øvrige → tonet (grunnfarge fortsatt hvit), foreløpig stemme sendes ikke.
  Andres eksisterende stemmeikoner forblir tydelige.
- **Bekreftelse:** «Endelig svar?» med Ja/Nei som overlegg/flytende pille – skyver ikke
  svarlista, endrer ikke posisjon. Nei → valg oppheves, alle svar tilbake til full opacity.
- **Låst svar (Ja):** stemmen låses, valgt forblir helhvitt/aktivt (sort tekst), øvrige tonet,
  kan ikke endres, generisk ikon dukker opp under valgt svar, synlig for alle. Ikke nytt
  fargebytte (allerede hvitt); markér med kort svak skalering / rammeanimasjon / ikon.
- **Selvstemme:** kan stemme på eget svar (ikke merket, normalt alternativ, viser generisk
  ikon, avslører ikke forfatter). Taktisk bluff. Egen stemme gir ikke i seg selv bluffpoeng,
  men kan påvirke andre. Endelig regel i poengkonfig.

# 17. REVEAL – avsløring

Starter når alle har låst stemme eller stemmetiden går ut.

- Svarlista låses, nye stemmer avvises, eksisterende ikoner blir stående, rekkefølge beholdes.
- **Riktig svar:** forblir/blir aktivt helhvitt, sort tekst, blinker 2×, skaleres svakt opp
  (`correctAnswerScale: 1.03`), tilbake til normal størrelse etter. Blink = `sterkt tonet →
  aktiv → sterkt tonet → aktiv`.
- **Valgte riktig:** valgt forblir aktivt/hvitt, blinker 2×, skaleres opp; andre tonet.
- **Valgte feil:** feil valgt går aktiv → tonet, beholder hvit grunnform (blir IKKE sort,
  «mister ikke farge»), samme toning som øvrige feil. Riktig går tonet → aktiv, blinker 2×,
  skaleres opp, forblir aktivt.
- **Avsløring av stemmegivere:** brukernavn fades inn til høyre for tilhørende ikon
  (`[ikon] Navn`). Flere på samme svar → eget ikon+navn hver, horisontalt / flere rader,
  avstand til neste svar øker smidig. Høydeendringer animeres.
- **Forfatterskap hemmelig i v1:** avslør hvilket svar var riktig, hvem stemte på hva, hvor
  mange poeng hver fikk. Ikke koblingen falsk forklaring ↔ forfatter. (Poeng-«blås opp»-
  animasjon ikke i v1; hold svar/forfatter/poeng som separate data for senere.)

# 18. SCORES – poengvisning

Spillerliste sortert etter samlet poeng i rommet. Rad: generisk ikon, brukernavn, poeng
denne runden, samlet poeng. Skill `roundScore` / `sessionScore` / `ratingChange`.

- **Animasjon:** eksisterende rader flytter seg (ikke fjern/opprett), poeng oppdateres,
  rekkefølge via layoutanimasjon.
- **Ikke-stemmende spiller:** får ikke poeng for korrekt stemme; mottar bare halvparten av
  andre poeng runden. `if (!player.hasVoted) awardedRoundPoints = calculatedRoundPoints * 0.5;`
  Avrunding defineres i `scoringConfig.ts`, ikke i UI.
- **Selvstemme (forslag):** ikke bluffpoeng fra egen stemme; andre som følger kan gi
  bluffpoeng; ikke korrekt-poeng når man stemmer på eget falskt svar. Enkelt å endre i config.

# 19. BETWEEN_ROUNDS

~12 s (config). Resultat lesbart; tidsbar starter tom, fylles mot full (fremdrift mot neste
runde); spillere som forlater fjernes; tomme plasser fylles med nye spillere/botter; neste
ord klargjøres uten å avsløres for tidlig. Fungerer også som kort matchmaking. Full bar →
resultatliste reorganiseres/fades → neste ord sterkt tonet → skrivefelt/bobler til
startposisjon → startsignal (blink 2×) → neste skrivefase.

# 20. Botter (egen modul, ikke i UI)

Sikrer fullt rom innen maks 12 s. Samme hendelser som mennesker: `player_connected`,
`typing_started`, `typing_stopped`, `answer_submitted`, `vote_locked`, `player_disconnected`.
UI trenger ikke vite om deltaker er menneske/bot. Simulert skriveaktivitet: koble til, skrive,
tenke, skrive igjen, levere, stemme – på ulike tidspunkt. Innhold v1: forhåndsdefinerte
falske forklaringer/testdata/eksisterende botlogikk.

    features/game/bots/
    ├── botController.ts
    ├── botTiming.ts
    ├── botAnswers.ts
    └── botPlayers.ts

# 21. Lyd og haptikk

Ikke nødvendigvis i v1, men send hendelser til et tilbakemeldingsgrensesnitt:
`feedbackService.onRoundStart() / onAnswerSubmitted() / onVoteLocked() / onCorrectAnswer() /
onWrongAnswer() / onScoreReceived()`. Funksjonene kan være tomme; skal legges til uten
omskriving av tilstand/komponenter/nettverk/animasjon.

# 22. Nettverks- og avbruddstilstander

Forbered (uten å ferdigstille alt nå): frakobling under matchmaking/skriving; leverer men
forlater før stemming; stemmer ikke; lokal mister nett; app i bakgrunnen; åpnes midt i fase;
bot erstatter spiller. Ikke-stemmende → halv poenguttelling. UI skal aldri havne i ugyldig
tilstand om en spiller mangler.

# 23. Animasjonsregler

- **Én vedvarende `GameScreen`** for alle faser – ikke separate navigasjonssider som
  remounter komponenter. Bruk vedvarende struktur (`GameHeader`, `RoundWord`,
  `AnimatedGameSurface`).
- **Vedvarende visuelle beholdere:** skrivefelt + statusbobler har stabile `visualSlotId`
  (seks ved fem spillere) som overlever overgangen skriving→stemming.
- **Stabile ID-er:** `playerId`, `answerId`, `voteId`, `visualSlotId`, `roundId`. Aldri
  listeindeks som identitet for animerte elementer.
- **Fjærbevegelse** til: sirkel→pille, reorganisering, skrivefelt-form, svarlinjer, korrekt
  svar-skalering, resultatliste.
- **Tidsbaserte** til: opacity, farge, tekstbytte, blink, tidsbar, navn inn/ut, bekreftelse.
- **Avbrytbare** animasjoner – start fra nåværende visuelle verdi, ikke hopp til startverdi.
- **Unngå tilfeldige timeout-kjeder;** hver hovedovergang styres av én koordinert tidslinje.
  F.eks. overgang til stemming: 0 lukk tastatur, 150 fade identitet, 250 reorganiser, 450
  svarformat, 550 tildel svar, 600 fade inn tekst, 750 trykkbar. (Tider i motion-config.)

# 24. Motion-konfigurasjon

    export const motionConfig = {
      pressDurationMs: 100, fadeDurationMs: 180, colorDurationMs: 200,
      layoutDurationMs: 420, majorTransitionDurationMs: 650,
      startBlinkCount: 2, revealBlinkCount: 2, blinkStepDurationMs: 150,
      correctAnswerScale: 1.03,
      spring: { damping: 20, stiffness: 180, mass: 0.9 },
    };

Unngå kraftig sprett, elastiske animasjoner, tilfeldig timing, forskjellige bevegelsesstiler
per fase, harde hopp.

# 25. Datamodell

    type Player = {
      id: string; username: string; isLocalPlayer: boolean; isBot: boolean;
      connectionStatus: "EMPTY" | "CONNECTED" | "DISCONNECTED";
      activityStatus: "IDLE" | "TYPING" | "THINKING" | "SUBMITTED" | "DID_NOT_SUBMIT";
      hasVoted: boolean;
    };
    type Answer = {
      id: string; text: string; source: "PLAYER" | "CORRECT"; authorPlayerId?: string;
      isEmpty: boolean; isSelectable: boolean; voterPlayerIds: string[];
    };
    type Vote = { id: string; playerId: string; answerId: string; lockedAt: number; };
    type VisualSlot = { id: string; writingRole: "LOCAL_INPUT" | "PLAYER_STATUS";
      playerId?: string; answerId?: string; };
    type RoundScore = { playerId: string; correctAnswerPoints: number; bluffPoints: number;
      selfVotePoints: number; nonVotingPenalty: number; roundTotal: number; sessionTotal: number; };

Klienten skal ikke vite hvilket svar som er riktig før reveal ved reelt nettverk;
`source: "CORRECT"` og `authorPlayerId` holdes skjult/serverstyrt under stemming.

# 26. Kodeorganisering (foreslått)

    src/
    ├── config/ (gameConfig, scoringConfig, featureFlags)
    ├── theme/ (colors, opacity, spacing, typography, borders, sizes, motion)
    ├── components/primitives/ (Pill, UserIcon, AppText, TypingDots, TimerBar, FittedText)
    └── features/game/
        ├── screens/ (HomeScreen, GameScreen, GameDevScreen)
        ├── state/ (gamePhase, gameState, gameReducer, gameEvents, gameSelectors)
        ├── models/ (Player, Answer, Vote, VisualSlot, Round, Score)
        ├── components/ (GameHeader, RoundWord, DefinitionInput, PlayerStatusGrid,
        │               PlayerStatusPill, AnimatedGameSurface, AnswerList, AnswerPill,
        │               VoteIndicatorRow, VoteConfirmation, Scoreboard)
        ├── animations/ (presets + use*Transition hooks)
        ├── hooks/ (usePhaseTimer, useTypingPresence, useKeyboardTransition, useFittedText)
        ├── bots/ (botController, botTiming, botAnswers, botPlayers)
        ├── feedback/ (feedbackService)
        ├── services/ (gameRoomService, presenceService, synchronizedClock, answerService)
        └── dev/ (GameStateControls, mockGameController, mockPlayers, mockAnswers, mockRounds)

# 27. Utvikler- og testmodus

Egen utviklerskjerm for å teste hver UI-tilstand uten hel runde: 5 (senere 4–8) spillere,
5–9 svar, tomt→fullt rom, tilkobling, skriver, tenker, skriver igjen, leverer, lokal leverer,
tomt svar, alle levert, kort/maks tekst, dynamisk skriftreduksjon, tilfeldig rekkefølge,
overgang til svarlinjer, selvstemme, flere stemmer på samme svar, synlige stemmeikoner,
korrekt/feil lokalt valg, ikke-stemmende, reveal m/navn, poengliste, plassering endres,
botter fyller rom, neste runde. Dette er nødvendig infrastruktur, ikke valgfritt.

# 28. Beslutninger Claude IKKE avgjør tilfeldig (presentér alternativer først)

Endelig maks svarlengde, skrivetid, stemmetid, resultattid, poengmodell, avrunding av
halvpoeng, rating-påvirkning, om botstemmer gir samme poeng, layout ved 7–8 spillere, lyd/
haptikk, forfatteravsløring, Friends-modus, regler ved nettverksbrudd. Disse skal ligge i
config, bak feature flags, eller merkes som tydelige TODO – aldri gjemt i komponentlogikk.
