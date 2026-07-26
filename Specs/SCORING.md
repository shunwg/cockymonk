<!-- GENERERT av Tools/rules-sheet.mjs — ALDRI håndrediger. Kilden er Tools/engine-vectors.json. Regenerer: node Tools/rules-sheet.mjs -->
# SCORING.md — poeng og regler, svart på hvitt

*Dette arket er GENERERT fra `Tools/engine-vectors.json` — regelautoriteten som også kjører motortestene. Rediger aldri her; endre vektorene og regenerer (`node Tools/rules-sheet.mjs`).*

## Poengtabellen (PRD §5.3)

| Hendelse | Poeng | Til |
|---|---|---|
| Du stemte på sannheten | **+2** | velgeren |
| Svaret ditt fikk stemmer (løgn eller lokkemat) | **+1 per stemme** | forfatteren |
| Ingen fant sannheten | **+2** | spillmesteren |
| Dobbeltreff — du skrev (nesten) sannheten | **+3** | bløfferen |

Nesetellingen (👃) er separat fra poengene: én stemme sanket = ett hakk lengre nese, og flest 👃 ved spillslutt vinner **Gullnesen**.

## Regelvedtak

| Id | Vedtak |
|---|---|
| D1 | Identiske løgner slås sammen til ett alternativ. Hver forfatter får ceil(stemmer/antall forfattere) poeng — delt, rundet opp. Nesetellingen (Gullnesen) krediterer derimot hver forfatter alle stemmene. |
| D2 | Seier krever poeng ≥ mål, og sjekkes KUN når runde % antall spillere == 0 — alle skal ha vært spillmester like mange ganger. |
| D3 | Dobbeltreff: en løgn som ≈ sannheten tas ut av bunken (slås sammen med sannheten), forfatteren får +3 og stemmer fortsatt — sannheten er synlig for alle. |
| D4 | Fasefrister (PRD §5.2a) gjelder KUN den runden. Den som ikke rekker fristen beholder poengene sine, teller fortsatt i spillerantallet og i rotasjonen, og forventes igjen neste kort — det er noe helt annet enn å falle ut. Å miste løgnefristen tar ikke stemmen din, og omvendt. Et manglende svar er bare fraværende, så ingen poengregel endres. |

## Runde-eksemplene (testvektorene R1–R7)

Hver runde under kjøres ordrett som motortest (`node --test Lab/js/engine.test.mjs`). Spiller 0 er rundens spillmester.

### R1 · Grunnrunden — sannhet funnet, løgner høster

Stemmene: Anne → sannheten · Bo → Annes løgn · Cam → lokkemat (spillmesterens).

| Spillmesteren | Anne | Bo | Cam |
|---|---|---|---|
| **+1** | **+3** | **+0** | **+0** |
| 👃 1 | 👃 1 | 👃 0 | 👃 0 |

Spillmesteren stjal runden: **nei**.

### R2 · Ingen fant sannheten — spillmesteren stjeler

Stemmene: Anne → Bos løgn · Bo → lokkemat (spillmesterens) · Cam → Annes løgn.

| Spillmesteren | Anne | Bo | Cam |
|---|---|---|---|
| **+3** | **+1** | **+1** | **+0** |
| 👃 1 | 👃 1 | 👃 1 | 👃 0 |

Spillmesteren stjal runden: **JA (+2 er med i tallet over)**.

### R3 · Dobbeltreff — Bo skrev (nesten) sannheten

Stemmene: Anne → sannheten · Bo → sannheten · Cam → Annes løgn. Dobbeltreff: Bo (+3, se D3).

| Spillmesteren | Anne | Bo | Cam |
|---|---|---|---|
| **+0** | **+3** | **+5** | **+0** |
| 👃 0 | 👃 1 | 👃 0 | 👃 0 |

Spillmesteren stjal runden: **nei**.

### R4 · Identiske løgner — Anne og Cam skrev det samme

Stemmene: Anne → sannheten · Bo → Anne & Cam sin felles løgn · Cam → sannheten.

| Spillmesteren | Anne | Bo | Cam |
|---|---|---|---|
| **+0** | **+3** | **+0** | **+3** |
| 👃 0 | 👃 1 | 👃 0 | 👃 1 |

