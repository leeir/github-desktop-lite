#!/bin/bash
# Build the approved Lite artwork into both macOS icon formats.
set -euo pipefail

ICON_ROOT="$(cd "$(dirname "$0")/../app/static/logos" && pwd)"
ICON_WORK=$(mktemp -d)
trap 'rm -rf "$ICON_WORK"' EXIT
ICON_SET="$ICON_WORK/Lite.xcassets/icon-logo.appiconset"
mkdir -p "$ICON_SET" "$ICON_WORK/compiled"

for size in 16 32 128 256 512; do
  for scale in 1 2; do
    pixels=$((size * scale))
    sips -z "$pixels" "$pixels" "$ICON_ROOT/lite/feather-source.png" \
      --out "$ICON_SET/icon_${size}x${size}@${scale}x.png" >/dev/null
  done
done

node - "$ICON_SET" <<'JS'
const fs = require('fs');
const path = require('path');
const images = [16, 32, 128, 256, 512].flatMap(size =>
  [1, 2].map(scale => ({
    idiom: 'mac', size: `${size}x${size}`, scale: `${scale}x`,
    filename: `icon_${size}x${size}@${scale}x.png`,
  }))
);
fs.writeFileSync(path.join(process.argv[2], 'Contents.json'),
  JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2));
JS

xcrun actool "$ICON_WORK/Lite.xcassets" --compile "$ICON_WORK/compiled" \
  --output-format human-readable-text --notices --warnings --errors \
  --output-partial-info-plist "$ICON_WORK/Info.plist" \
  --app-icon icon-logo --target-device mac --minimum-deployment-target 12.0 \
  --platform macosx

cp "$ICON_WORK/compiled/Assets.car" "$ICON_ROOT/prod/Assets.car"
cp "$ICON_WORK/compiled/icon-logo.icns" "$ICON_ROOT/prod/icon-logo-legacy.icns"
sips -z 128 128 "$ICON_ROOT/lite/feather-source.png" \
  --out "$ICON_ROOT/../common/logo-64x64@2x.png" >/dev/null
