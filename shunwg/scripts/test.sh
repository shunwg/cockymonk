#!/usr/bin/env bash
# Run the unit test suite on the simulator.
set -euo pipefail
SCHEME="${1:-Snifferoo}"
DEST='platform=iOS Simulator,name=iPhone 16'
CMD=(xcodebuild -scheme "$SCHEME" -destination "$DEST" -derivedDataPath .build test)
if command -v xcbeautify >/dev/null; then "${CMD[@]}" | xcbeautify; else "${CMD[@]}"; fi
