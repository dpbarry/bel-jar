#!/usr/bin/env bash
set -e

# USE TO REBUILD WEB-COMPATIBLE BELUGA SRC INTO JS

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BELUGA_REPO="$SCRIPT_DIR/../Beluga-W"

if [ ! -d "$BELUGA_REPO" ]; then
    echo "Beluga repo not found at $BELUGA_REPO" >&2
    exit 1
fi

echo "Building stable (CPS) and fast (double-translation) builds ..."
cd "$BELUGA_REPO"
dune build src/web/beluga_web.bc.js src/web/beluga_web_dt.bc.js

cp "$BELUGA_REPO/_build/default/src/web/beluga_web.bc.js" "$SCRIPT_DIR/../beluga_web.bc.js"
echo "Copied beluga_web.bc.js (stable)"

cp "$BELUGA_REPO/_build/default/src/web/beluga_web_dt.bc.js" "$SCRIPT_DIR/../beluga_web.bc.dt.js"
echo "Copied beluga_web.bc.dt.js (fast)"

# Bump the SW cache version so the activate handler evicts old cached builds
version=$(date +%Y%m%d%H%M%S)
tmpfile=$(mktemp)
sed "s/var CACHE_NAME = 'beluga-runtime-[^']*'/var CACHE_NAME = 'beluga-runtime-${version}'/" "$SCRIPT_DIR/../sw.js" > "$tmpfile"
mv "$tmpfile" "$SCRIPT_DIR/../sw.js"
echo "SW cache version bumped to $version"

echo "Success!"
