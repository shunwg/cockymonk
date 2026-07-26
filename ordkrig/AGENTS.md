# Ordkrig – utviklingsnotater

Norsk ord-bløffespill (Balderdash/Fibbage). Se `docs/spilldesign.md` for full spillspesifikasjon.

## Samarbeidsregler (github.com/shunwg/cockymonk)

Mappen `ordkrig/` i cockymonk-repoet er en SPEILING av Edvards lokale git, som er
master. Reglene gjelder alle som jobber der – mennesker og Claude-agenter:

- **Eksperimenter gjerne!** Test og endre fritt, men i egne grener (f.eks.
  `shun/ide-navn`) – ikke rett i `main`. Edvard henter gode endringer tilbake til
  master og synker `main` når noe publiseres.
- **Ingen publisering herfra:** kjør aldri `eas update`/`eas build`/`eas submit`.
  TestFlight-publisering skjer kun manuelt fra Edvards maskin.
- **Aldri hemmeligheter i repoet:** ingen `.env`, `service_role`-nøkler,
  `.p8`-filer eller tokens. (Supabase-anon-nøkkelen i koden er offentlig med vilje.)
- **Databaseendringer avtales først:** appen deler LIVE Supabase-database med
  ekte spillere på TestFlight – endringer i `supabase/` eller RPC-er kan knekke
  klienter som allerede er ute.

## Viktig

- **Expo SDK 56** (ikke 57). Docs: https://docs.expo.dev/versions/v56.0.0/
- **Alle tid-/poeng-/regelverdier bor i `src/config/gameConfig.ts`** – ett sted. Endre flyt der, ikke spredt i koden.
- Definisjoner er CC BY 4.0 (Bokmålsordboka) – kildehenvisning må stå i en Om-skjerm.

## Struktur

- `src/config/` – regelark og genereringsregler (gameConfig, usernames)
- `src/game-engine/` – ren spillogikk, uavhengig av online/lokal
- `src/modes/online/` og `src/modes/local/` – modusspesifikk logikk
- `src/bots/` – AnswerProvider-mønster (falske svar)
- `src/models/` – datamodeller for lagrede entiteter (User osv.)
- `src/data/` – ordlister og generert JSON
- `src/screens/` – delt i `online/`, `local/`, `shared/`
- `src/lib/` – klienter (Supabase)
- `scripts/wordgen/` – ordgenererings-pipeline (egen README)
