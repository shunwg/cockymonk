# Provenance

Vendored from https://github.com/diffusionstudio/lottie (`skills/text-to-lottie/`, branch `main`) on 2026-07-19.
License: see `LICENSE` in this folder (upstream repo license, fetched same day).

Why vendored: `npx skills add diffusionstudio/lottie` failed twice on this network (git clone timeouts), so the
skill files were fetched individually via raw.githubusercontent.com — same content, pinned to the fetch date.
To update: re-run `npx skills add diffusionstudio/lottie` on a healthier network, or re-fetch the folder.

Note: the skill's player-contract/starter-project references assume the upstream repo's Skia/Skottie web player.
In this project we preview with `Lab/lottie/player.html` (lottie-web) instead — the authoring guidance
(lottie-spec-map, motion-taste, recipes) is what we use it for; its Lottie JSON is fully compatible.
