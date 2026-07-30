# AGENTS.md — the-daily-cock/app

Expo/React Native port of The Daily Cock (see `../CLAUDE.md`) — same game,
targeting iOS (TestFlight), Android, and web from one codebase, alongside
(not replacing) the vanilla-JS web app in `../js`/`../index.html`. Modeled
directly on `ordkrig/`'s proven Expo setup.

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
Guardrails below):
1. `npx expo login` (or `eas login`).
2. Pick a real bundle identifier and put it in `app.json`'s
   `ios.bundleIdentifier` / `android.package` — currently the placeholder
   `com.PLACEHOLDER.dailycock`.
3. `eas init` — links the project to your Expo account, fills in `app.json`'s
   `extra.eas.projectId` placeholder.
4. `eas build --platform ios --profile testflight` — builds in Expo's cloud;
   walks you through Apple sign-in and can auto-create the App ID /
   provisioning profile on first run.
5. `eas submit --platform ios --profile testflight` — uploads the build to
   App Store Connect. You can skip pre-filling `eas.json`'s submit section
   (`ascApiKeyPath` etc. are placeholders) and just answer its interactive
   Apple ID prompts instead — the API-key route is only worth it if you want
   to automate submits later.
6. App Store Connect → your app → **TestFlight** tab → **External Testing** →
   new group → add testers by email. The *first* build to a group needs a
   quick Apple Beta App Review (usually well under 24h); later builds to the
   same group don't.

**Which Apple ID to use**: if your only Apple Developer Program access is as
an admin/member of someone else's organization account (e.g. an employer's),
don't build/submit under that team — the app would land in their App Store
Connect, visible to their other admins. Use a separate, personal Apple ID
enrolled in its own Individual Program membership instead.

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
  files, no tokens. `eas.json`'s `ascApiKeyPath` points *outside* this repo
  (`../../secrets/`) on purpose.
