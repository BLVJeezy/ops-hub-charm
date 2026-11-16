#!/bin/sh
# Fonts (SIL Open Font License 1.1, see ../CREDITS) are not kept in git: fetched from google/fonts, pinned to one commit.
set -e
D=$(cd "$(dirname "$0")/.." && pwd)/fonts; mkdir -p "$D"
GF=https://raw.githubusercontent.com/google/fonts/86aced91de05cd4f96a06838124cca45be337b2b
get() { [ -s "$D/$1" ] && [ -z "$FORCE" ] && return 0; curl -fsSL -g --retry 2 -o "$D/download.part" "$GF/$2" || { rm -f "$D/download.part"; echo "could not fetch fonts/$1" >&2; exit 1; }; mv "$D/download.part" "$D/$1"; echo "fonts/$1"; }
get Sora.ttf "ofl/sora/Sora%5Bwght%5D.ttf"
get Fraunces.ttf "ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf"
get InstrumentSans.ttf "ofl/instrumentsans/InstrumentSans%5Bwdth%2Cwght%5D.ttf"
get JetBrainsMono.ttf "ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf"
get Archivo.ttf "ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf"
