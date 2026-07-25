# GitHub runbook — Cocky Monk

How to put this project on GitHub, and how the four of us then work in it: separately, together, and in named versions.

## 0 · What Git and GitHub actually are

Right now the whole game sits in one folder on one Windows laptop. It already has a full commit history — but no copy anywhere else, and no way for the others to reach it.

Two different things, often confused:

**Git** is the version-control program on your laptop. It records snapshots of the folder and lets you move between them. It works with no internet at all.

**GitHub** is a website that hosts a copy of that history. It is the meeting point — nothing more magical than that.

So: git does the versioning, GitHub does the sharing.

## 1 · Deploy it (once, ~5 minutes)

### Step 1 — create an empty repo

Go to **github.com/new**

- Name: `cocky-monk`
- Visibility: **Private**
- **Do not tick** "Add a README", ".gitignore" or "license"

That last point matters. This repo already has 30+ commits. If GitHub initialises the remote with its own first commit, the two histories collide and the first push is refused.

Click **Create repository**, then copy the HTTPS URL it shows you.

### Step 2 — point the local repo at it

In the project folder:

```
git branch -m master main
git remote add origin <URL>
git push -u origin main
```

What those do:

- `branch -m main` renames the branch to GitHub's default name
- `origin` is just a nickname for the URL
- `-u` remembers the pairing, so from then on plain `git push` works

### Step 3 — sign in when asked

The first push asks who you are. A browser window usually opens — sign in and you are done; Windows stores it in Credential Manager.

If it instead asks for a **password**, it means a *personal access token*, not your account password. Make one at: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained. Give it access to this one repo.

Easier alternative: install **GitHub Desktop**, which handles all authentication for you and can do the push with a button.

### Step 4 — verify

Refresh the repo page. You should see the file list with `00-START-HER.md` on top and the commit count in the header. Check that `dist/CockyMonk.html` is there — that single file is the playable game.

### Step 5 — invite the other three

Repo → **Settings** → **Collaborators** → **Add people**.

They accept by email, then run:

```
git clone <URL>
```

That is their entire setup, plus Node 18 or newer. Send them straight to `00-START-HER.md`.

## 2 · The four words that carry everything

**Commit** — a saved snapshot with a message. Small and frequent beats big and rare. Nothing is ever lost; any commit can be returned to.

**Branch** — a parallel line of commits. `main` is the trunk and must always work. A branch starts as an exact copy of main and drifts as you commit to it. It is a sandbox.

**Remote** — GitHub's copy. `git push` sends your commits up, `git pull` brings others' down. Your laptop and GitHub are independent; they only sync when told.

**Pull request (PR)** — "please merge my branch into main". It shows every changed line, collects comments, and is where the segment gate gets checked before anything lands.

## 3 · Working separately

This is the normal case, and the answer to "how do we each make our own versions". Everyone works on their own branch. Nobody sees anyone else's half-finished work.

```
git pull
git checkout -b skjermer/13-nese
```

...edit files, then run your segment's gate:

```
node --test Lab/js/fixtures.test.mjs
```

Green? Commit and push:

```
git add -A
git commit -m "13: nose vs author label"
git push -u origin skjermer/13-nese
```

Then on GitHub: **Compare & pull request** → write a line about what you did → someone glances at it → **Merge**. Delete the branch afterwards; it has done its job.

Branch names follow TEAM.md — `segment/short-what`:

- `ordlister/25-nye-nb`
- `brettet/tema-badstue`
- `regler/omkamp-fix`

**Why this works with four generalists.** Two of you can sit in the same file on different branches for days. Git merges by line, not by file. A real conflict needs you both to have edited *the same lines* — and then git stops and asks. It never silently picks a winner.

## 4 · Working together on the same thing

Two shapes. Pick per situation.

**Shared branch.** Both of you push to `brettet/tema-badstue`. One rule: `git pull` before every `git push`, and commit small. Tell each other which file you are in.

**Handing over through the PR.** More common and calmer: A opens the PR, B reviews it on GitHub and comments on the exact line ("07 still shows the old copy"), A pushes another commit to the same branch — the PR updates itself. Merge when you are both happy.

### When git stops with a conflict

```
git pull
CONFLICT in Lab/js/ui.js
```

Open the file. You will find markers:

```
<<<<<<< HEAD
your version
=======
their version
>>>>>>>
```

Keep what is right — often both, edited together — delete the markers, then:

```
git add Lab/js/ui.js
git commit
```

**Never hand-merge generated files.** For `dist/`, `Lab/css/tokens.css` or `Specs/SCORING.md`, take either side and regenerate:

```
node Tools/build-standalone.mjs
node Tools/tokens-build.mjs
node Tools/rules-sheet.mjs
```

## 5 · Named versions

Branches are for work in progress. **Tags** are for "this is version X":

```
git tag -a v0.2 -m "Segments + screens"
git push origin v0.2
```

On GitHub, **Releases** turns a tag into a download page. That is the right home for the playable `dist/CockyMonk.html` when you want to hand the game to a tester who does not use git.

Want your own flavour of the *whole* game rather than one change to ours? That is a long-lived branch (`variant/ase-hardcore`) or a fork. Both are fine — the gates still tell you whether you broke the rules.

## 6 · The daily loop

```
git pull
git checkout -b segment/what
```

work → run the segment gate → then:

```
git add -A
git commit -m "…"
git push
```

PR on GitHub → merge → delete branch.

Before anything leaves the house: `/qa --ship`.

## 7 · Small print worth knowing now

**Never commit secrets.** Nothing here needs a password today. When Mac day brings signing certificates and App Store keys, they stay out of git — see `.gitignore` and `MAC_RUNBOOK.md`.

**This repo tracks `dist/` on purpose**, so people can play without installing Node. The price: a Lab change must ship with a rebuilt `dist/` in the same commit, or you get pointless conflicts there.

**Binaries do not diff.** The 18 screen PNGs are fine. Do not add hundreds of megabytes of audio without discussing it.

**If a clone or push stalls on Shun's laptop specifically**, that is a known local network quirk, not GitHub. Retry, or use GitHub Desktop. The others' machines are unaffected.

**Nothing you do on a branch can break main.** That is the entire point of this setup. Be brave.
