#!/usr/bin/env bash
set -euo pipefail

assets="$(cd -- "$(dirname -- "$0")/../artifacts/highplains-crm/public/email" && pwd)"
# Keep the source untouched: delivered emails still reference mountains.png.
# Convert the flattened light art to ink coverage, then map it onto the footer
# palette with a limited number of shades for a compact, opaque PNG.
magick "$assets/mountains.png" -colorspace gray -level 28%,98% -negate \
  +dither -posterize 24 -colorspace sRGB +level-colors '#27312C,#5E6C64' \
  -strip -depth 8 -define png:compression-level=9 \
  "PNG8:$assets/mountains-footer.png"
