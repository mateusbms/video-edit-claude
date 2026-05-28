#!/usr/bin/env bash
set -euo pipefail
OUT="${1:-jobs/sample/source.mp4}"
mkdir -p "$(dirname "$OUT")"
# 12s: tom 0-3s, silêncio 3-6s, tom 6-9s, silêncio 9-12s, sobre fundo de cor
ffmpeg -y \
  -f lavfi -i "color=c=gray:s=1280x720:d=12" \
  -f lavfi -i "sine=frequency=300:d=12" \
  -af "volume='if(lt(t,3)+gt(t,6)*lt(t,9),1,0)':eval=frame" \
  -shortest -pix_fmt yuv420p "$OUT"
echo "sample em $OUT"
