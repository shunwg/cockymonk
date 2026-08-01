# CLAUDE.md — Cockerel

A Wordle-style **async daily spinoff** of Cocky Monk (`../shunwg`): once a day, write bluff definitions for 3 new "words of the day," and guess the real definition among options for the **previous** day's 3 words. Today's human bluffs become tomorrow's decoy pool — see `../.claude/plans` history or ask for the design rationale if it's unclear why writing and guessing are offset by a day.

**This app is standalone.** It has no navigation to Cocky Monk's party/hotseat modes or to Ordkrig's online/local modes — one entry point (`index.html`), one flow. `app/` (see below) is a second client for the same game and backend, not a different app.

## Provenance (read before assuming something is original)
- **Word corpus** (`js/words.json`) is a one-way, point-in-time copy from `../ordkrig/src/data/generated/words.no.json`, produced by `Tools/build-words.mjs`. Re-run that script to pick up new Ordkrig words; don't hand-edit `words.json`.
- **Bot decoys** (`js/decoys.js`) port the nearness-matching algorithm from `../ordkrig/src/bots/answerPool.ts` against a copy of `../ordkrig/src/data/generated/fakeDefs.json`. If Ordkrig's algorithm changes in a way that matters here, port the change manually — there is no live link.
- **Rating/streak shape** (`js/rating.js`) ports the *spirit* of `../ordkrig/src/services/profileStore.ts` (`rating = base + avg(per-day performance)`), with two deliberate differences: **no quit penalty** (missed days are expected and must never be punished), and a **percentage** streak bonus (`config.js STREAK_BONUS`: +10%/day up to +70% at streak day 7+) instead of Ordkrig's flat streak addend. Full scoring rationale (including the ONE way to lose points — guessing 0/3 in a day) is documented in `README.md`, not repeated here. `rating.js`'s `applyStreakBonus` only multiplies POSITIVE base points — a bad guessing day (`SCORING.guessScoreByCorrectCount` can be negative) must never be made worse by having a long streak; that guard is load-bearing, don't remove it "to simplify."
- **Streak ≠ rating denominator — two separate day-sets, on purpose** (`js/rating.js` top comment). `participatedDays` is touched the INSTANT a user writes or guesses anything ("streak = at least submitting or guessing," not doing all 6) and drives the streak display + bonus %. `countedDays` is touched only once a day's points are actually known via settlement — which happens at two different times for the same calendar day, since write-points and guess-points settle a rollover apart (see `server/db.mjs`'s top comment). Conflating these two was a real bug caught during design; don't merge them back into one.
- **Visual identity** (`css/tokens.css`, `assets/fredoka.css`, `assets/nesen.svg`) is copied from Cocky Monk's `../shunwg/DesignSystem/tokens.json` and `../shunwg/Lab/vendor/`. Re-sync with `Tools/sync-tokens.mjs` rather than hand-editing token values. Every copied asset has a row in this project's own `ASSETS.md`, not just Cocky Monk's.

