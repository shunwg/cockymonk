#!/usr/bin/env bash
# TestFlight upload: archive -> export -> upload. Guided + guarded.
# EDIT-ME before first use: set these three environment variables (App Store Connect API key):
#   export ASC_KEY_ID=XXXXXXXX  ASC_ISSUER_ID=xxxx-xxxx  ASC_KEY_PATH=~/.appstoreconnect/AuthKey_XXXXXXXX.p8
# Create the key in App Store Connect -> Users and Access -> Integrations -> App Store Connect API.
set -euo pipefail
SCHEME="${1:-Snifferoo}"
: "${ASC_KEY_ID:?Set ASC_KEY_ID (see header of this script)}"
: "${ASC_ISSUER_ID:?Set ASC_ISSUER_ID}"
: "${ASC_KEY_PATH:?Set ASC_KEY_PATH}"

echo "== Pre-flight =="
scripts/test.sh "$SCHEME"
scripts/validate_deck.sh

ARCHIVE=".build/$SCHEME.xcarchive"
echo "== Archive =="
xcodebuild -scheme "$SCHEME" -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" archive

echo "== Export IPA =="
[ -f ExportOptions.plist ] || cat > ExportOptions.plist << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
</dict></plist>
PLIST
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist ExportOptions.plist -exportPath .build/export \
  -allowProvisioningUpdates \
  -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  -authenticationKeyPath "$ASC_KEY_PATH"

IPA=$(find .build/export -name '*.ipa' | head -1)
echo "== Upload to App Store Connect: $IPA =="
xcrun altool --upload-app -f "$IPA" -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
echo "Uploaded. Processing takes ~5-10 min; then add the build to a TestFlight group in App Store Connect."
