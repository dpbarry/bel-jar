# Blank-machine import: run from the EXTRACTED transfer folder (same folder as manifest.json).
# Usage:
#   1. Right-click bel-jar-machine-transfer.zip -> Extract All
#   2. cd path\to\extracted\folder
#   3. .\bootstrap-import.ps1
#
# -Force replaces the existing bel-jar project folder and overwrites Cursor settings.json.
# You can also press f at the Ready? prompt instead of re-running with -Force.

param(
    [string]$ProjectParent = (Join-Path $env:USERPROFILE 'Documents\Coding'),
    [switch]$SkipCursor,
    [switch]$SkipClaude,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$shared = Join-Path $PSScriptRoot 'transfer-shared.ps1'
if (-not (Test-Path $shared)) {
    $shared = Join-Path $PSScriptRoot '_lib.ps1'
}
if (-not (Test-Path $shared)) {
    throw 'transfer-shared.ps1 not found next to bootstrap-import.ps1.'
}
. $shared

if (-not (Test-Path (Join-Path $PSScriptRoot 'manifest.json'))) {
    throw @'
This script must run inside the extracted transfer folder (needs manifest.json).

  1. Extract bel-jar-machine-transfer.zip
  2. cd into that folder
  3. .\bootstrap-import.ps1
'@
}

$forceImport = $Force.IsPresent
$projectPath = if (Get-Command Get-TargetProjectPath -ErrorAction SilentlyContinue) {
    Get-TargetProjectPath $ProjectParent
} else {
    Join-Path $ProjectParent 'bel-jar'
}

Write-Host '=== bel-jar bootstrap import ===' -ForegroundColor Cyan
Write-Host "Source folder: $PSScriptRoot"
Write-Host "Target project: $projectPath"
Write-Host ''
if (Get-Command Write-ExistingProjectWarning -ErrorAction SilentlyContinue) {
    Write-ExistingProjectWarning $projectPath -ForceRequested:$forceImport | Out-Null
} elseif (Test-Path $projectPath) {
    Write-Host 'Existing project folder detected:' -ForegroundColor Yellow
    Write-Host "  $projectPath"
    if ($forceImport) {
        Write-Host '  -Force is set: this folder will be replaced during import.' -ForegroundColor Yellow
    } else {
        Write-Host '  Import will replace it. At Ready?, press f to confirm replace, or re-run with -Force.' -ForegroundColor Yellow
    }
    Write-Host ''
}
Write-Host 'Close Cursor before continuing.' -ForegroundColor Yellow
Write-Host '-Force (or f at prompt) replaces the existing bel-jar folder and overwrites Cursor settings.json.'
$ready = Read-Host 'Ready? [Y/n/f]'
if ($ready -match '^[nN]') { exit 0 }
if ($ready -match '^[fF]$') { $forceImport = $true }

Invoke-TransferImport -StageRoot $PSScriptRoot -ProjectParent $ProjectParent `
    -SkipCursor:$SkipCursor -SkipClaude:$SkipClaude -Force:$forceImport
