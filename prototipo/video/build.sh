#!/usr/bin/env bash
# Builds promo mp4: frames (Chromium) + synthesized audio -> H.264/AAC. Usage: ./build.sh <workdir> <out.mp4>
set -euo pipefail
WORK="$1"; OUT="$2"; FPS=30; TOTAL=1200; WORKERS=4
mkdir -p "$WORK/frames"
python3 -I audio.py "$WORK/promo.wav"
per=$((TOTAL / WORKERS))
for w in $(seq 0 $((WORKERS - 1))); do
  node render.mjs $((w * per)) $(((w + 1) * per)) "$WORK/frames" $FPS &
done
wait
ffmpeg -y -hide_banner -loglevel error -framerate $FPS -i "$WORK/frames/%05d.jpg" -i "$WORK/promo.wav" \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
echo done "$OUT"
