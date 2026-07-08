# Export bel-jar + Cursor + Claude context as one manifest-driven archive.
# Usage:
#   .\scripts\machine-transfer\export.ps1
#   .\scripts\machine-transfer\export.ps1 -OutputPath ~\Desktop\bel-jar-machine-transfer.zip

param(
    [string]$OutputPath,
    [switch]$SkipCursor,
    [switch]$SkipClaude
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'load-transfer-shared.ps1')

$Paths = Get-TransferPaths
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
if (-not $OutputPath) {
    $OutputPath = Join-Path ([Environment]::GetFolderPath('Desktop')) "bel-jar-machine-transfer_$stamp.zip"
}

$stage = Join-Path $env:TEMP "bel-jar-export-$stamp"
New-EmptyDir $stage

try {
    Write-Host "=== bel-jar machine export ===" -ForegroundColor Cyan
    Write-Host "Project: $($Paths.Project)"

    $components = @(
        @{
            id = 'project'
            file = Build-ProjectComponent $stage $Paths
            description = 'Full repo including gitignored files'
        }
    )

    if (-not $SkipCursor) {
        $components += @{
            id = 'cursor'
            file = Build-CursorComponent $stage $Paths
            description = 'Cursor project context, skills, workspace storage'
        }
    }

    if (-not $SkipClaude) {
        $components += @{
            id = 'claude'
            file = Build-ClaudeComponent $stage $Paths
            description = 'Claude Code bel-jar sessions, memory, plans'
        }
    }

    $manifest = [ordered]@{
        format = $TransferFormat
        version = $TransferVersion
        exportedAt = (Get-Date).ToString('o')
        source = [ordered]@{
            user = $env:USERNAME
            computer = $env:COMPUTERNAME
            projectPath = $Paths.Project
        }
        components = $components
        notes = @(
            'Blank machine: extract this zip, then run bootstrap-import.ps1.'
            'Existing project: scripts/machine-transfer/import.ps1 -Archive <this-zip>.'
            'Cursor global User Rules may require the same Cursor account login.'
            'Claude credentials may need re-auth on a new machine.'
        )
    }

    ($manifest | ConvertTo-Json -Depth 6) | Set-Content (Join-Path $stage 'manifest.json') -Encoding UTF8

    Copy-Item (Join-Path $PSScriptRoot 'bootstrap-import.ps1') (Join-Path $stage 'bootstrap-import.ps1') -Force
    Copy-Item (Join-Path $PSScriptRoot 'transfer-shared.ps1') (Join-Path $stage 'transfer-shared.ps1') -Force
    @'
bel-jar machine transfer — restore on a new PC
==============================================

1. Extract this entire folder from bel-jar-machine-transfer.zip
2. Close Cursor (and Claude Code if open)
3. Open PowerShell in this folder and run:

     .\bootstrap-import.ps1

4. Open Documents\Coding\bel-jar in Cursor

If bel-jar already exists, bootstrap warns immediately. At Ready?, press f to
replace it (same as -Force). -Force also overwrites Cursor settings.json.

Optional flags: -Force  -SkipCursor  -SkipClaude  -ProjectParent D:\dev
'@ | Set-Content (Join-Path $stage 'RESTORE.txt') -Encoding UTF8

    if (Test-Path $OutputPath) { Remove-Item $OutputPath -Force }
    Push-Location $stage
    try { tar -a -cf $OutputPath * }
    finally { Pop-Location }

    $mb = [math]::Round((Get-Item $OutputPath).Length / 1MB, 1)
    Write-Host ''
    Write-Host "Archive: $OutputPath ($mb MB)" -ForegroundColor Green
    foreach ($c in $components) {
        Write-Host ("  - {0}: {1}" -f $c.id, $c.description)
    }
}
finally {
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue }
}
