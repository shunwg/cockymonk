# Ordkrig – utviklingsnotater

Norsk ord-bløffespill (Balderdash/Fibbage). Se `docs/spilldesign.md` for full spillspesifikasjon.

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
