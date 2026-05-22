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
    throw "Runtime config not found: $ConfigPath"
}

$envPath = [System.IO.Path]::ChangeExtension($ConfigPath, ".env")
$envPath = Ensure-AuditLensSessionSecret -ConfigPath $ConfigPath -RepoRoot $repoRoot
if (-not (Test-Path $envPath)) {
    throw "Failed to create runtime env file: $envPath"
}
$bytes = New-Object byte[] 64
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = [Convert]::ToBase64String($bytes)
Set-AuditLensEnvFileValue -ConfigPath $ConfigPath -Name 'AUDITLENS_SESSION_SECRET' -Value $secret | Out-Null
Write-Host "Rotated AUDITLENS_SESSION_SECRET in $envPath"
Write-Host "Restart AuditLens for the new secret to take effect."
