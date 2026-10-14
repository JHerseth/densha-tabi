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
# the game itself, with this version stamped in, so the add-on can install and update it
stamp() { sed "s/var DT_VERSION = \"dev\";/var DT_VERSION = \"$VER\";/" media/_densha.js; }
stamp > "$TMP/_densha.js"
grep -q "DT_VERSION = \"$VER\"" "$TMP/_densha.js"
python3 -c 'import json,sys; m=json.load(open("addon/manifest.json",encoding="utf-8")); m["human_version"]=sys.argv[1]; json.dump(m,open(sys.argv[2],"w",encoding="utf-8"),ensure_ascii=False)' "$VER" "$TMP/manifest.json"
mkdir -p dist
rm -f "$ADDON"
(cd "$TMP" && zip -qr - .) > "$ADDON"
rm -rf "$TMP"

OUT=dist/densha-tabi-$VER
mkdir -p "$OUT"
cp release/INSTALL.txt release/template-snippet.html LICENSE "$OUT/"
stamp > "$OUT/_densha.js"
cp "$ADDON" "$OUT/densha-tabi.ankiaddon"
# Klee One's licence (SIL OFL 1.1), verbatim from the font's own repository, travels with the font in the sample deck.
cp release/OFL-KleeOne.txt "$OUT/"
if [ -n "$APKG" ]; then
  # the sample deck's own _densha.js must be this release, or decks set up from it would never be updated
  HAVE=$(python3 scripts/apkg_version.py "$APKG")
  if [ "$HAVE" != "$VER" ]; then
    echo "release.sh: $APKG has _densha.js version '${HAVE}', not $VER." >&2
    echo "  Re-run scripts/anki_setup.py --profile NAME --version $VER, re-export the deck, then release again." >&2
    exit 1
  fi
  cp "$APKG" "$OUT/todoufuken.apkg"
fi
(cd dist && zip -qr "densha-tabi-$VER.zip" "densha-tabi-$VER")
echo "dist/densha-tabi-$VER.zip"
echo "$ADDON"
