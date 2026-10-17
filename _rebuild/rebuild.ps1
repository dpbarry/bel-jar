$BelugaRepo = "$PSScriptRoot\..\Beluga-W"

# USE TO REBUILD WEB-COMPATIBLE BELUGA SRC: the JS build and the two Wasm builds

if (-not (Test-Path $BelugaRepo)) {
    Write-Error "Beluga repo not found at $BelugaRepo"
    exit 1
}

$OpamBin = "$env:LOCALAPPDATA\opam\default\bin"
# wasm_of_ocaml runs Binaryen (wasm-opt, wasm-merge, wasm-metadce). Windows has no
# package for it, so it is the official release unpacked here (RECIPE.md, "Wasm
# builds"); BINARYEN_BIN overrides the folder.
$BinaryenBin = if ($env:BINARYEN_BIN) { $env:BINARYEN_BIN } else { "$env:LOCALAPPDATA\binaryen\version_126\bin" }
if (-not (Test-Path (Join-Path $BinaryenBin 'wasm-opt.exe'))) {
    Write-Error "Binaryen not found at $BinaryenBin (see _rebuild/RECIPE.md, Wasm builds)."
    exit 1
}
$env:PATH = "$BinaryenBin;$OpamBin;$env:PATH"

# The release profile: whole-program, minified, no inline source map. The dev
# profile's JS build was 25 MB (11 MB of it a source map) and checked 1.9x slower
# (docs/wasm-runtime.md); the answers are the same, byte for byte.
Write-Host "Building the JS build (stable) and the two Wasm builds, release profile ..."
Push-Location $BelugaRepo
dune build --profile release src/web/beluga_web.bc.js `
    src/web/beluga_web_wasm.bc.wasm.js src/web/beluga_web_wasm_cps.bc.wasm.js
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Error "Build failed."
    exit 1
}
Pop-Location

$Built = "$BelugaRepo\_build\default\src\web"
$Root = "$PSScriptRoot\.."

Copy-Item "$Built\beluga_web.bc.js" "$Root\beluga_web.bc.js" -Force
Write-Host "Copied beluga_web.bc.js (stable)"

# A Wasm build is a loader and a folder of .wasm named by their hash: the loader
# names the folder, so both keep dune's names. The old folder goes first, or every
# rebuild leaves its .wasm behind.
foreach ($name in 'beluga_web_wasm', 'beluga_web_wasm_cps') {
    $assets = "$name.bc.wasm.assets"
    if (Test-Path "$Root\$assets") { Remove-Item "$Root\$assets" -Recurse -Force }
    Copy-Item "$Built\$assets" "$Root\$assets" -Recurse -Force
    Copy-Item "$Built\$name.bc.wasm.js" "$Root\$name.bc.wasm.js" -Force
    Write-Host "Copied $name.bc.wasm.js and $assets (Wasm)"
}

# Stamp the new build: sw.js's CACHE_NAME and the runtime URL's ?v= take the
# same timestamp, so old cached builds are evicted and the new bytes arrive
# under a URL no browser or edge cache has seen. Throws, all-or-nothing, if
# either stamp cannot be written.
$version = Get-Date -Format 'yyyyMMddHHmmss'
& "$PSScriptRoot\stamp-runtime.ps1" -Version $version

Write-Host ""
Write-Host "Runtime build $version."
Write-Host "To deploy: upload the runtime to R2 (bucket beljar-runtime) FIRST, then deploy the site:"
Write-Host "  _rebuild/RECIPE.md, Deploying, has the commands (the .wasm needs --content-type application/wasm)."
Write-Host "  Deploy first and Cloudflare's edge caches the OLD bytes under the NEW URL until its TTL."
Write-Host "  Then check the live site: npm run probe:live"
Write-Host "Success!"
