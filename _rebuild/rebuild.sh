#!/usr/bin/env bash

# USE TO REBUILD WEB-COMPATIBLE BELUGA SRC INTO JS

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BELUGA_REPO="$SCRIPT_DIR/../Beluga-W"

if [ ! -d "$BELUGA_REPO" ]; then
    echo "Beluga repo not found at $BELUGA_REPO" >&2
    exit 1
fi

echo "Building beluga_web.bc.js ..."
cd "$BELUGA_REPO"
dune build src/web/beluga_web.bc.js

cp "$BELUGA_REPO/_build/default/src/web/beluga_web.bc.js" "$SCRIPT_DIR/../beluga_web.bc.js"

echo "Success!"
