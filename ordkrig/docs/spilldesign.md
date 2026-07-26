# Ordkrig – spilldesign

Norsk ord-bløffespill i Balderdash/Fibbage-stil. Dette dokumentet er referansen
for hvordan spillet skal fungere. Alle konkrete tall (tid, poeng, runder) bor i
`src/config/gameConfig.ts` – dette dokumentet beskriver reglene og flyten.

## Kjerneidé

Et obskurt norsk ord vises. Alle spillere skriver en falsk (bløff) definisjon.
Bløffene blandes med den ekte definisjonen fra ordboka. Spillerne stemmer på
hvilken de tror er ekte. Poeng for å gjette riktig, OG for å lure andre.

Ordene skal være så og si ukjente for folk flest (nivå: emotiv, emfase, skumleri,
kondominat). Se `scripts/wordgen/` for hvordan ordlista bygges.

## Poeng (se SCORING i regelarket)

- **+1000** for å gjette den ekte definisjonen.
- **+500** per medspiller som stemte på din bløff.
- **+250** (fase 2) til opprinnelig forfatter når et tidligere spillersvar
  gjenbrukes som bot-svar og noen stemmer på det.
- **−0,5 rank** når en spiller hopper ut av en runde (halvt minuspoeng).

## Statistikk per bruker (se `src/models/User.ts`)

- Samlet poeng
- Poeng tjent på egne svar gjenbrukt som bot-svar
- Antall runder spilt
- Antall runder hoppet ut av (rank-straff)

## Brukernavn

Ny bruker får tildelt et tilfeldig navn (`<adjektiv><substantiv><tall>`, f.eks.
GretteElg42), som kan endres senere. Regler/lister i `src/config/usernames.ts`.

---

## Modus 1: Online

1. **Matchmaking** – lichess-stil. Spillere kobles på automatisk til partiet er
   fullt (standard 5). Fylles på med bots ved behov. (Senere: rating, ønsket tid.)
2. **Skrivefase** – ordet vises, alle skriver sin bløff. Alle har lik tid.
3. **Nedtelling (grafikk)** – én strek per motspiller. Alle strekene tømmes likt
   nedover mot null etter hvert som tiden går. Når en spiller sender inn svar,
   fylles vedkommendes strek HELT (grønn), uavhengig av tid. Se
   `src/screens/shared/CountdownBars.tsx`.
4. **Stemmefase** – alle får like lang tid til å vurdere. Etter hvert som andre
   stemmer, vises deres stemme anonymt (en prikk e.l.) mens tiden går ned.
   - **Layout:** alle svarene står nederst på skjermen med relativt liten tekst.
     Øverst vises ett svar stort, som går i loop automatisk (bytter hvert
     `votingLoopSeconds`). Man kan trykke for å hoppe til neste hvis man er
     ferdig å lese.
5. **Fasit/resultat** – ekte definisjon avsløres, poeng deles ut.

## Modus 2: Spill med venner (lokalt/hjemme)

Beholder den sosiale delen – man svarer muntlig, én person betjener appen.

1. **Landing** – lim inn en kode, eller «Start nytt spill».
   (`src/screens/local/LocalLandingScreen.tsx`)
2. **Oppsett** (`LocalSetupScreen.tsx`):
   - Antall spillere (fylles kanskje automatisk når folk legger seg til; men
     spillorganisator setter spillrekkefølgen – når man svarer følger klokka fra
     den som leser opp).
   - Antall runder = antall spillere (standard), evt. selvdefinert.
   - Tid til å finne på svar: velg blant `writingOptions` (30/45/60/75/90 s).
     Enklest og reneste layout mulig (meny/chips/slider).
3. **Spill** – spillmesteren leser opp ordet. Etter runden fyller spillmesteren
   inn hva hver enkelt svarte (post-runde-utfylling), for å beholde det sosiale.

---

## Bots (se `src/bots/`)

- Følger nøyaktig samme regler som ekte spillere (samme tid, samme scoring).
- **Fase 1:** kuratert base med falske svar per ord (`data/bot-answers.csv`,
  nøklet på ordet). Bot velger ut fra en **personlighet** (seriøs / tullete /
  nesten-riktig) som roterer mellom runder – «litt tilfeldig, men ikke helt».
- **Fase 2:** når nok ekte spillerdata finnes, trekker bots fra tidligere ekte
  spilleres svar (`source=player` i samme fil). Blandingsforhold i regelarket
  (`BOTS.historyMixRatio`).
- Bots «tenker» i en tilfeldig tid (`minThinkSeconds`–`maxThinkSeconds`) så de
  ikke svarer momentant.

## Åpne tråder / senere

- Engelsk språkstøtte (ordlista er forberedt med `no.csv`; `en.csv` kommer).
- Rating/ELO og ønsket tid i matchmaking.
- Kildehenvisning (CC BY 4.0) i en Om-skjerm – påkrevd.
- Bulk-generering av bot-svar for de 946 ordene (kan bruke Fable 5).
