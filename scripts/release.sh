#!/bin/sh
# Build dist/densha-tabi-<version>.zip: the game, the template snippet, the install guide, the licences and,
# when given, the sample deck (an .apkg exported from Anki without scheduling and without data-dev).
#   sh scripts/release.sh 1.0.0 [path/to/todoufuken.apkg]
set -eu
cd "$(dirname "$0")/.."
VER=${1:?usage: release.sh VERSION [deck.apkg]}
APKG=${2:-}

sh scripts/build.sh
node --test >/dev/null

OUT=dist/densha-tabi-$VER
mkdir -p "$OUT"
cp media/_densha.js release/INSTALL.txt release/template-snippet.html LICENSE "$OUT/"
# Klee One's licence (SIL OFL 1.1), verbatim from the font's own repository, travels with the font in the sample deck.
cp release/OFL-KleeOne.txt "$OUT/"
[ -n "$APKG" ] && cp "$APKG" "$OUT/todoufuken.apkg"
(cd dist && zip -qr "densha-tabi-$VER.zip" "densha-tabi-$VER")
echo "dist/densha-tabi-$VER.zip"
