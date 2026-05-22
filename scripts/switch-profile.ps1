param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("poc", "public")]
    [string]$Profile,
    [string]$ConfigPath = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$runtimeEnvModule = Join-Path $PSScriptRoot "lib\runtime-env.psm1"
Import-Module $runtimeEnvModule -Force -DisableNameChecking
$source = Join-Path $repoRoot "config\runtime.$Profile.json"
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $target = Join-Path $repoRoot "config\runtime.local.json"
} else {
    $target = $ConfigPath
}

if (-not (Test-Path $source)) {
    throw "Runtime profile not found: $source"
}

Copy-Item -LiteralPath $source -Destination $target -Force
$config = Get-Content $target -Raw | ConvertFrom-Json
Clear-AuditLensSecretEnv
$envPath = Ensure-AuditLensSessionSecret -ConfigPath $target -RepoRoot $repoRoot

if ($Profile -eq "poc") {
    if ([string]$config.environmentMode -ne "government_poc" -or -not [bool]$config.secureCookies -or [bool]$config.publicDemoMode -or [bool]$config.allowPublicRegistration) {
        throw "PoC profile validation failed. Required: environmentMode=government_poc, secureCookies=true, publicDemoMode=false, allowPublicRegistration=false"
    }
}

Import-AuditLensRuntimeEnv -ConfigPath $target -PreserveExistingSecrets | Out-Null

Write-Host "Applied AuditLens runtime profile: $Profile"
Write-Host "URL: http://$($config.host):$($config.port)"
Write-Host "environmentMode=$($config.environmentMode) secureCookies=$($config.secureCookies) aiEnabled=$($config.aiEnabled) publicDemoMode=$($config.publicDemoMode) allowPublicRegistration=$($config.allowPublicRegistration)"
Write-Host "Runtime env file: $envPath"
