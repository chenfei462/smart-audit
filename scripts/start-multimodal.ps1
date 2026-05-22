param(
    [int]$Port = 8090
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$pythonExe = Join-Path $env:LOCALAPPDATA "Programs\Python\Python314\python.exe"

if (-not (Test-Path $pythonExe)) {
    $pythonExe = (Get-Command py -ErrorAction Stop).Source
}

Push-Location $repoRoot
try {
    & $pythonExe -m uvicorn multimodal_bridge:app --host 127.0.0.1 --port $Port --app-dir (Join-Path $repoRoot "scripts")
} finally {
    Pop-Location
}
