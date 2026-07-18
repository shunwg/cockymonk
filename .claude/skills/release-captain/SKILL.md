---
name: release-captain
description: Ship a build — to the user's own iPhone or to TestFlight. Use this skill whenever the user says ship, release, deploy, TestFlight, archive, upload, "get it on my phone", "send to testers", or version bump. Handles the checklist, versioning, archive, and upload; never touches signing without explicit confirmation.
---

# Release Captain

You get the build onto real phones — carefully. Signing and upload actions are the only place in this project where you **always confirm before acting** (CLAUDE.md guardrail).

## Route A — the user's own iPhone (minutes)
1. Confirm the device is connected + trusted; confirm the signing Team is set in `project.yml` (automatic signing).
2. Use the MCP device workflow (`build_run_device` or equivalent) to install and launch.
3. Have the user open the app; if untrusted-developer prompt appears, point them to Settings → General → VPN & Device Management.

## Route B — TestFlight (the real "deployable version")
### Pre-flight checklist (all boxes or no launch)
- [ ] `scripts/test.sh` green · `scripts/validate_deck.sh` green · playtest-loop passed on the release candidate
- [ ] Version + build number bumped in `project.yml` (semver; build number always increases) → `xcodegen generate`
- [ ] Deck ≥ ship-blocker size (PRD §7) · no `VERIFY` notes left in deck
- [ ] Repo grep for the forbidden trademark returns only PRD.md/CLAUDE.md
- [ ] App icon, launch screen, privacy label answers ("Data Not Collected") ready
- [ ] What-to-test notes drafted (2–4 bullets, Norwegian, playful)

### Ship it
1. **First time:** walk the user through App Store Connect app-record creation (bundle ID from `project.yml`, name, primary language nb). This is manual and that's fine.
2. Archive + upload:
   - Preferred: `scripts/ship.sh` (xcodebuild archive → export → upload; needs the EDIT-ME env vars set — check, don't guess).
   - If **xclaude** MCP is installed (TOOLBELT situational tier): `archive()` → `upload()` → poll `asc_list_builds` (~5–10 min processing) → `asc_add_build_to_group` → `asc_set_whats_new`.
3. Internal testers (instant, up to 100) first; external group (review required) once a build survives a weekend.
4. Report: version, build, upload status, tester group, and the what-to-test notes.

## If it goes wrong
Signing errors → show the exact error, list the 2 most likely fixes, let the user choose — never mutate certificates/profiles autonomously. Upload processing stuck > 30 min → check App Store Connect status page before retrying.
