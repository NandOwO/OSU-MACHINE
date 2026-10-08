#!/usr/bin/env bash
# Builds the promo mp4. Usage: ./build.sh <workdir> <out.mp4>
# Needs private/ (git-ignored): data.json, skins/, bg/, <key>-audio.mp3, <key>-hit.wav. See ../README.md.
set -euo pipefail
WORK="$1"; OUT="$2"; FPS=30; TOTAL=2400; WORKERS=4
mkdir -p "$WORK/frames"
echo "window.DATA=$(cat private/data.json);window.SKINMAN=$(cat private/skins/manifest.json);" > private/assets.js
python3 -I audio.py "$WORK" "$WORK/promo.wav"
per=$((TOTAL / WORKERS))
for w in $(seq 0 $((WORKERS - 1))); do
  node render.mjs $((w * per)) $(((w + 1) * per)) "$WORK/frames" $FPS &
done
wait
ffmpeg -y -hide_banner -loglevel error -framerate $FPS -i "$WORK/frames/%05d.jpg" -i "$WORK/promo.wav" \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
echo done "$OUT"
