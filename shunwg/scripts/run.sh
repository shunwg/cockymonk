#!/usr/bin/env bash
# Build, install, and launch on the iPhone 16 simulator.
set -euo pipefail
SCHEME="${1:-Snifferoo}"
scripts/build.sh "$SCHEME"
APP=$(find .build/Build/Products -name "$SCHEME.app" -maxdepth 3 | head -1)
[ -n "$APP" ] || { echo "App bundle not found under .build/"; exit 1; }
BUNDLE_ID=$(defaults read "$PWD/$APP/Info" CFBundleIdentifier)
xcrun simctl boot "iPhone 16" 2>/dev/null || true
open -a Simulator
xcrun simctl install "iPhone 16" "$APP"
xcrun simctl launch "iPhone 16" "$BUNDLE_ID"
echo "Launched $BUNDLE_ID on iPhone 16 simulator."