## Architecture
- `js/engine.js` — pure state machine (batches, submissions, guesses, scoring). No DOM, no bare `Math.random` — randomness comes in via an injected `rng`, same discipline as `shunwg/Lab/js/engine.js`. Tested against `js/vectors.json` via `js/engine.test.mjs` (`node --test`).
- `js/storage.js` — the seam. `storageLocal()` talks to `server/dev-server.mjs`'s mock API today; a future `storageRemote()` (real backend) must expose the exact same interface so nothing above it changes. Mirrors the shape of `shunwg/Lab/js/net.js`.
- `server/dev-server.mjs` — zero-dep static file server + in-process mock API. Owns the daily rollover (seal yesterday's batch, draw today's) as a lazy "ensure today's state exists" check on each request — not a cron. The rollover cutoff is **UTC midnight**, not local time, so every player is guessing the same global batch. Every read-modify-write cycle against `db.json` is serialized through an in-process queue (see the comment above `withDb`) — two requests landing close together (the dev toolbar's own `Promise.all` on load did this) will otherwise interleave their writes and corrupt the file. This is a real bug that happened once; don't remove the queue to "simplify."
- **Day 1 is bootstrapped, not empty.** A brand-new game seeds an already-sealed "yesterday" batch (zero human submissions, entirely bot-filled) so a guessable "Gjett gårsdagens ord" exists from the very first user's very first visit — see the bootstrap branch in `ensureToday`. Real human submissions displace bot decoys naturally as they arrive; there is no code path where guessing is unavailable except a genuinely empty corpus.
- **Guess-credit is immediate; write-credit is deferred — they are NOT symmetric, and that's deliberate.** A guess's correctness is knowable the instant it's made, so `submitGuess` computes and credits points the moment a user's 3rd guess for the day lands (see its comment in `server/db.mjs`) — this is what powers the guided step flow's "your updated score" screen. A write's fooled-vote credit genuinely cannot be known until the guess window on it closes, so that half still waits for `settleBatch`. Don't "fix" this asymmetry by deferring guess-credit to match — that was the original design and it's wrong: it delayed the streak/score feedback by up to two days for no reason.
- `server/data/` is a gitignored runtime JSON store. Never commit real playtest data; `server/data/seed.json` is the only tracked file there.
- `server/dev-server.mjs` sends permissive CORS headers (`Access-Control-Allow-Origin: *`, `OPTIONS` handled with 204) — additive, no effect on game logic, needed so a browser-based client hosted elsewhere (the `app/` Expo port's web target) can call this API at all. Native iOS/Android clients aren't subject to CORS and are unaffected either way.
- **Leaderboard rank is computed against a fixed bot pool** (`db.botLeaderboard`, `js/config.js` `LEADERBOARD`), generated exactly once by `ensureBotLeaderboard` (called every `ensureToday`, self-healing/no-op after the first run) and never regenerated — a user's rank must only move because of real play, never because the bots reroll under them.
- **One word on screen at a time, each with its own timer** (`js/config.js` `TIMERS`: 30s/guess, 60s/write) — never a list of 3. A guess timeout calls `skipGuess` (records a null-choice, incorrect, non-participating "slot filler" so the round can still finalize — see `maybeFinalizeGuessing`); a write timeout is purely client-side (no submission exists to record, so there's nothing to tell the server). Both funnel through the shared `renderTimeoutStep`. Every screen transition MUST call `clearActiveTimer()` first — a stale `setTimeout` firing after the user has already moved on is a real class of bug here, not a hypothetical.
- **The header is a separate, deliberately-lagged DOM region** (`#header`, outside `#screen-root`) — `js/ui.js`'s `updateHeader()` is the only thing allowed to touch it. A point/streak reveal (score step, done step) animates its own big number, flashes it, and only THEN calls `updateHeader` — never update the header eagerly on those screens, that defeats the reveal. The write recap's own big number is plain (no header sync at all) — by the time it's shown, `enterApp()` already rendered the header from current truth, so there's nothing left to catch up.
- **`enterApp()` always renders the header immediately, from whichever profile it just fetched, before deciding what else to show.** This runs on every real page load AND every dev-toolbar player/day switch — the header must never be left showing whoever was viewed previously, even for a moment.
- **`sessionToken` (bumped once per `enterApp()` call) guards every delayed reveal-then-sync callback** (see `revealThenSyncHeader`). This was a real bug: a Score-step reveal has a ~1.3s animate+flash delay before it syncs the header; if the dev toolbar switched to a different player while that delay was still ticking, the stale callback fired late and overwrote the NEW player's correct header with the OLD player's number. Any future delayed header-touching code must capture `sessionToken` at start and check it before applying its effect — don't assume a `clearTimeout` guard is enough, since `animateCount`'s `requestAnimationFrame` loop isn't cancelable the same way.
- **Every returning session passes through a `Ready` step (or the write recap, which serves the same role) before the guess timer starts** — opening the app must never itself start a 30-second clock. Don't collapse this away "to save a click."
- **`#devbar` (in `js/ui.js`, endpoints under `/api/dev/*`) is a testing tool, not shipped UX.** A date dropdown advances the server's simulated "now" one day at a time (`db.devClock`, append-only — there is deliberately no "go back" endpoint), and a player dropdown switches the active local identity or registers a new one, so the write-today/guess-tomorrow loop and multi-player interactions can be tested solo without waiting real days. Gated by the server's `DEV_TOOLS` env var (`server/dev-server.mjs`, default on): the client asks `GET /api/config` and skips rendering the toolbar entirely when it's off, and the server 404s `/api/dev/*` regardless of the client. Set `DEV_TOOLS=0` on any deployed instance.

## Screen gallery (`gallery.html`, dev only)
`node server/dev-server.mjs` then open `http://localhost:8788/gallery.html` — a horizontally-scrolling
row of phone-sized cards, one per major screen state (name/how-to-play/welcome/ready, both write-recap
variants, guess + guess-with-hint, both timeout screens, score, write, done, the Google sign-in gate).
The canonical list of screens lives in `js/gallery-screens.js`; `js/gallery.js` (gallery.html's own
script) builds the cards from it.

Each card is a real, isolated iframe pointing at `index.html?preview=<id>&theme=dark|light` — the
actual screen is rendered by the real code in `js/ui.js` (see `runGalleryPreview` there), reusing every
`render*Step` function completely unmodified against hand-built fixture data (`FIXTURE_WORDS` /
`fixtureProfile` in `js/ui.js`), so the gallery can never visually drift from the real screens. Only the
two screens whose OWN click/timer handlers call `store.*` internally ("guess"/"write") get a working
backing store — `createFixtureStore()`, an in-memory implementation of `js/storage.js`'s exact
interface, no network, no filesystem, resets every reload. Every other card is fully static fixture
data and never touches `store` at all.

Per card: **Refresh** reloads the iframe (replays the entrance animation, restarts the guess/write
timer from full duration); **Theme** cycles dark/light by reloading the iframe with a different `theme`
query param; the feedback field POSTs `{screenId, screenLabel, theme, note}` to
`/api/dev/gallery-feedback`, appended with a timestamp to `server/data/gallery-feedback.json` (gitignored,
same as `db.json` — see `server/gallery-feedback.mjs`, its own tiny serialized-queue file separate from
`db.json` on purpose, since this is dev-tool output, not game state). Ask Claude Code to "check the
gallery feedback log and work through it" to act on submitted notes.

Gated exactly like `#devbar`/`/api/dev/*`: `gallery.html` itself 404s server-side when `DEV_TOOLS=0`
(see `dev-server.mjs`), and `js/ui.js`'s preview branch additionally re-checks the same `devTools` flag
from `/api/config` before honoring `?preview=`, so this is unreachable on either deployed instance
regardless of anyone guessing the URL.

## Native app (`app/`)
An Expo/React Native port of the same game, targeting iOS (TestFlight) first, then Android and web from one codebase — modeled on `../ordkrig/`'s proven Expo setup. The whole project — repo directory, web app, and this native client — is branded **Cockerel** (`app.json`'s `name`/`slug`). The one thing that did NOT change: the bundle identifier (`app.json`'s `bundleIdentifier`/`package`, still `com.edword92.dailycock` — registered on Edvard's Apple team, which owns the App Store Connect record). That's an App Store Connect action, out of scope for an agent regardless of the rest of the rename — see the guardrail below. Read `app/AGENTS.md` in full before working there; it's the authority for that tree (setup, running locally, and the full manual TestFlight-shipping walkthrough), same relationship this file has to the repo root's `CLAUDE.md`.
- `app/src/engine/*.js` is a **generated**, verbatim one-way copy of `js/{engine,config,decoys,rating}.js` (via `app/Tools/sync-engine.mjs`) — same Provenance philosophy as the copies listed above. Re-run the sync script after changing those files upstream; never hand-edit the copies.
- `app/src/lib/storageRemote.ts` is a new, RN-specific reimplementation of `js/storage.js`'s `storageLocal()` interface (same method names) — not synced, since it touches platform APIs (`AsyncStorage`, `expo-crypto`) that don't exist on the web.
- Points at a **separate, isolated backend** — the `cockerel-staging` Fly.io app (own volume, `DEV_TOOLS=0` same as production — see Deploying below) — not the production web app. See `app/AGENTS.md`'s guardrail on not merging the two user pools without an explicit decision.
- No `eas build`/`eas submit` (or any `eas`/App Store Connect action) is ever run by an agent — that's a human, from their own machine, per `app/AGENTS.md`.

## Workflow
1. `npm run build-words` after any Ordkrig wordlist change you want reflected here.
2. `npm test` — engine/scoring/rollover vectors must be green before any commit touching `js/engine.js` or `js/rating.js`.
3. `npm run simulate` — `Tools/simulate-day.mjs` plays several simulated days with multiple users + bot fill; run it after any change to the rollover or decoy logic, since a single day's playtest can't exercise the write→guess offset.
4. `npm run serve` to run it locally; verify visually before calling a screen done.

## Deploying
`Dockerfile` + `fly.toml` deploy the exact same `server/dev-server.mjs` used locally — no separate prod server. `fly.toml` sets `DEV_TOOLS=0` (hides `#devbar`, 404s `/api/dev/*`) and mounts a persistent volume at `server/data` so `db.json` survives redeploys/restarts (`fly volumes create cockerel_data --size 1` once, before the first `fly deploy`). This is still the file-backed JSON store from local dev — fine at the current (~10 real users) scale; swapping to a real database is a separate decision, same as the `storageRemote()` note above.

`fly.staging.toml` deploys the **same server code** a second time as a fully separate app (`cockerel-staging`, own volume `cockerel_staging_data`) for the `app/` Expo port's testers — `fly deploy -c fly.staging.toml`, never plain `fly deploy` (that targets production via `fly.toml`). Deliberately two TOML files rather than flags/env branching on one, so there's no ambiguous default a `flyctl` command could accidentally hit. Also `DEV_TOOLS=0`, same as production — this is a live, publicly reachable URL, not a "local test deployment", so the `#devbar` must not be reachable from it either. Testers who need the day-advance/player-switch shortcuts run `server/dev-server.mjs` on their own machine against their own local data instead.

The app was previously deployed as `the-daily-cock`/`daily-c-staging` — Fly doesn't support renaming an app in place, so the rename to `cockerel`/`cockerel-staging` meant standing up new apps and migrating the data volume, not editing config in place. If you find references to the old names anywhere, they're stale.

## Google Sign-In (web only for now)
Optional, config-gated exactly like `DEV_TOOLS`/`ADMIN_TOKEN` above: unset `GOOGLE_CLIENT_ID` and the whole feature disappears — `/api/config` reports `googleClientId: null`, the client never renders the button, and `/api/auth/google` 404s regardless of what's sent. `server/auth.mjs` verifies the ID token against Google's own `tokeninfo` endpoint (checks signature + `aud`) rather than a hand-rolled JWKS/RS256 check — a deliberate zero-dependency tradeoff at this app's scale, same stance as `ADMIN_TOKEN`'s plain string-equality check.

`db.identities` (`server/db.mjs`) maps `google:<sub>` → `userId`. Signing in with a Google account already linked elsewhere (a second device, or after clearing browser storage) makes the caller **adopt that existing userId** rather than forking a new profile — `linkGoogleIdentity` is the one place this happens. `resetPlayer` (the existing "Nullstill spillet mitt" / delete-account flow) now also strips any `db.identities` entries pointing at the deleted userId — without that, the "deleted" account would silently come back to life the next time the same Google account signs in.

Not yet wired up: the Expo app (`app/`, unreleased) and Sign in with Apple/Vipps (both need a paid Apple dev account or a Vipps merchant agreement respectively — deliberately out of scope for this first pass).

### Requiring sign-in (`REQUIRE_GOOGLE_AUTH`)
Both deployed instances (`fly.toml` and `fly.staging.toml`) set `REQUIRE_GOOGLE_AUTH = "1"` — real players must sign in with Google before they can play at all; local dev leaves it unset, so anonymous play still works there by default. This depends on `GOOGLE_CLIENT_ID` also being set (a `fly secrets set`, not a plain env var) — the flag alone with no client id would show a sign-in screen with a dead button.

**This is a client-side gate only, not server-enforced** — deliberately, keeping the same "simple, not hardened" posture as `ADMIN_TOKEN`/`DEV_TOOLS` elsewhere in this app. The `#devbar` test-player flow (`registerNewPlayer`/the dev-player switcher in `js/ui.js`) is written to be **fully independent** of this gate regardless — it sets `identity` directly and calls `enterApp()`/`renderNameScreen()` itself, never passing through `requireGoogleAuth` in `main()` — but that's moot on both deployed instances now, since neither has `DEV_TOOLS=1` (see Deploying below): the devbar simply isn't reachable there at all. It only matters for someone running `server/dev-server.mjs` locally with `REQUIRE_GOOGLE_AUTH` also set, which isn't the default.

`linkGoogleIdentity`'s `isNewProfile` (server/db.mjs) is what lets the client tell "signing in for the very first time ever" (routes through the same How-to-play + Welcome onboarding an anonymous first-timer gets) apart from "signing back in on a new device/browser" (just reloads straight into the game) — see the comment on `handleGoogleCredential` in `js/ui.js`. Naive reuse of `isFirstTime`'s localStorage check doesn't work here, since after the sign-in reload localStorage always looks populated either way.

### Wiping all users (`POST /api/admin/wipe-all`)
`ADMIN_TOKEN`-gated like `/api/admin/stats`, plus it requires the exact body `{"confirm":"WIPE"}` as a guard against a fat-fingered request. Resets the DB to a brand-new-deployment state (`wipeAllUsers` in `server/db.mjs`) — every profile, submission, guess, day-result, Google identity link, the batch history, dev clock, and cached bot leaderboard. `ensureToday` bootstraps a fresh game from there exactly like a first-ever boot. This is the tool that was used for the one-time cutover to required sign-in — irreversible, not meant to be run casually.

## Admin dashboard
`GET /admin/dashboard.html?token=...` (a plain static page, served like any other file — no server-side auth on the HTML shell itself, since it holds no data) fetches `GET /api/admin/stats`, which IS token-gated (`ADMIN_TOKEN` env var, compared against a `?token=` query param or `Authorization: Bearer` header; unset means the endpoint 404s entirely). Deliberately simple/not-really-secure — a plain string-equality check, no rate limiting, no rotation — an accepted tradeoff for a ~10-user app, not a production security posture.

`server/db.mjs`'s `computeAdminStats` has two different "per day" shapes, on purpose:
- `days` (activity: DAU, correct-guess count/%, definition count/completion-%, bots-vs-real-users count/%) is fully **retroactive** — computed fresh from `db.submissions`/`db.guesses` (which already carry `dayKey`) and each profile's earliest `participatedDays` entry (as a proxy "signup day"). No new tracking needed; accurate for every day that ever happened, including before this feature shipped.
- `players` (rating/streak/device) is a **live snapshot only, not a historical log** — `ratingSum` is a running total (see `js/rating.js`), so there's no way to reconstruct "what was my rating on day X" without adding new forward-only tracking, which was deliberately NOT added (keeps this feature additive/low-risk, no touch to the rollover/settlement code). Revisit explicitly if real day-by-day rating/streak history is needed later.

`device` is a bonus field bolted onto the stored profile object by `server/db.mjs`'s `ensureProfile`/`ensureProfileFor` — deliberately NOT part of `js/rating.js`'s `freshProfile()` shape, which is vector-tested (`js/engine.test.mjs`/`js/vectors.json`) and has nothing to do with device tracking. Sent by both clients on every `ensureProfile` call (`js/storage.js`'s `detectDevice()` for the web app; `app/src/lib/detectDevice.ts` for the Expo app) — a coarse browser/OS or `Platform.OS`+version label, not fingerprinting, and it reflects the MOST RECENT device seen, not the first.

Set the token on each deploy: `fly secrets set ADMIN_TOKEN=... -a cockerel` and `-a cockerel-staging` (can be the same or different values; rotate anytime by re-running the command, no redeploy needed since Fly secrets update the running machine's env directly).

## Guardrails
- Never add a nav path to Cocky Monk or Ordkrig from inside this app.
- Never add a quit/absence penalty to scoring (see Provenance above).
- Never point `storage.js` at Ordkrig's live Supabase project — if/when this needs real hosted persistence, that's a new decision to make explicitly, not a quiet reuse of someone else's production database.
- Never point `app/`'s `EXPO_PUBLIC_API_URL` at the production web app, and never run any `eas`/App Store Connect command from an agent context — see `app/AGENTS.md`.