Spillmesteren stjal runden: **nei**.

### R5 · Tre spillere — to lokke-forklaringer er lov

Stemmene: Anne → lokkemat (spillmesterens) · Bo → sannheten.

| Spillmesteren | Anne | Bo |
|---|---|---|
| **+1** | **+0** | **+2** |
| 👃 1 | 👃 0 | 👃 0 |

Spillmesteren stjal runden: **nei**.

### R6 · Lokkemat-innhøsting PLUSS tyveri

Stemmene: Anne → lokkemat (spillmesterens) · Bo → lokkemat (spillmesterens) · Cam → Annes løgn.

| Spillmesteren | Anne | Bo | Cam |
|---|---|---|---|
| **+4** | **+1** | **+0** | **+0** |
| 👃 2 | 👃 1 | 👃 0 | 👃 0 |

Spillmesteren stjal runden: **JA (+2 er med i tallet over)**.

### R7 · Cam faller ut midt i runden

Stemmene: Anne → Bos løgn · Bo → sannheten. Falt ut: Cam — hopper over løgn og stemme.

| Spillmesteren | Anne | Bo | Cam |
|---|---|---|---|
| **+0** | **+0** | **+3** | **+0** |
| 👃 0 | 👃 0 | 👃 1 | 👃 0 |

Spillmesteren stjal runden: **nei**.

### R8 · Cam rakk ikke løgnefristen — men stemmer fortsatt

Stemmene: Anne → Bos løgn · Bo → sannheten · Cam → Annes løgn. Rakk ikke løgnefristen: Cam — svaret nådde aldri lista, men stemmen teller (se D4).

| Spillmesteren | Anne | Bo | Cam |
|---|---|---|---|
| **+0** | **+1** | **+3** | **+0** |
| 👃 0 | 👃 1 | 👃 1 | 👃 0 |

Spillmesteren stjal runden: **nei**.

### R9 · Anne rakk ikke stemmefristen — spillmesteren stjeler

Stemmene: Bo → Cams løgn · Cam → Bos løgn. Rakk ikke stemmefristen: Anne — stemmen er bare fraværende (se D4).

| Spillmesteren | Anne | Bo | Cam |
|---|---|---|---|
| **+2** | **+0** | **+1** | **+1** |
| 👃 0 | 👃 0 | 👃 1 | 👃 1 |

Spillmesteren stjal runden: **JA (+2 er med i tallet over)**.

## Hele spill (G1–G3)

| Id | Beviser |
|---|---|
| G1 | Å krysse mål midt i rotasjonen vinner IKKE — sjekken fyrer først når rotasjonen er komplett. |
| G2 | Uavgjort forbi mål ved rotasjonsslutt → omkamp: de uavgjorte bløffer, nest høyeste poengsum agerer spillmester. |
| G3 | Fortsatt likt etter omkampen → delt seier, delt konfetti. |

## Kantregler (E1–E6)

| Id | Regel |
|---|---|
| E1 | Tom/blank løgn avvises — «Selv en dårlig løgn er bedre enn ingen.» |
| E2 | Stokkingen kan aldri fyre før spillmesterens lokkemat-tilstand er avgjort — selv med alle løgner inne. |
| E3 | Faller spillmesteren ut, går rollen videre og runden starter på nytt med ferskt kort. |
| E4 | Ditt eget svar vises aldri i din egen stemmeliste; sannheten (ingen forfatter) er synlig for alle. |
| E5 | Spillmesteren stemmer aldri. |
| E6 | Spillmester-rollen roterer hver runde i oppsett-rekkefølge, rundt og rundt. |
| E7 | Et svar som kommer etter at løgnefristen er ute, avvises — alternativlista er allerede satt. |
| E8 | Går lokkemat-fristen ut, teller det som «ferdig»: det spillmesteren rakk å skrive beholdes, og avstemningen kan åpne. |
| E9 | Å miste en frist er ikke å falle ut — neste kort nullstiller lista, og du forventes igjen. |

---

*Autoriteten er vektorene, ikke dette arket. Endrer du en regel: oppdater PRD §5 + vektorene, kjør `node --test Lab/js/engine.test.mjs`, og regenerer dette arket.*
