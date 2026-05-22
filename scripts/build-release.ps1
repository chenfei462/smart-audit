param(
    [string]$ConfigPath = ""
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

$env:CARGO_TARGET_DIR = $targetDir

Push-Location $repoRoot
try {
    & $cargoPath build --release
} finally {
    Pop-Location
}
