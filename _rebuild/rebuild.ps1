$BelugaRepo = "$PSScriptRoot\..\Beluga-W"

# USE TO REBUILD WEB-COMPATIBLE BELUGA SRC INTO JS

if (-not (Test-Path $BelugaRepo)) {
    Write-Error "Beluga repo not found at $BelugaRepo"
    exit 1
}

$OpamBin = "$env:LOCALAPPDATA\opam\default\bin"
$env:PATH = "$OpamBin;$env:PATH"

Write-Host "Building stable (CPS) and fast (double-translation) builds ..."
Push-Location $BelugaRepo
dune build src/web/beluga_web.bc.js src/web/beluga_web_dt.bc.js
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Error "Build failed."
    exit 1
}
Pop-Location

Copy-Item "$BelugaRepo\_build\default\src\web\beluga_web.bc.js" "$PSScriptRoot\..\beluga_web.bc.js" -Force
Write-Host "Copied beluga_web.bc.js (stable)"

Copy-Item "$BelugaRepo\_build\default\src\web\beluga_web_dt.bc.js" "$PSScriptRoot\..\beluga_web.bc.dt.js" -Force
Write-Host "Copied beluga_web.bc.dt.js (fast)"

# Stamp the new build: sw.js's CACHE_NAME and the runtime URL's ?v= take the
# same timestamp, so old cached builds are evicted and the new bytes arrive
# under a URL no browser or edge cache has seen. Throws, all-or-nothing, if
# either stamp cannot be written.
$version = Get-Date -Format 'yyyyMMddHHmmss'
& "$PSScriptRoot\stamp-runtime.ps1" -Version $version

Write-Host ""
Write-Host "Runtime build $version."
Write-Host "To deploy: upload BOTH blobs to R2 (bucket beljar-runtime) FIRST, then deploy the site."
Write-Host "  Deploy first and Cloudflare's edge caches the OLD bytes under the NEW URL until its TTL."
Write-Host "  Then check the live site: npm run probe:live"
Write-Host "Success!"
