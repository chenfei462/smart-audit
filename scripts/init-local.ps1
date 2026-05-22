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

$examplePath = Join-Path $repoRoot "config\runtime.example.json"
$dataPath = Join-Path $repoRoot "data"

if (-not (Test-Path $examplePath)) {
    throw "Missing example runtime config: $examplePath"
}

New-Item -ItemType Directory -Force $dataPath | Out-Null

if (-not (Test-Path $ConfigPath)) {
    Copy-Item $examplePath $ConfigPath
    Write-Host "Created local runtime config at $ConfigPath"
} else {
    Write-Host "Local runtime config already exists at $ConfigPath"
}

$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json

$envPath = [System.IO.Path]::ChangeExtension($ConfigPath, ".env")
Clear-AuditLensSecretEnv
$envPath = Ensure-AuditLensSessionSecret -ConfigPath $ConfigPath -RepoRoot $repoRoot
Write-Host "Runtime env file ready at $envPath"

if (-not $config.PSObject.Properties.Name.Contains('secureCookies')) {
    $config | Add-Member -NotePropertyName secureCookies -NotePropertyValue $false -Force
}
if (-not $config.PSObject.Properties.Name.Contains('platformDataDir')) {
    $config | Add-Member -NotePropertyName platformDataDir -NotePropertyValue "./data" -Force
}
if (-not $config.PSObject.Properties.Name.Contains('allowPublicRegistration')) {
    $config | Add-Member -NotePropertyName allowPublicRegistration -NotePropertyValue $false -Force
}
if (-not $config.PSObject.Properties.Name.Contains('aiEnabled')) {
    $config | Add-Member -NotePropertyName aiEnabled -NotePropertyValue $true -Force
}
if (-not $config.PSObject.Properties.Name.Contains('publicDemoMode')) {
    $config | Add-Member -NotePropertyName publicDemoMode -NotePropertyValue $false -Force
}
if (-not $config.PSObject.Properties.Name.Contains('multimodalProvider')) {
    $config | Add-Member -NotePropertyName multimodalProvider -NotePropertyValue "" -Force
}
if (-not $config.PSObject.Properties.Name.Contains('ocrEnabled')) {
    $config | Add-Member -NotePropertyName ocrEnabled -NotePropertyValue $false -Force
}
if (-not $config.PSObject.Properties.Name.Contains('speechEnabled')) {
    $config | Add-Member -NotePropertyName speechEnabled -NotePropertyValue $false -Force
}
if (-not $config.PSObject.Properties.Name.Contains('ocrApiUrl')) {
    $config | Add-Member -NotePropertyName ocrApiUrl -NotePropertyValue "" -Force
}
if (-not $config.PSObject.Properties.Name.Contains('speechApiUrl')) {
    $config | Add-Member -NotePropertyName speechApiUrl -NotePropertyValue "" -Force
}
if (-not $config.PSObject.Properties.Name.Contains('ocrModel')) {
    $config | Add-Member -NotePropertyName ocrModel -NotePropertyValue "" -Force
}
if (-not $config.PSObject.Properties.Name.Contains('speechModel')) {
    $config | Add-Member -NotePropertyName speechModel -NotePropertyValue "" -Force
}
function Test-PortAvailable {
    param([int]$Port)
    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $Port)
        $listener.Start()
        return $true
    } catch {
        return $false
    } finally {
        if ($null -ne $listener) {
            $listener.Stop()
        }
    }
}

function Select-AvailablePort {
    param([int[]]$Candidates, [string]$Name)
    foreach ($candidate in $Candidates) {
        if (Test-PortAvailable -Port $candidate) {
            return $candidate
        }
    }
    $joined = ($Candidates -join ", ")
    throw "No available $Name port. Tried: $joined. Check excluded ranges with: netsh interface ipv4 show excludedportrange protocol=tcp"
}

if (-not $config.PSObject.Properties.Name.Contains('host')) {
    $config | Add-Member -NotePropertyName host -NotePropertyValue "127.0.0.1" -Force
}
if (-not $config.PSObject.Properties.Name.Contains('healthPath')) {
    $config | Add-Member -NotePropertyName healthPath -NotePropertyValue "/api/health" -Force
}
if (-not $config.PSObject.Properties.Name.Contains('cargoTargetDir')) {
    $config | Add-Member -NotePropertyName cargoTargetDir -NotePropertyValue "./target-local" -Force
}
if (-not $config.PSObject.Properties.Name.Contains('useReleaseProfile')) {
    $config | Add-Member -NotePropertyName useReleaseProfile -NotePropertyValue $false -Force
}

$selectedWebPort = Select-AvailablePort -Candidates @(8081, 18080, 28080) -Name "web"
$config | Add-Member -NotePropertyName port -NotePropertyValue $selectedWebPort -Force

$selectedMultimodalPort = Select-AvailablePort -Candidates @(8090, 18090, 28090) -Name "multimodal"
if ([string]$config.multimodalProvider -eq "local" -or [bool]$config.ocrEnabled -or [bool]$config.speechEnabled) {
    $config | Add-Member -NotePropertyName ocrApiUrl -NotePropertyValue "http://127.0.0.1:$selectedMultimodalPort/ocr" -Force
    $config | Add-Member -NotePropertyName speechApiUrl -NotePropertyValue "http://127.0.0.1:$selectedMultimodalPort/speech" -Force
}

$config | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $ConfigPath

$cargoPath = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
if (Test-Path $cargoPath) {
    Write-Host "Detected cargo at $cargoPath"
} else {
    Write-Warning "Cargo was not found at $cargoPath. Make sure Rust is installed and cargo is available in PATH."
}

Write-Host "Initialization complete."
Write-Host "AuditLens web URL: http://$($config.host):$($config.port)"
Write-Host "Multimodal bridge port: $selectedMultimodalPort"
Write-Host "Runtime env file: $envPath"
