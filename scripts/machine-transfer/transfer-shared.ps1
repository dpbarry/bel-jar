# Shared import/export logic for bel-jar machine transfer archives.
# Dot-sourced by export.ps1, import.ps1, and bootstrap-import.ps1 — not meant to run directly.

$script:TransferFormat = 'bel-jar-machine-transfer'
$script:TransferVersion = 1
$script:ProjectFolderName = 'bel-jar'
$script:CursorProjectSlug = 'c-Users-Dean-Documents-Coding-bel-jar'
$script:ClaudeProjectSlug = 'c--Users-Dean-Documents-Coding-bel-jar'
$script:CursorWorkspaceHash = '16b1c8069216f6f59661a12766ab475a'

function Get-TransferPaths {
    $user = $env:USERPROFILE
    [ordered]@{
        Project           = Join-Path $user "Documents\Coding\$script:ProjectFolderName"
        CursorProject     = Join-Path $user ".cursor\projects\$script:CursorProjectSlug"
        CursorSkills      = Join-Path $user '.cursor\skills-cursor'
        CursorWorkspace   = Join-Path $env:APPDATA "Cursor\User\workspaceStorage\$script:CursorWorkspaceHash"
        CursorSettings    = Join-Path $env:APPDATA 'Cursor\User\settings.json'
        ClaudeProject     = Join-Path $user ".claude\projects\$script:ClaudeProjectSlug"
        ClaudePlans       = Join-Path $user '.claude\plans'
        ClaudeSettings    = Join-Path $user '.claude\settings.json'
        ClaudeCredentials = Join-Path $user '.claude\.credentials.json'
        ClaudeFileHistory = Join-Path $user '.claude\file-history'
    }
}

function Get-TargetProjectPath([string]$ProjectParent) {
    Join-Path $ProjectParent $script:ProjectFolderName
}

function Write-ExistingProjectWarning([string]$ProjectPath, [switch]$ForceRequested) {
    if (-not (Test-Path $ProjectPath)) { return $false }

    Write-Host 'Existing project folder detected:' -ForegroundColor Yellow
    Write-Host "  $ProjectPath"
    if ($ForceRequested) {
        Write-Host '  -Force is set: this folder will be replaced during import.' -ForegroundColor Yellow
    } else {
        Write-Host '  Import will replace it. At Ready?, press f to confirm replace, or re-run with -Force.' -ForegroundColor Yellow
    }
    Write-Host ''
    return $true
}

