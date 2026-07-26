# PRD v3 — Cocky Monk
### A game-master-led bluffing party game for iOS · board-race scoring · Norwegian + English

> **How to use this document:** single source of truth; Claude Code reads it before planning any feature.
> **Interactive reference:** `Reference/cocky-monk-demo.html` is a working HTML prototype of the full round flow (both modes, bots, board, all themes). When any flow question is ambiguous in prose, the demo's behavior is the answer.
> `EDIT-ME` = your 30-second decisions. Everything else is a deliberate default.
> **Changed in v3 (from the playable prototype):** practice mode vs. computer players (§4), BotBrain spec + decoy gating (§4, §5.5), live tally screens (§5.2), bot fake pools (§9), milestones rebuilt so party-mode screens are proven against bots before networking (§12).

---

## 1. Vision
3–8 people, one game master with secrets, a room full of liars. Players invent credible fake definitions for genuinely obscure words; the game master hides the truth among them and opens the vote like a quiz-show host. Points move pawns around a living game board. Ten minutes to the first accusation of lying.

**Design north star:** the phones are props, the table is the stage. The board makes progress *felt*, not read.

## 2. Scope
| In v1 | Out of v1 |
|---|---|
| **Hotseat mode** (one phone) with full game-master flow | Internet multiplayer **in the iOS app**, accounts, hosted servers |
| **Party mode** (each player on own iPhone, same room, MultipeerConnectivity — Kahoot-style) | Cross-room/remote play **in the iOS app** |
| **Practice mode** (solo vs. computer players — same screens as party mode, bots instead of phones) | Online bots, bot difficulty levels |
| Board-race scoreboard, 3 visual themes | Custom/user-made themes |
| Language: Norwegian + English (UI **and** deck) | Other languages |
| Original decks: `deck_nb.json` (250 target) + `deck_en.json` (150 target, `EDIT-ME`: cut for v1?) | Category packs beyond `ord` |
| Sound, haptics, board animation | Ads, IAP, analytics, tracking |

### 2.1 Amendment — online rooms in the browser Lab (v1.1, 2026-07-25)
The **web build only** (`Lab/`, `dist/CockyMonk.html`, GitHub Pages) gains three features. The iOS app in `Sources/` is untouched by this amendment and keeps every rule above.

| Added to scope — **web build only** | Still out of scope, everywhere |
|---|---|
| **Online rooms:** the host shares a 6-character code or a link; players join from their own device. Host chooses when to start. WebRTC peer-to-peer, host-authoritative, **no accounts and no game server** — a public broker is used for signalling only and never sees game content | Accounts, logins, hosted game state, matchmaking with strangers |
| **Career rating:** an Elo-style rating stored **on each player's own device**, exchanged inside the room so everyone present sees everyone's rank | A global/worldwide leaderboard, server-held scores, cheat validation |
| **Phase timers** (§5.2a) | Timers in hotseat mode |

**Why the split:** the browser build is how this game gets playtested with real people before there is a Mac. Shipping online play there costs the iOS app nothing — `Sources/` gains no networking, keeps the `Transport` protocol as written in §4, and keeps the "Data Not Collected" label. The web build's privacy line changes honestly: see §10.

## 3. Legal guardrail (unchanged, non-negotiable)
Mechanics free, expression not. Never ship the name Kokkelimonke, its texts, art, or logo. All cards original (card-author skill). All bundled assets CC0 or licensed with a written record in `ASSETS.md` + `Resources/Audio/CREDITS.md`.

## 4. Play modes (one GameEngine, three front-ends)
| | Hotseat | Practice (solo vs. bots) | Party mode |
|---|---|---|---|
| Devices | 1 iPhone passed around | 1 iPhone, you alone | 1 iPhone per player, GM's phone is host |
| Networking | None | None | MultipeerConnectivity (local, no server) |
| Opponents | Real people | 2–5 computer players; **the user is game master in round 1** | Real people |
| "Tick-in" experience | Phone returns to GM; dashboard fills as it circulates | Live — bot chips flip from "tenker…" to ✓ on real-time delays | Live — chips flip as bluffs arrive from phones |
| Reveal pacing | GM taps through | User-GM taps through; **bot-GM auto-paces (~1.7 s/beat) with tap-to-skip** | GM taps; synced on all screens |
| Ships in | M1–M6 | M7 | M8–M9 |

