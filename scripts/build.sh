#!/usr/bin/env bash
# Build for the iPhone 16 simulator. Usage: scripts/build.sh [SchemeName]
set -euo pipefail
SCHEME="${1:-CockyMonk}"
DEST='platform=iOS Simulator,name=iPhone 16'
CMD=(xcodebuild -scheme "$SCHEME" -destination "$DEST" -derivedDataPath .build build)
if command -v xcbeautify >/dev/null; then "${CMD[@]}" | xcbeautify; else "${CMD[@]}"; fi
