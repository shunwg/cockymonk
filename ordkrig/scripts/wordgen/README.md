# Ordgenerering (wordgen)

Bygger den obskure ordlista i spillet fra åpne, gratis kilder.

## Strategi

Kandidatord = **ordbokas egne oppslagsord MINUS de vanlige ordene**. Da blir hvert
ord garantert et ekte, sjeldent ordbokord (emotiv/emfase/kondominat-nivå).

## Kilder (alle gratis)

| Fil | Kilde | Lisens |
|-----|-------|--------|
| `lemma_nob.txt` | Norsk Ordbank, bokmål ([GitHub: tobiasvl/norsk-ordbank](https://github.com/tobiasvl/norsk-ordbank), `nob/lemma.txt`) | fri |
| `1gram_nob_f1_freq.frk` | NB Språkbanken unigram-frekvensliste ([nb.no/sbfil/tekst/1gram_nob_f1_freq.zip](https://www.nb.no/sbfil/tekst/1gram_nob_f1_freq.zip)) | CC-ZERO |
| definisjoner | Ordbok API ([ordbokapi.org](https://ordbokapi.org), GraphQL) → Bokmålsordboka | CC BY 4.0 |

**Viktig:** Definisjonene (CC BY 4.0) krever kildehenvisning i appen:
*"Ordforklaringer fra Bokmålsordboka, © Språkrådet og Universitetet i Bergen (CC BY 4.0)."*

De to store rådatafilene er gitignorert. Last dem ned på nytt slik:

```bash
# frekvensliste
curl -L -o freq.zip "https://www.nb.no/sbfil/tekst/1gram_nob_f1_freq.zip" && unzip -o freq.zip
# lemma-liste
curl -L -o lemma_nob.txt "https://raw.githubusercontent.com/tobiasvl/norsk-ordbank/HEAD/nob/lemma.txt"
```

## Pipeline (kjør med node via PowerShell)

```bash
node 1_extract_candidates.mjs      # rådata → candidates.json (obskure kandidater)
node 2_fetch_definitions.mjs 4000  # slå opp N nye ord i API-et (resumerbart, cacher i results.json)
node 4_integrate.mjs               # results.json → ../../src/data/words/no.csv
cd ../.. && npm run generate:data  # csv → generert JSON som appen bruker
```

`results.json` er API-cachen (beholdt i git). Steg 2 hopper over alt som allerede er
hentet, så for å gro databasen: kjør steg 2 med et høyere tall, deretter steg 4 + generate.
`3_export_csv.mjs` lager en frittstående gjennomgangs-CSV (valgfritt).
