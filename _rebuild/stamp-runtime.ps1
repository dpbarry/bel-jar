# Stamp a Beluga runtime build into the two files that name it:
#   sw.js              CACHE_NAME       evicts the previous build's cache
#   beluga-client.js   RUNTIME_VERSION  becomes the runtime URL's ?v=
#
# Called by rebuild.ps1 right after the blobs are copied. Safe to run on its own
# to re-stamp, e.g.  .\stamp-runtime.ps1 -Version 20260922151200
#
# All-or-nothing: each pattern must match exactly once and each file must carry
# the new stamp afterwards, or nothing is written. A silent no-op replace is how
# a stamp drifts: the build changes, the URL does not, and caches keep the old
# bytes. tests/test-runtime-url.mjs fails if the two stamps ever disagree.
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d{14}$')]
    [string]$Version,

    [string]$Root = (Join-Path $PSScriptRoot '..')
)

$targets = @(
    @{ Path    = Join-Path $Root 'sw.js'
       Pattern = "var CACHE_NAME = 'beluga-runtime-[^']*'"
       Value   = "var CACHE_NAME = 'beluga-runtime-$Version'" },
    @{ Path    = Join-Path $Root 'js\beluga\beluga-client.js'
       Pattern = "var RUNTIME_VERSION = '[^']*'"
       Value   = "var RUNTIME_VERSION = '$Version'" }
)

$staged = @()
foreach ($t in $targets) {
    if (-not (Test-Path $t.Path)) { throw "stamp-runtime: missing $($t.Path)" }
    $text = [System.IO.File]::ReadAllText($t.Path)
    $hits = [regex]::Matches($text, $t.Pattern).Count
    if ($hits -ne 1) {
        throw "stamp-runtime: expected exactly one match of [$($t.Pattern)] in $($t.Path), found $hits. Nothing written."
    }
    $next = [regex]::Replace($text, $t.Pattern, $t.Value)
    if (-not $next.Contains($t.Value)) {
        throw "stamp-runtime: $($t.Path) does not carry $Version after replacement. Nothing written."
    }
    $staged += @{ Path = $t.Path; Text = $next }
}

foreach ($s in $staged) {
    [System.IO.File]::WriteAllText($s.Path, $s.Text)
}
Write-Host "Runtime stamped $Version (sw.js CACHE_NAME, beluga-client.js RUNTIME_VERSION)"