**Architecture rules (the "easy to edit" insurance):**
- `GameEngine` never talks to devices directly — only to a `Transport` protocol (`LoopbackTransport` for hotseat/practice, `MultipeerTransport` for party). Build the protocol in M1.
- Bots are `BotBrain` participants driven through the loopback transport: they submit bluffs on randomized delays (≈1.8–5 s, starting **while** the user is still typing), the bot GM composes one decoy before the shuffle, and bots vote with a **35% truth-find rate** (tuning default — a settings constant, not a magic number). Practice mode is therefore the party-mode UI running against bots, which is exactly why it ships one milestone *before* real networking — Claude can self-playtest the party screens end-to-end without extra devices.

## 5. Game rules — precise spec

### 5.1 Roles
- **Spillmester (game master):** rotates every round in setup order. Sees the card **with the truth**. Writes 0–2 decoy explanations of their own (1 encouraged). Collects submissions, controls the vote-open button, hosts the reveal. **Does not vote.**
- **Bløffere:** everyone else. Write one bluff each, then vote.

### 5.2 Round flow
| # | Phase | What happens | GM sees | Bluffers see |
|---|---|---|---|---|
| 1 | Kortet | New GM announced with fanfare; card drawn | Word + **the truth** + decoy composer | Word only |
| 2 | Bløffing | Bluffers write secretly (140 chars max). Hotseat: privacy handover per player, phone ends at GM. Party: simultaneous on own phones | Dashboard: player chips flip from "tenker…" to "klar ✓" as each ticks in | Their editor, then a fun waiting state |
| 3 | Klargjøring | GM finishes decoys. **"Åpne avstemning"** button arms only when ALL bluffs are in + ≥0 decoys done | Big pulsing button — the Kahoot moment | "Spillmesteren blander kortene…" |
| 4 | Avstemning | Truth + bluffs + decoys shuffled, lettered A, B, C… Bluffers vote; own answer hidden from own list. After voting (or as GM), you watch a live anonymous tally screen — dots landing per option, "n/total in" | Live vote tally (anonymous until reveal) | Voting list, big type → tally screen once voted |
| 5 | Avsløring | Staged ceremony: votes fly to answers → authors unmasked one by one (Nesen grows per vote) → truth last, with fanfare — or **GM victory sting** if nobody found it | Controls the pacing (tap to advance) | Synced spectacle |
| 6 | Brettet | Board screen: pawns hop their earned spaces one by one, camera follows the leader | Same board, all devices | Same |
| 7 | Neste | GM role passes to next player; win check at end of each **full rotation** (§5.4) | — | — |

### 5.2a Phase timers *(web build only — amendment 2026-07-25, resolves §13)*
Four countdowns, **on by default in online and practice, off in hotseat** (passing one phone paces itself). The host sets the lengths at game setup. This is `Specs/FLOW.md` **Option B** — the clock actually advances the game, it does not merely nag.

