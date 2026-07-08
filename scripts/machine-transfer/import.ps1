# Import a bel-jar machine transfer archive produced by export.ps1.
# Usage:
#   .\scripts\machine-transfer\import.ps1 -Archive ~\Desktop\bel-jar-machine-transfer_2026-07-06_0100.zip
#   .\scripts\machine-transfer\import.ps1   # picks newest bel-jar-machine-transfer*.zip on Desktop
#
# -Force replaces the existing bel-jar project folder and overwrites Cursor settings.json.

param(
    [string]$Archive,
    [string]$ProjectParent = (Join-Path $env:USERPROFILE 'Documents\Coding'),
    [switch]$SkipCursor,
    [switch]$SkipClaude,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'load-transfer-shared.ps1')

if (-not $Archive) {
    $desktop = [Environment]::GetFolderPath('Desktop')
    $candidates = Get-ChildItem $desktop -Filter 'bel-jar-machine-transfer*.zip' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending
    if (-not $candidates) {
        throw "No archive specified and no bel-jar-machine-transfer*.zip found on Desktop."
    }
    $Archive = $candidates[0].FullName
    Write-Host "Using newest Desktop archive: $Archive"
}

if (-not (Test-Path $Archive)) { throw "Archive not found: $Archive" }
$Archive = (Resolve-Path $Archive).Path

$projectPath = Get-TargetProjectPath $ProjectParent

Write-Host '=== bel-jar machine import ===' -ForegroundColor Cyan
Write-Host "Archive: $Archive"
Write-Host "Target project: $projectPath"
Write-Host ''
Write-ExistingProjectWarning $projectPath -ForceRequested:$Force.IsPresent | Out-Null

$stage = Join-Path $env:TEMP "bel-jar-import-$(Get-Random)"
New-EmptyDir $stage

try {
    tar -xf $Archive -C $stage
    Invoke-TransferImport -StageRoot $stage -ProjectParent $ProjectParent `
        -SkipCursor:$SkipCursor -SkipClaude:$SkipClaude -Force:$Force
}
finally {
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue }
}