function New-EmptyDir([string]$Path) {
    if (Test-Path $Path) { Remove-Item $Path -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Copy-Tree([string]$Source, [string]$Dest) {
    if (-not (Test-Path $Source)) { return }
    $parent = Split-Path $Dest -Parent
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    Copy-Item -Path $Source -Destination $Dest -Recurse -Force
}

function Merge-Tree([string]$Source, [string]$Dest) {
    if (-not (Test-Path $Source)) { return }
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    Copy-Item -Path (Join-Path $Source '*') -Destination $Dest -Recurse -Force
}

function Get-ClaudeSessionIds([string]$ClaudeProjectPath) {
    if (-not (Test-Path $ClaudeProjectPath)) { return @() }
    $ids = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    Get-ChildItem $ClaudeProjectPath -File -Filter '*.jsonl' | ForEach-Object { [void]$ids.Add($_.BaseName) }
    Get-ChildItem $ClaudeProjectPath -Directory |
        Where-Object { $_.Name -match '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' } |
        ForEach-Object { [void]$ids.Add($_.Name) }
    @($ids)
}

function Build-ProjectComponent([string]$StageRoot, $Paths) {
    $out = Join-Path $StageRoot 'components\01-project.zip'
    New-Item -ItemType Directory -Force -Path (Split-Path $out -Parent) | Out-Null
    if (-not (Test-Path $Paths.Project)) { throw "Project not found: $($Paths.Project)" }
    Push-Location (Split-Path $Paths.Project -Parent)
    try { tar -a -cf $out $script:ProjectFolderName }
    finally { Pop-Location }
    return 'components/01-project.zip'
}

function Build-CursorComponent([string]$StageRoot, $Paths) {
    $scratch = Join-Path $StageRoot '_cursor-scratch'
    New-EmptyDir $scratch
    Copy-Tree $Paths.CursorProject (Join-Path $scratch "cursor\projects\$script:CursorProjectSlug")
    Copy-Tree $Paths.CursorSkills (Join-Path $scratch 'cursor\skills-cursor')
    Copy-Tree $Paths.CursorWorkspace (Join-Path $scratch "AppData\Roaming\Cursor\User\workspaceStorage\$script:CursorWorkspaceHash")
    if (Test-Path $Paths.CursorSettings) {
        $d = Join-Path $scratch 'AppData\Roaming\Cursor\User'
        New-Item -ItemType Directory -Force -Path $d | Out-Null
        Copy-Item $Paths.CursorSettings (Join-Path $d 'settings.json') -Force
    }
    $out = Join-Path $StageRoot 'components\02-cursor.zip'
    Push-Location $scratch
    try { tar -a -cf $out * }
    finally { Pop-Location }
    Remove-Item $scratch -Recurse -Force
    return 'components/02-cursor.zip'
}

function Build-ClaudeComponent([string]$StageRoot, $Paths) {
    $scratch = Join-Path $StageRoot '_claude-scratch'
    New-EmptyDir $scratch
    Copy-Tree $Paths.ClaudeProject (Join-Path $scratch ".claude\projects\$script:ClaudeProjectSlug")
    Copy-Tree $Paths.ClaudePlans (Join-Path $scratch '.claude\plans')
    if (Test-Path $Paths.ClaudeSettings) {
        $d = Join-Path $scratch '.claude'
        New-Item -ItemType Directory -Force -Path $d | Out-Null
        Copy-Item $Paths.ClaudeSettings (Join-Path $d 'settings.json') -Force
    }
    if (Test-Path $Paths.ClaudeCredentials) {
        $d = Join-Path $scratch '.claude'
        New-Item -ItemType Directory -Force -Path $d | Out-Null
        Copy-Item $Paths.ClaudeCredentials (Join-Path $d '.credentials.json') -Force
    }
    foreach ($id in (Get-ClaudeSessionIds $Paths.ClaudeProject)) {
        $src = Join-Path $Paths.ClaudeFileHistory $id
        Copy-Tree $src (Join-Path $scratch ".claude\file-history\$id")
    }
    $out = Join-Path $StageRoot 'components\03-claude.zip'
    Push-Location $scratch
    try { tar -a -cf $out * }
    finally { Pop-Location }
    Remove-Item $scratch -Recurse -Force
    return 'components/03-claude.zip'
}

function Restore-ProjectComponent([string]$ZipPath, [string]$ProjectParent) {
    $scratch = Join-Path $env:TEMP "bel-jar-import-project-$(Get-Random)"
    New-EmptyDir $scratch
    try {
        tar -xf $ZipPath -C $scratch
        $extracted = Join-Path $scratch $script:ProjectFolderName
        if (-not (Test-Path $extracted)) { throw "Project component missing $script:ProjectFolderName/ root." }
        New-Item -ItemType Directory -Force -Path $ProjectParent | Out-Null
        $dest = Join-Path $ProjectParent $script:ProjectFolderName
        if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
        Move-Item $extracted $dest
        return $dest
    }
    finally {
        if (Test-Path $scratch) { Remove-Item $scratch -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

function Restore-CursorComponent([string]$ZipPath, [switch]$Force) {
    $scratch = Join-Path $env:TEMP "bel-jar-import-cursor-$(Get-Random)"
    New-EmptyDir $scratch
    try {
        tar -xf $ZipPath -C $scratch
        Merge-Tree (Join-Path $scratch "cursor\projects\$script:CursorProjectSlug") `
            (Join-Path $env:USERPROFILE ".cursor\projects\$script:CursorProjectSlug")
        Merge-Tree (Join-Path $scratch 'cursor\skills-cursor') `
            (Join-Path $env:USERPROFILE '.cursor\skills-cursor')
        Merge-Tree (Join-Path $scratch "AppData\Roaming\Cursor\User\workspaceStorage\$script:CursorWorkspaceHash") `
            (Join-Path $env:APPDATA "Cursor\User\workspaceStorage\$script:CursorWorkspaceHash")
        $settingsSrc = Join-Path $scratch 'AppData\Roaming\Cursor\User\settings.json'
        if (Test-Path $settingsSrc) {
            $settingsDest = Join-Path $env:APPDATA 'Cursor\User\settings.json'
            if ((Test-Path $settingsDest) -and -not $Force) {
                Copy-Item $settingsSrc "$settingsDest.bel-jar-import.json" -Force
            } else {
                Copy-Item $settingsSrc $settingsDest -Force
            }
        }
    }
    finally {
        if (Test-Path $scratch) { Remove-Item $scratch -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

function Restore-ClaudeComponent([string]$ZipPath) {
    $scratch = Join-Path $env:TEMP "bel-jar-import-claude-$(Get-Random)"
    New-EmptyDir $scratch
    try {
        tar -xf $ZipPath -C $scratch
        Merge-Tree (Join-Path $scratch ".claude\projects\$script:ClaudeProjectSlug") `
            (Join-Path $env:USERPROFILE ".claude\projects\$script:ClaudeProjectSlug")
        Merge-Tree (Join-Path $scratch '.claude\plans') `
            (Join-Path $env:USERPROFILE '.claude\plans')
        Merge-Tree (Join-Path $scratch '.claude\file-history') `
            (Join-Path $env:USERPROFILE '.claude\file-history')
        foreach ($f in @('settings.json', '.credentials.json')) {
            $src = Join-Path $scratch ".claude\$f"
            if (Test-Path $src) {
                $destDir = Join-Path $env:USERPROFILE '.claude'
                New-Item -ItemType Directory -Force -Path $destDir | Out-Null
                Copy-Item $src (Join-Path $destDir $f) -Force
            }
        }
    }
    finally {
        if (Test-Path $scratch) { Remove-Item $scratch -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

function Read-TransferManifest([string]$StageRoot) {
    $manifestPath = Join-Path $StageRoot 'manifest.json'
    if (-not (Test-Path $manifestPath)) { throw 'manifest.json not found in archive.' }
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.format -ne $script:TransferFormat) {
        throw "Unsupported transfer format: $($manifest.format)"
    }
    if ([int]$manifest.version -gt $script:TransferVersion) {
        throw "Transfer version $($manifest.version) is newer than this import script (v$script:TransferVersion)."
    }
    return $manifest
}

function Write-ImportNotes([string]$ProjectPath) {
    Write-Host ''
    Write-Host 'Next steps:' -ForegroundColor Cyan
    Write-Host "  1. Quit Cursor, then open: $ProjectPath"
    Write-Host '  2. Sign into the same Cursor account for cloud User Rules.'
    Write-Host '  3. Re-auth Claude Code if credentials did not carry over.'
    Write-Host "  4. Optional: cd `"$ProjectPath`"; npm install"
}

function Invoke-TransferImport {
    param(
        [Parameter(Mandatory)]
        [string]$StageRoot,
        [string]$ProjectParent = (Join-Path $env:USERPROFILE 'Documents\Coding'),
        [switch]$SkipCursor,
        [switch]$SkipClaude,
        [switch]$Force
    )

    $manifest = Read-TransferManifest $StageRoot
    Write-Host ("Transfer from {0}@{1} exported {2}" -f $manifest.source.user, $manifest.source.computer, $manifest.exportedAt)

    $projectPath = Get-TargetProjectPath $ProjectParent
    if ((Test-Path $projectPath) -and -not $Force) {
        Write-Host "Project already exists at $projectPath." -ForegroundColor Yellow
        Write-Host 'Re-run with -Force, or press f at the bootstrap Ready? prompt.' -ForegroundColor Yellow
        $answer = Read-Host 'Replace existing folder anyway? [y/N]'
        if ($answer -notmatch '^[yY]') { exit 1 }
    }

    foreach ($component in $manifest.components) {
        $zipPath = Join-Path $StageRoot ($component.file -replace '/', '\')
        if (-not (Test-Path $zipPath)) { throw "Component file missing: $($component.file)" }

        switch ($component.id) {
            'project' {
                Write-Host 'Restoring project...'
                $projectPath = Restore-ProjectComponent $zipPath $ProjectParent
            }
            'cursor' {
                if ($SkipCursor) { Write-Host 'Skipping cursor (flag).' }
                else {
                    Write-Host 'Restoring Cursor context...'
                    Restore-CursorComponent $zipPath -Force:$Force
                }
            }
            'claude' {
                if ($SkipClaude) { Write-Host 'Skipping claude (flag).' }
                else {
                    Write-Host 'Restoring Claude context...'
                    Restore-ClaudeComponent $zipPath
                }
            }
            default { Write-Warning "Unknown component id '$($component.id)' - skipped." }
        }
    }

    Write-Host ''
    Write-Host 'Import complete.' -ForegroundColor Green
    Write-ImportNotes $projectPath
    return $projectPath
}
