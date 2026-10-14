#!/bin/sh
# Build the installed file: refresh densha.js's line data from lines.json, then media/_densha.js is densha.js as it
# is (one plain file, no bundling).
set -e
cd "$(dirname "$0")/.."
node scripts/inline-lines.js
mkdir -p media
cp densha.js media/_densha.js
echo "media/_densha.js ($(wc -c < media/_densha.js) bytes)"
