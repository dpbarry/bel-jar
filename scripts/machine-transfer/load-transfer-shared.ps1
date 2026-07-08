# Dot-sources transfer-shared.ps1 (or legacy _lib.ps1 from older archives).
$shared = Join-Path $PSScriptRoot 'transfer-shared.ps1'
if (-not (Test-Path $shared)) {
    $legacy = Join-Path $PSScriptRoot '_lib.ps1'
    if (Test-Path $legacy) { $shared = $legacy }
}
if (-not (Test-Path $shared)) {
    throw 'transfer-shared.ps1 not found (shared import/export module for machine transfer).'
}
. $shared
