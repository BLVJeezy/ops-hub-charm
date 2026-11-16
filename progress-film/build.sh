#!/bin/sh
# SOLYN GLOBAL PROGRESS — one command: sh build.sh [full|week]
#   data.json = the Hub snapshot (the single row of snapshot.sql) · LIB = the Lemo-Opuscar library
# Output: progress.mp4 (master), progress-web.mp4 (small copy for the Hub), progress.srt, poster.jpg, chapters.json
set -e
HERE=$(cd "$(dirname "$0")" && pwd); MODE=${1:-week}
LIB=${LIB:-$HOME/lemo-opuscar}; export LIB
[ -f "$LIB/core/render/video.mjs" ] || { echo "set LIB to the Lemo-Opuscar library"; exit 1; }
PY="$LIB/.venv/bin/python"
if ! ffmpeg -version 2>/dev/null | head -1 | grep -Eq 'version (n)?([7-9]|[1-9][0-9])\.'; then   # mux.sh needs ffmpeg 7+
  find_ff() { ls "$("$PY" -c "import imageio_ffmpeg,os;print(os.path.dirname(imageio_ffmpeg.__file__))" 2>/dev/null)"/binaries/ffmpeg-* 2>/dev/null | head -1; }
  F=$(find_ff); [ -n "$F" ] || { "$PY" -m pip install -q imageio-ffmpeg 2>/dev/null || uv pip install -q --python "$PY" imageio-ffmpeg; F=$(find_ff); }
  [ -n "$F" ] || { echo "ffmpeg 7+ not found"; exit 1; }
  mkdir -p "$HERE/out/bin"; ln -sf "$F" "$HERE/out/bin/ffmpeg"; PATH="$HERE/out/bin:$PATH"; export PATH
fi
sh "$HERE/tools/fonts.sh"
node --experimental-strip-types --no-warnings "$HERE/tools/prepare.mts" "$HERE" "$MODE"   # 1. numbers, look and voice lines
cd "$LIB"
rm -rf "$HERE/voices"; "$PY" core/tts/tts.py "$HERE/lines.json" "$HERE/voices"            # 2. voice (Kokoro, offline)
node "$HERE/tools/export.mjs" "$HERE"                                                     # 3. timeline, chapters, subtitles
"$PY" "$HERE/mix.py" "$HERE"                                                              # 4. score + sounds + voice
"$PY" core/render/srt.py "$HERE/out/srt.json" "$HERE/progress.srt"
node core/render/video.mjs "$HERE" --fps 24 --workers ${WORKERS:-3} --out "$HERE/out/video.mp4"   # 5. picture
sh core/render/mux.sh "$HERE/out/video.mp4" "$HERE/mix.wav" "$HERE/progress.mp4" 24 0             # 6. master −14 LUFS
node core/render/still.mjs "$HERE" 3.2 --q nosub=1 --out "$HERE/out" --prefix po_ && cp "$HERE/out/po_3.2.jpg" "$HERE/poster.jpg"
ffmpeg -loglevel error -y -i "$HERE/progress.mp4" -vf scale=1280:-2 -c:v libx264 -preset veryfast -crf 25 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart "$HERE/progress-web.mp4"
echo "done: $HERE/progress.mp4"
