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
python3 -m unittest tests/addon_test.py

# the desktop add-on: every file in addon/ (not __pycache__), its manifest stamped with this version
ADDON=dist/densha-tabi-$VER.ankiaddon
TMP=$(mktemp -d)
for f in addon/*; do [ -f "$f" ] && cp "$f" "$TMP/"; done
python3 -c 'import json,sys; m=json.load(open("addon/manifest.json",encoding="utf-8")); m["human_version"]=sys.argv[1]; json.dump(m,open(sys.argv[2],"w",encoding="utf-8"),ensure_ascii=False)' "$VER" "$TMP/manifest.json"
mkdir -p dist
rm -f "$ADDON"
(cd "$TMP" && zip -qr - .) > "$ADDON"
rm -rf "$TMP"

OUT=dist/densha-tabi-$VER
mkdir -p "$OUT"
cp media/_densha.js release/INSTALL.txt release/template-snippet.html LICENSE "$OUT/"
cp "$ADDON" "$OUT/densha-tabi.ankiaddon"
# Klee One's licence (SIL OFL 1.1), verbatim from the font's own repository, travels with the font in the sample deck.
cp release/OFL-KleeOne.txt "$OUT/"
[ -n "$APKG" ] && cp "$APKG" "$OUT/todoufuken.apkg"
(cd dist && zip -qr "densha-tabi-$VER.zip" "densha-tabi-$VER")
echo "dist/densha-tabi-$VER.zip"
echo "$ADDON"
