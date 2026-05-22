param(
    [string]$ConfigPath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $repoRoot "config\runtime.local.json"
}

if (-not (Test-Path $ConfigPath)) {
    throw "Runtime config not found. Run scripts/init-local.ps1 first."
}

$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$hostValue = if ($config.host) { [string]$config.host } else { "127.0.0.1" }
$portValue = if ($config.port) { [string]$config.port } else { "8080" }
$healthPath = if ($config.healthPath) { [string]$config.healthPath } else { "/api/health" }
$uri = "http://$hostValue`:$portValue$healthPath"

$response = Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec 10
$response | ConvertTo-Json -Depth 5
