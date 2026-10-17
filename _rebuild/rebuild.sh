#!/usr/bin/env bash
set -e

# USE TO REBUILD WEB-COMPATIBLE BELUGA SRC: the JS build and the two Wasm builds
#
# The Wasm builds need wasm_of_ocaml-compiler (same version as js_of_ocaml) and
# Binaryen's wasm-opt on PATH: _rebuild/RECIPE.md, "Wasm builds".

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BELUGA_REPO="$SCRIPT_DIR/../Beluga-W"
ROOT="$SCRIPT_DIR/.."

if [ ! -d "$BELUGA_REPO" ]; then
    echo "Beluga repo not found at $BELUGA_REPO" >&2
    exit 1
fi
if ! command -v wasm-opt >/dev/null 2>&1; then
    echo "Binaryen (wasm-opt) not found on PATH; see _rebuild/RECIPE.md, Wasm builds" >&2
    exit 1
fi

# The release profile: whole-program, minified, no inline source map (the dev
# profile's JS build was 25 MB and checked 1.9x slower: docs/wasm-runtime.md).
echo "Building the JS build (stable) and the two Wasm builds, release profile ..."
cd "$BELUGA_REPO"
dune build --profile release src/web/beluga_web.bc.js \
    src/web/beluga_web_wasm.bc.wasm.js src/web/beluga_web_wasm_cps.bc.wasm.js

BUILT="$BELUGA_REPO/_build/default/src/web"

cp "$BUILT/beluga_web.bc.js" "$ROOT/beluga_web.bc.js"
echo "Copied beluga_web.bc.js (stable)"

# A Wasm build is a loader and a folder of .wasm named by their hash: the loader
# names the folder, so both keep dune's names. The old folder goes first, or every
# rebuild leaves its .wasm behind.
for name in beluga_web_wasm beluga_web_wasm_cps; do
    rm -rf "$ROOT/$name.bc.wasm.assets"
    cp -R "$BUILT/$name.bc.wasm.assets" "$ROOT/$name.bc.wasm.assets"
    cp "$BUILT/$name.bc.wasm.js" "$ROOT/$name.bc.wasm.js"
    echo "Copied $name.bc.wasm.js and $name.bc.wasm.assets (Wasm)"
done

# Stamp the new build, as stamp-runtime.ps1 does: sw.js's CACHE_NAME and
# beluga-client.js's RUNTIME_VERSION (the runtime URL's ?v=) take the same
# timestamp. All-or-nothing: each pattern must match exactly once, or nothing is
# written. tests/test-runtime-url.mjs fails if the two ever disagree.
version=$(date +%Y%m%d%H%M%S)
SW="$ROOT/sw.js"
CLIENT="$ROOT/js/beluga/beluga-client.js"
for pair in "$SW|var CACHE_NAME = 'beluga-runtime-[^']*'" "$CLIENT|var RUNTIME_VERSION = '[^']*'"; do
    file="${pair%%|*}"; pattern="${pair#*|}"
    hits=$(grep -c -- "$pattern" "$file" || true)
    if [ "$hits" != "1" ]; then
        echo "stamp: expected exactly one match of [$pattern] in $file, found $hits. Nothing written." >&2
        exit 1
    fi
done
sw_next=$(mktemp); client_next=$(mktemp)
sed "s/var CACHE_NAME = 'beluga-runtime-[^']*'/var CACHE_NAME = 'beluga-runtime-${version}'/" "$SW" > "$sw_next"
sed "s/var RUNTIME_VERSION = '[^']*'/var RUNTIME_VERSION = '${version}'/" "$CLIENT" > "$client_next"
grep -q "beluga-runtime-${version}" "$sw_next" && grep -q "RUNTIME_VERSION = '${version}'" "$client_next" || {
    echo "stamp: a file does not carry $version after replacement. Nothing written." >&2
    rm -f "$sw_next" "$client_next"; exit 1
}
mv "$sw_next" "$SW"
mv "$client_next" "$CLIENT"
echo "Runtime stamped $version (sw.js CACHE_NAME, beluga-client.js RUNTIME_VERSION)"

echo ""
echo "To deploy: upload the runtime to R2 (bucket beljar-runtime) FIRST, then deploy the site:"
echo "  _rebuild/RECIPE.md, Deploying, has the commands (the .wasm needs --content-type application/wasm)."
echo "  Then check the live site: npm run probe:live"
echo "Success!"
