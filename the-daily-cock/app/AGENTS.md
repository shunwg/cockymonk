# AGENTS.md — the-daily-cock/app

**Cockerel** — the Expo/React Native port of The Daily Cock (see
`../CLAUDE.md`), same game, targeting iOS (TestFlight first), Android, and
web from one codebase, alongside (not replacing) the vanilla-JS web app in
`../js`/`../index.html`. Modeled directly on `ordkrig/`'s proven Expo setup.
The app's product name is "Cockerel" (`app.json`'s `name`/`slug`); the
underlying game/repo keeps the name "The Daily Cock" — only this one native
client is rebranded. Fly.io URLs (`the-daily-cock.fly.dev`,
`daily-c-staging.fly.dev`) are deliberately NOT renamed.

## For a human picking this up (e.g. shipping to TestFlight)

**Prerequisites**
- Node 18+, npm
- An **Apple Developer Program** membership ($99/yr, developer.apple.com) —
  see the note at the bottom on which Apple ID to use.
- A free **Expo account** (expo.dev).
- `npm install -g eas-cli` (or use `npx eas-cli` each time).

**Setup**
```bash
cd the-daily-cock/app
npm install
npm run sync-engine   # re-run only after js/{engine,config,decoys,rating}.js changes upstream
```

**Run locally** — points at the already-deployed `daily-c-staging` backend by
default, so no local server is needed to play a full round:
```bash
npm run web      # browser, fastest iteration
npm run ios      # iOS Simulator, needs Xcode
npm run android  # Android emulator, needs Android Studio
```

**Ship to TestFlight** (all manual — an agent must never run any of this, see
Guardrails below). Current setup: the App Store Connect listing and Apple
Developer Team are owned by a collaborator (not the repo's primary
maintainer) — `bundleIdentifier`/`slug`/`projectId` in `app.json` are already
correct for that listing; don't change them without coordinating first.
1. Whoever's building must be invited as a team member on the Apple
   Developer Team that owns the App Store Connect listing (Users and
   Access → invite by Apple ID email, role scoped to just this app is
   enough) and accept that invite with their own Apple ID first.
2. `npm install && npm run sync-engine` (pulls the latest engine files).
3. `npx eas-cli login` — your own Expo account (builds run on your quota).
   Do NOT run `eas init` again — the project is already linked.
4. `npx eas-cli build --platform ios --profile testflight`. When it asks for
   Apple sign-in, use the Apple ID that accepted the team invite; pick the
   team that owns the App Store Connect listing; answer yes to letting EAS
   create the certificate/provisioning profile.
5. `npx eas-cli submit --platform ios --profile testflight` (once the build
   finishes, ~15-20 min). `eas.json`'s submit section is deliberately empty
   — answer the interactive prompts (Apple ID, pick the existing app) rather
   than pre-filling an API key.
6. After ~15 min of processing: appstoreconnect.apple.com → the app →
   **TestFlight** tab → create an **Internal Testing** group, add team
   members as testers (no Apple review needed). Friends outside the team go
   in an **External** group — the *first* build to that group needs a quick
   Beta App Review (usually under 24h).
7. Content-only changes after that (no new native packages) don't need a
   new build — `npx eas-cli update --branch preview` pushes a JS/asset OTA
   update; testers get it next time they open the app.

**Which Apple ID to use** (if you're the one setting up a NEW listing from
scratch, rather than joining an existing one as above): if your only Apple
Developer Program access is as an admin/member of someone else's
organization account (e.g. an employer's), don't build/submit under that
team — the app would land in their App Store Connect, visible to their other
admins. Use a separate, personal Apple ID enrolled in its own Individual
Program membership instead.

## Architecture

- `src/engine/*.js` is **generated** by `Tools/sync-engine.mjs` from
  `../js/{engine,config,decoys,rating}.js` — never hand-edit those files
  here; edit the source in `../js/` and re-run `npm run sync-engine`.
- `src/lib/storageRemote.ts` mirrors `../js/storage.js`'s `storageLocal()`
  interface (same method names) against a REST backend over `fetch`.
- `src/lib/apiConfig.ts` resolves `EXPO_PUBLIC_API_URL`, falling back to the
  **`daily-c-staging`** Fly.io app — a separate, isolated backend/volume from
  the production web app (`the-daily-cock.fly.dev`). Don't repoint this app
  at production without an explicit decision to merge the two user pools.
- `src/config/theme.tsx` ports `../css/tokens.css` + the light-theme override
  in `../css/app.css` into a plain TS token object (RN has no CSS custom
  properties) — same semantic names, camelCased.
- No react-navigation, no Redux/state-mgmt library — `App.tsx` holds a single
  `screen` state and conditionally renders, same pattern as `ordkrig/App.tsx`.
  `src/services/gameSession.ts` holds the ported non-rendering orchestration
  logic (screen-transition decisions), mirroring `../js/ui.js`'s functions
  minus the DOM calls.

## Guardrails

- **Never run `eas login`, `eas build`, `eas update`, or `eas submit`** from
  an agent/automated context. TestFlight and App Store publishing are manual,
  from a human's own machine, using their own Apple Developer + Expo
  accounts. Agents may scaffold/edit `app.json`/`eas.json`, nothing more.
- **Never commit secrets**: no `.env`, no `.p8`/`.p12`/`.jks`/`.mobileprovision`
  files, no tokens. `eas.json`'s submit section is deliberately empty (see
  above) rather than holding an App Store Connect API key — if one is ever
  added, its key file must live *outside* this repo (e.g. `../../secrets/`).
- **Never point `EXPO_PUBLIC_API_URL`/`apiConfig.ts`'s fallback at the
  production web app** (`the-daily-cock.fly.dev`) — staging (`daily-c-staging`)
  is the default on purpose, so testers here never touch production data.
