param(
    [string]$ConfigPath = "",
    [string]$OutputRoot = "",
    [int]$RetentionDays = 180,
    [switch]$All,
    [switch]$Prune
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

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot "data\archive\audit_log"
}
if (-not [System.IO.Path]::IsPathRooted($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot $OutputRoot
}
New-Item -ItemType Directory -Force $OutputRoot | Out-Null

$cargoPath = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
if (-not (Test-Path $cargoPath)) {
    $cargoPath = (Get-Command cargo -ErrorAction Stop).Source
}

$archiveArgs = @(
    "run",
    "--bin",
    "archive-audit-log",
    "--",
    $dataDir,
    "--output-root",
    $OutputRoot,
    "--retention-days",
    [string]$RetentionDays
)
if ($All) {
    $archiveArgs += "--all"
}
if ($Prune) {
    $archiveArgs += "--prune"
}

Push-Location $repoRoot
try {
    & $cargoPath @archiveArgs
} finally {
    Pop-Location
}
