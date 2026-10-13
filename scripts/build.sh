#!/bin/sh
# Build the installed file: media/_densha.js is densha.js as it is (one plain file, no bundling).
set -e
cd "$(dirname "$0")/.."
mkdir -p media
cp densha.js media/_densha.js
echo "media/_densha.js ($(wc -c < media/_densha.js) bytes)"
