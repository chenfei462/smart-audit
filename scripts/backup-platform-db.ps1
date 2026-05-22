param(
    [string]$ConfigPath = "",
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $repoRoot "config\runtime.local.json"
}
if (-not (Test-Path $ConfigPath)) {
    throw "Runtime config not found: $ConfigPath"
}

$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$dataDir = [string]$config.platformDataDir
if ([string]::IsNullOrWhiteSpace($dataDir)) {
    $dataDir = Join-Path $repoRoot "data"
}
if (-not [System.IO.Path]::IsPathRooted($dataDir)) {
    $dataDir = Join-Path $repoRoot $dataDir
}

function Resolve-PlatformDbPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BaseDir
    )

    $candidates = @(
        (Join-Path $BaseDir "platform.db"),
        (Join-Path $BaseDir "data\platform.db")
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return (Resolve-Path $candidate)
        }
    }
    throw "Platform database not found. Checked: $($candidates -join ', ')"
}
$dbPath = Resolve-PlatformDbPath -BaseDir $dataDir

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $repoRoot "data\backup"
}
if (-not [System.IO.Path]::IsPathRooted($OutputDir)) {
    $OutputDir = Join-Path $repoRoot $OutputDir
}
New-Item -ItemType Directory -Force $OutputDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $OutputDir "platform-$stamp.db"
$sqlite = Get-Command sqlite3 -ErrorAction SilentlyContinue
if ($sqlite) {
    & $sqlite.Source $dbPath "VACUUM INTO '$backupPath';"
} else {
    Copy-Item -LiteralPath $dbPath -Destination $backupPath -Force
    Write-Warning "sqlite3 not found; copied database without VACUUM INTO."
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupPath).Hash.ToLowerInvariant()
$hashPath = "$backupPath.sha256"
Set-Content -Path $hashPath -Encoding ASCII -Value "$hash  $(Split-Path -Leaf $backupPath)"
Write-Host "Backup: $backupPath"
Write-Host "SHA256: $hash"
