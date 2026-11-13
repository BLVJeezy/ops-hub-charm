#!/bin/sh
# NOON SCAN — one command: sh build.sh   (data.json = the Hub snapshot of the day; LIB = the Lemo-Opuscar library)
# Output: noon-scan.mp4, noon-scan.srt, poster.jpg, chapters.json in this folder.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
LIB=${LIB:-$HOME/lemo-opuscar}; export LIB
[ -f "$LIB/core/render/video.mjs" ] || { echo "set LIB to the Lemo-Opuscar library"; exit 1; }
PY="$LIB/.venv/bin/python"
# ffmpeg 7+ for mux.sh: use imageio-ffmpeg's static build when the system one is older
if ! ffmpeg -version 2>/dev/null | head -1 | grep -Eq 'version (n)?([7-9]|[1-9][0-9])\.'; then
  # the bundled static build (the IMAGEIO_FFMPEG_EXE override would point back at the old system one)
  find_ff() { ls "$("$PY" -c "import imageio_ffmpeg,os;print(os.path.dirname(imageio_ffmpeg.__file__))" 2>/dev/null)"/binaries/ffmpeg-* 2>/dev/null | head -1; }
  F=$(find_ff)
  [ -n "$F" ] || { "$PY" -m pip install -q imageio-ffmpeg 2>/dev/null || uv pip install -q --python "$PY" imageio-ffmpeg; F=$(find_ff); }
  [ -n "$F" ] || { echo "ffmpeg 7+ not found"; exit 1; }
  mkdir -p "$HERE/out/bin"; ln -sf "$F" "$HERE/out/bin/ffmpeg"; PATH="$HERE/out/bin:$PATH"; export PATH
fi
sh "$HERE/tools/fonts.sh"
cd "$LIB"
node "$HERE/models/gen_network.mjs" "$HERE/data.json" > "$HERE/network.json"     # 1. wireframe network from the snapshot
node "$HERE/tools/make_lines.mjs" "$HERE"                                         # 2. voice lines from the snapshot
"$PY" core/tts/tts.py "$HERE/lines.json" "$HERE/voices"                           # 3. Kokoro voice (offline)
node "$HERE/tools/export.mjs" "$HERE"                                             # 4. events / timeline / chapters / subtitles
"$PY" "$HERE/music/score.py" "$HERE"                                              # 5. score
"$PY" "$HERE/mix.py" "$HERE"                                                      # 6. foley + ambience + voice + ducking → mix.wav
"$PY" core/render/srt.py "$HERE/out/srt.json" "$HERE/noon-scan.srt"               # 7. subtitles
node core/render/video.mjs "$HERE" --fps 24 --workers ${WORKERS:-3} --out "$HERE/out/video.mp4"   # 8. picture
sh core/render/mux.sh "$HERE/out/video.mp4" "$HERE/mix.wav" "$HERE/noon-scan.mp4" 24 0            # 9. master −14 LUFS
node core/render/still.mjs "$HERE" 9.5 --q nosub=1 --out "$HERE/out" --prefix po_ && cp "$HERE/out/po_9.5.jpg" "$HERE/poster.jpg"
ffmpeg -loglevel error -y -i "$HERE/noon-scan.mp4" -vf scale=1280:-2 -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart "$HERE/noon-scan-web.mp4"                 # 10. small copy for the Hub player / storage
echo "done: $HERE/noon-scan.mp4"
