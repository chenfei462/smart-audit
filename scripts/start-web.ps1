param(
    [string]$ConfigPath = "",
    [switch]$Release
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$runtimeEnvModule = Join-Path $PSScriptRoot "lib\runtime-env.psm1"
Import-Module $runtimeEnvModule -Force -DisableNameChecking
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $repoRoot "config\runtime.local.json"
}

if (-not (Test-Path $ConfigPath)) {
    & (Join-Path $PSScriptRoot "init-local.ps1") -ConfigPath $ConfigPath
}

$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$envPath = Import-AuditLensRuntimeEnv -ConfigPath $ConfigPath -PreserveExistingSecrets
$configPortRaw = $config.port
$cargoPath = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
if (-not (Test-Path $cargoPath)) {
    $cargoPath = (Get-Command cargo -ErrorAction Stop).Source
}

function Resolve-WritableTargetDir {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Paths
    )

    foreach ($path in $Paths) {
        if ([string]::IsNullOrWhiteSpace($path)) {
            continue
        }
        try {
            New-Item -ItemType Directory -Force $path | Out-Null
            $probePath = Join-Path $path ".auditlens-write-test"
            Set-Content -Path $probePath -Value "ok" -Encoding ASCII
            Remove-Item -LiteralPath $probePath -Force
            return $path
        } catch {
        }
    }

    throw "No writable cargo target directory available."
}

$targetDir = $config.cargoTargetDir
if ([string]::IsNullOrWhiteSpace($targetDir)) {
    $targetDir = "./target-local"
}
if (-not [System.IO.Path]::IsPathRooted($targetDir)) {
    $targetDir = Join-Path $repoRoot $targetDir
}
$fallbackTargetDirs = @(
    (Join-Path $env:LOCALAPPDATA "AuditLens\target-local"),
    (Join-Path $env:USERPROFILE "Documents\New project\smart-audit-target"),
    (Join-Path $env:TEMP "AuditLens\target-local")
)
$targetDirCandidates = @($targetDir) + $fallbackTargetDirs
$targetDir = Resolve-WritableTargetDir -Paths $targetDirCandidates

$hostValue = if ($config.host) { [string]$config.host } else { "127.0.0.1" }
$portValue = if ($null -ne $configPortRaw -and -not [string]::IsNullOrWhiteSpace([string]$configPortRaw)) { [string]$configPortRaw } else { "8080" }
$runRelease = $Release.IsPresent -or [bool]$config.useReleaseProfile

$env:CARGO_TARGET_DIR = $targetDir
$debugInfo = [pscustomobject]@{
    ConfigPath = $ConfigPath
    EnvPath = $envPath
    Host = $hostValue
    Port = $portValue
    CargoTargetDir = $targetDir
    RunRelease = $runRelease
}
$debugInfo | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $env:TEMP "auditlens-start-web-debug.json")

Push-Location $repoRoot
try {
    $profileDir = if ($runRelease) { "release" } else { "debug" }
    $binaryPath = Join-Path $targetDir "$profileDir\auditlens.exe"

    if (Test-Path $binaryPath) {
        Write-Host "Starting AuditLens at http://$hostValue`:$portValue"
        Write-Host "Using cargo target dir: $targetDir"
        Write-Host "Using existing binary: $binaryPath"
        & $binaryPath web --host $hostValue --port $portValue
    } else {
        $args = @("run")
        if ($runRelease) {
            $args += "--release"
        }
        $args += @("--", "web", "--host", $hostValue, "--port", $portValue)
        Write-Host "Starting AuditLens at http://$hostValue`:$portValue"
        Write-Host "Using cargo target dir: $targetDir"
        Write-Host "No existing binary found. Falling back to cargo run."
        & $cargoPath @args
    }
} finally {
    Pop-Location
}
