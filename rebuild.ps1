$BelugaRepo = "$PSScriptRoot\Adapted-Beluga"

# USE TO REBUILD WEB-COMPATIBLE BELUGA SRC INTO JS

if (-not (Test-Path $BelugaRepo)) {
    Write-Error "Beluga repo not found at $BelugaRepo"
    exit 1
}

Write-Host "Building beluga_web.bc.js ..."
Push-Location $BelugaRepo
dune build src/web/beluga_web.bc.js
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Error "Build failed."
    exit 1
}
Pop-Location

Copy-Item "$BelugaRepo\_build\default\src\web\beluga_web.bc.js" "$PSScriptRoot\beluga_web.bc.js" -Force

Write-Host "Success!"
