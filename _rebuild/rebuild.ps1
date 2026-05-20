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

# Bump the SW cache version so the activate handler evicts old cached builds
$version = Get-Date -Format 'yyyyMMddHHmmss'
$swPath = "$PSScriptRoot\..\sw.js"
$swContent = (Get-Content $swPath -Raw) -replace "var CACHE_NAME = 'beluga-runtime-[^']*'", "var CACHE_NAME = 'beluga-runtime-$version'"
[System.IO.File]::WriteAllText($swPath, $swContent)
Write-Host "SW cache version bumped to $version"

Write-Host "Success!"
