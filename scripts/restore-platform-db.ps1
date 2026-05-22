param(
    [Parameter(Mandatory = $true)]
    [string]$BackupPath,
    [Parameter(Mandatory = $true)]
    [string]$TargetDir
)

$ErrorActionPreference = "Stop"
$backup = Resolve-Path $BackupPath
if (-not (Test-Path $backup)) {
    throw "Backup file not found: $BackupPath"
}
if ((Split-Path -Leaf $backup) -notmatch '\.db$') {
    throw "Backup must be a .db file: $backup"
}

if (-not [System.IO.Path]::IsPathRooted($TargetDir)) {
    $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
    $TargetDir = Join-Path $repoRoot $TargetDir
}
New-Item -ItemType Directory -Force $TargetDir | Out-Null
$resolvedTarget = Resolve-Path $TargetDir
$dataTarget = Join-Path $resolvedTarget "data"
New-Item -ItemType Directory -Force $dataTarget | Out-Null
$targetPath = Join-Path $dataTarget "platform.db"

Copy-Item -LiteralPath $backup -Destination $targetPath -Force
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $targetPath).Hash.ToLowerInvariant()
Write-Host "Restored: $targetPath"
Write-Host "SHA256: $hash"
Write-Host "Use this directory as platformDataDir for restore drills: $resolvedTarget"