| Phase | Default | At 0:00 |
|---|---|---|
| Bløffing (§5.2#2) | 60 s | Pending bluffers are **skipped for that round** — their answer never enters the option pool, exactly as a mid-round drop is handled. A late submission is rejected |
| GM decoys (§5.2#3) | 45 s | Voting opens anyway. Whatever the GM had typed is kept; empty decoys are simply absent |
| Avstemning (§5.2#4) | 45 s | Non-voters do not vote; the round is scored with the votes that arrived |
| Avsløring (§5.2#5) | 25 s per beat | The ceremony advances itself, as a bot GM already does |

**Timeout ≠ drop.** A timed-out player keeps their score, stays in the player count and the GM rotation, and is expected again next round (§5.5). Only a genuine disconnect past the reconnect window drops anyone.

**The clock is not a rule engine.** Deadlines live outside the engine, which stays timerless (LANES.md contract #1); expiry enters as an explicit action, fired **only by the host**, so the deadline is one number every device agrees on rather than a race between clocks.

### 5.3 Scoring
| Event | Points | Goes to |
|---|---|---|
| You voted for the truth | **+2** | Voter |
| Your answer received a vote (bluff **or** GM decoy) | **+1 per vote** | Author |
| **Nobody** voted for the truth | **+2** | Game master ("Spillmesteren vant runden!") |
| Dobbeltreff — a bluffer wrote ≈ the truth | **+3**, answer merged with truth | That bluffer |

GM earns *only* via decoy votes and the nobody-found-it bonus — being GM is a different job, not a free ride. All points move pawns on the board immediately (§6).

### 5.4 Game length & fairness
Track race: **Kort** = first past **8** · **Standard** = first past **15** (default) · **Maraton** = first past **25**.
**Fair-rotation rule:** the win condition is only checked when a full GM rotation completes, so everyone game-masters an equal number of rounds. Tie past the line at rotation end → *Omkamp*: one sudden-death round, tied players bluff, everyone votes, next-highest-scorer acts as GM. Still tied → shared victory, shared confetti.

### 5.5 Edge cases (unit-test every one)
- Empty/whitespace bluff → blocked with playful nudge.
- Identical bluffs → merged option; both authors split its votes' points (round up for each).
- Bluffer drops mid-round (party mode disconnect or hotseat "Fjern spiller") → their pending bluff/vote skipped; if the **GM** drops, GM role passes to next player and the round restarts with a fresh card.
- Party mode: host (GM device) connection lost → all devices show reconnect state 30 s, then offer "fortsett i Hotseat".
- App killed mid-round → full state restore (SwiftData) in hotseat; party mode host restores and re-invites.
- 3 players → 1 GM + 2 bluffers: 2 bluffs + truth + up to 2 GM decoys = 3–5 options. GM decoy strongly encouraged copy-wise at small counts.
- **Decoy gating:** the shuffle may never fire before the GM's decoy state is settled — in practice/party, a bot or slow GM finishing their decoy after "all bluffs in" must still make the option pool (the demo's `gmDecoyDone` gate).
- **Timeout is per round, not permanent** *(§5.2a, web build)*: a player who misses the bluff or vote window is skipped for that round only. They keep their score, still count toward `playerCount` and the win check, and are expected again on the next card. This is deliberately *not* the drop path above.
- **A reconnecting player is never a laggard** *(web build)*: while a player is inside the 30 s reconnect window, their phase timer does not judge them — they are excluded from the timed-out set entirely. Only when the window expires do they become a genuine drop.

## 6. The board (scoreboard as a place, not a table)
- A winding track of exactly *target* spaces (8/15/25) with Start and Mål. One pawn per player in their avatar color.
- After each reveal, pawns **hop space by space** (one haptic tick + hop sound per space), never teleport. Camera gently follows; overtakes get a tiny "vroom" moment.
- Space milestones at ⅓ and ⅔ (theme-specific landmarks) trigger a one-shot celebration for the first pawn past.
- Tap any pawn → mini scorecard (points, bluff-votes collected, Gullnese tally).
- **3 themes, identical layout logic, visuals only** (full art direction in DESIGN.md §3): **Fjellet** · **Verdensrommet** · **Salongen**. Theme chosen at game setup (`EDIT-ME` default: Salongen), changeable mid-game in settings — pawn positions unaffected.
- Implementation: one `BoardLayout` (path geometry) + `BoardTheme` protocol supplying colors, background, pawn sprites, landmark art, sounds. Kenney CC0 sprites in `AssetsIncoming/` are the raw material (see ASSETS.md).

## 7. Language
- First launch: full-screen picker **Norsk / English** (flag-free, text-first). Changeable anytime in settings; takes effect immediately.
- UI via String Catalog (nb + en, 100% coverage — CI check).
- **Deck follows language:** nb game draws `deck_nb.json`, en game draws `deck_en.json`. Language locked per game at setup (mid-game deck switch = chaos).
- Board themes, sounds, and animations are language-neutral by design.

## 8. Screens inventory
Home · LanguagePicker (first launch) · PlayerSetup (names, avatar colors, GM order = list order) · GameSetup (length, theme, mode Hotseat/Party) · PartyLobby (host + join via nearby discovery) · **GMDashboard** (truth, decoy composer, tick-in chips, open-vote button, live tally) · CardReveal (bluffer view) · Handover (hotseat privacy) · BluffEntry · WaitingRoom (party) · Vote · RevealCeremony · **BoardView** · Winner (confetti + Gullnese) · Pause/Settings (språk, lyd, haptikk, tema, fjern spiller, avslutt) · Regler (30-sec illustrated how-to, per mode) · About/Credits.

## 9. Content requirements
As v1 PRD §7 (original, verifiable, ≤140 chars, cheeky-never-crude), now per language: `deck_nb.json` ship-blocker 150/target 250 · `deck_en.json` ship-blocker 100/target 150 (`EDIT-ME`: or defer en deck; en UI ships regardless). English cards must be *English-obscure* — no translated Norwegian cards.

**Bot fake pools** (practice mode): `fakes_nb.json` / `fakes_en.json` — ≥40 original, generic-but-plausible definitions per language that read credible against *any* word ("Sjømannsuttrykk for slakk i et tau"). Owned by the card-author skill, same originality rules, drawn without repeats within a round. The 16-per-language starter set lives in the reference demo.

## 10. Immersion & quality bar
- **Audio:** Kenney CC0 kit as base — card-slide on draw, card-shuffle before vote opens, chip sounds for tick-ins, click for votes, hop-tick per board space; original fanfare + GM victory sting to be added (CC0 only, log in CREDITS.md). Everything mixable with room music; global mute persists.
- **Haptics:** every meaningful beat has one (tick-in `.light`, vote `.light`, truth `.success`, pawn hop `.soft` per space, GM steal `.heavy`).
- **Synced spectacle (party mode):** reveal and board phases render simultaneously on all devices — the room reacts together. Latency budget ≤ 300 ms for phase transitions.
- **Accessibility:** Dynamic Type XL, VoiceOver on everything incl. board state summary ("Anne leder på felt 9"), Reduced Motion → hops become slides + crossfades, no color-only info.
- **Performance:** 60 fps board on iPhone 12+; party mode 8 devices stable for a full Maraton.
- **Privacy:** zero collection, no network beyond local MPC. Label: "Data Not Collected".
  - **iOS app — unchanged.** No accounts, no analytics, no persistent identifier leaving the device. The §2.1 amendment adds nothing here.
  - **Web build (§2.1)** — the honest version: a room code and the peers' WebRTC connection details reach a public signalling broker; **game content never does** (it is peer-to-peer). A player's name, rating and career nose count are stored in their own browser's `localStorage`, sent only to the room they join, and erasable at any time from the profile screen. No server holds a score, so there is nothing to collect, breach, or subpoena — but "we store nothing at all" is no longer true, and the About screen says so plainly instead of repeating the old line.

## 11. Success criteria
1. A 5-person group finishes a Standard party-mode game with zero rule explanations from you.
2. The GM's "Åpne avstemning" press gets a reaction from the room every single round.
3. Median round ≤ 3 min with 5 players; board phase ≤ 20 s.
4. Someone, at least once per game, physically points at another player while shouting.

## 12. Milestones
| M | Deliverable | Exit test |
|---|---|---|
| M1 | Skeleton + `Transport` protocol + LanguagePicker + PlayerSetup | Builds; language switch flips every string |
| M2 | GameEngine state machine (GM rotation, phases) + full scoring incl. §5.5 — pure, tested | `scripts/test.sh` green |
| M3 | Hotseat round flow: GM dashboard, handover, bluff entry, vote | Claude plays a full round via playtest-loop |
| M4 | Reveal ceremony + Nesen + dobbeltreff + omkamp | Scoring verified by hand vs. §5.3; screenshots |
| M5 | **BoardView** + BoardTheme protocol + Salongen theme, pawns hopping | 60 fps trace; VoiceOver board summary |
| M6 | Fjellet + Verdensrommet themes + sound/haptic pass + app icon | Theme switch mid-game safe; screenshot set ×3 themes |
| M7 | **Practice mode**: party-mode screens (live tick-ins, waiting room, tally, auto-paced reveal) running against `BotBrain` opponents over loopback — user hosts round 1 | Claude completes a full solo game via playtest-loop; bot pacing feels alive in screen recording |
| M8 | Party mode: swap `MultipeerTransport` under the M7 screens + lobby | 3 simulators + 1 device complete a game |
| M9 | Party-mode hardening (§5.5 disconnects) + decks/fakes to ship-blocker size | Chaos test: kill host mid-vote, recover |
| M10 | TestFlight via release-captain | 5 external testers, one real game night |

## 13. Open questions *(answer, then delete)*
- [x] Name: **Cocky Monk** — run a Patentstyret + EUIPO trademark search before any public App Store release (the name is deliberately phonetically adjacent to the Norwegian original; fine for TestFlight)
- [ ] `EDIT-ME` English deck in v1 or v1.1?
- [ ] `EDIT-ME` Default theme: Salongen?
- [x] **Bluff timer (60 s)** — **yes, as a host-set room option, not a per-GM toggle.** Default ON online and in practice, OFF in hotseat. `Specs/FLOW.md` **Option B** (the clock advances the game), web build only, specified in §5.2a. Two questions FLOW.md left open are answered there too: the timer is *not* hidden in practice (that is where players learn it exists — bots finish around 12 s against a 60 s window), and a reconnecting player is never counted as a laggard (§5.5).
