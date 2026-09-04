#!/usr/bin/env bash
#
# Render scripts/og-banner.html to the social images in public/assets/social.
#
# Headless Chrome is the renderer because the banner's light shafts are drawn
# on a <canvas> — there is no way to produce them from a static asset, and any
# other rasteriser would have to reimplement the shader port in og-banner.html.
#
# Usage:  ./scripts/capture-social.sh
#
set -euo pipefail

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
if [[ ! -x "$CHROME" ]]; then
  echo "Chrome not found at: $CHROME" >&2
  echo "Set CHROME=/path/to/chrome and re-run." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="file://$ROOT/scripts/og-banner.html"
OUT="$ROOT/public/assets/social"
mkdir -p "$OUT"

shoot() {
  local w=$1 h=$2 name=$3
  # `--virtual-time-budget` lets the webfonts, the two WebP assets and the
  # canvas pass all settle before the shutter fires. Without it the shafts are
  # sometimes captured mid-paint.
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 \
    --window-size="$w,$h" \
    --virtual-time-budget=3000 \
    --screenshot="$OUT/$name.png" \
    "$SRC?w=$w&h=$h" >/dev/null 2>&1
  echo "  $name.png  ${w}x${h}"
}

echo "Rendering social images:"
# Open Graph / Twitter / Slack / LinkedIn all read this one.
shoot 1200 630 og-1200x630
# A wider crop for site headers and email banners.
shoot 1600 500 banner-1600x500

# WebP alongside each PNG: same pixels at roughly an eighth the bytes, for
# anywhere that accepts it. Social crawlers generally want the PNG.
if command -v cwebp >/dev/null 2>&1; then
  for f in "$OUT"/*.png; do
    cwebp -quiet -q 88 "$f" -o "${f%.png}.webp"
  done
  echo "WebP variants written."
fi

echo "Done -> public/assets/social/"
