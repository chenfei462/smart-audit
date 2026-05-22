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

function Test-HealthEndpoint {
    param(
        [Parameter(Mandatory = $true)]
        [string]$HealthUrl
    )

    try {
        $response = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 3
        if ($response.status -eq "ok") {
            return $true
        }
    } catch {
    }
    return $false
}

function Get-MultimodalPort {
    param(
        [Parameter(Mandatory = $true)]
        [string]$EndpointUrl
    )

    try {
        return ([System.Uri]$EndpointUrl).Port
    } catch {
        throw "Invalid multimodal endpoint URL: $EndpointUrl"
    }
}

$shouldStartMultimodal = [string]$config.multimodalProvider -eq "local" -and (
    [bool]$config.ocrEnabled -or [bool]$config.speechEnabled
)

if ($shouldStartMultimodal) {
    $multimodalBaseUrl = if (-not [string]::IsNullOrWhiteSpace([string]$config.ocrApiUrl)) {
        $config.ocrApiUrl
    } else {
        $config.speechApiUrl
    }

    $multimodalUri = [System.Uri]$multimodalBaseUrl
    $healthUrl = "{0}://{1}:{2}/health" -f $multimodalUri.Scheme, $multimodalUri.Host, $multimodalUri.Port
    $multimodalPort = Get-MultimodalPort -EndpointUrl $multimodalBaseUrl

    if (-not (Test-HealthEndpoint -HealthUrl $healthUrl)) {
        Write-Host "Starting local multimodal bridge at $healthUrl"
        Start-Process `
            -FilePath "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" `
            -ArgumentList @(
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                (Join-Path $PSScriptRoot "start-multimodal.ps1"),
                "-Port",
                $multimodalPort
            ) `
            -WindowStyle Hidden | Out-Null

        $started = $false
        foreach ($attempt in 1..20) {
            Start-Sleep -Milliseconds 500
            if (Test-HealthEndpoint -HealthUrl $healthUrl) {
                $started = $true
                break
            }
        }

        if (-not $started) {
            throw "Local multimodal bridge did not become healthy at $healthUrl"
        }
    } else {
        Write-Host "Local multimodal bridge already healthy at $healthUrl"
    }
}

$targetDir = $config.cargoTargetDir
if ([string]::IsNullOrWhiteSpace([string]$targetDir)) {
    $targetDir = "./target-local"
}
if (-not [System.IO.Path]::IsPathRooted($targetDir)) {
    $targetDir = Join-Path $repoRoot $targetDir
}
$targetDirCandidates = @(
    $targetDir,
    (Join-Path $env:LOCALAPPDATA "AuditLens\target-local"),
    (Join-Path $env:USERPROFILE "Documents\New project\smart-audit-target"),
    (Join-Path $env:TEMP "AuditLens\target-local")
)
$targetDir = Resolve-WritableTargetDir -Paths $targetDirCandidates
$env:CARGO_TARGET_DIR = $targetDir

$hostValue = if ($config.host) { [string]$config.host } else { "127.0.0.1" }
$portValue = if ($null -ne $config.port -and -not [string]::IsNullOrWhiteSpace([string]$config.port)) {
    [string]$config.port
} else {
    "8080"
}
$runRelease = $Release.IsPresent -or [bool]$config.useReleaseProfile
$profileDir = if ($runRelease) { "release" } else { "debug" }
$binaryPath = Join-Path $targetDir "$profileDir\auditlens.exe"

Push-Location $repoRoot
try {
    $cargoArgs = @("build")
    if ($runRelease) {
        $cargoArgs += "--release"
    }
    & $cargoPath @cargoArgs
} finally {
    Pop-Location
}

if (-not (Test-Path $binaryPath)) {
    throw "AuditLens binary not found at $binaryPath"
}

Write-Host "Starting AuditLens at http://$hostValue`:$portValue"
Write-Host "Using cargo target dir: $targetDir"
Write-Host "Using binary: $binaryPath"

Push-Location $repoRoot
try {
    & $binaryPath web --host $hostValue --port $portValue
} finally {
    Pop-Location
}
