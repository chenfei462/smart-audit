function Set-AuditLensEnvValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        Remove-Item "Env:$Name" -ErrorAction SilentlyContinue
        return
    }

    Set-Item -Path "Env:$Name" -Value $Value
}

function Clear-AuditLensSecretEnv {
    foreach ($name in @(
        'AUDITLENS_SESSION_SECRET',
        'AUDITLENS_AI_API_KEY',
        'AUDITLENS_OCR_API_KEY',
        'AUDITLENS_SPEECH_API_KEY'
    )) {
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }

    foreach ($item in Get-ChildItem Env: | Where-Object { $_.Name -like 'AUDITLENS_CONNECTOR_SECRET_*' }) {
        Remove-Item "Env:$($item.Name)" -ErrorAction SilentlyContinue
    }
}

function Set-AuditLensEnvFileValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ConfigPath,
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    $envPath = [System.IO.Path]::ChangeExtension($ConfigPath, ".env")
    $lines = @()
    if (Test-Path $envPath) {
        $lines = Get-Content $envPath
    }

    $updated = $false
    $pattern = "^{0}=" -f [regex]::Escape($Name)
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match $pattern) {
            $lines[$i] = "$Name=$Value"
            $updated = $true
            break
        }
    }

    if (-not $updated) {
        $lines += "$Name=$Value"
    }

    $lines | Set-Content -Encoding UTF8 $envPath
    Set-AuditLensEnvValue -Name $Name -Value $Value
    return $envPath
}

function Ensure-AuditLensSessionSecret {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ConfigPath,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    $envPath = [System.IO.Path]::ChangeExtension($ConfigPath, ".env")
    if (-not (Test-Path $envPath)) {
        $examplePath = Join-Path $RepoRoot "config\runtime.local.env.example"
        if (Test-Path $examplePath) {
            Copy-Item -LiteralPath $examplePath -Destination $envPath -Force
        }
    }

    $lines = @()
    if (Test-Path $envPath) {
        $lines = Get-Content $envPath
    }

    $secret = $null
    $pattern = '^AUDITLENS_SESSION_SECRET=(.*)$'
    foreach ($line in $lines) {
        if ($line -match $pattern) {
            $candidate = $Matches[1].Trim()
            if (-not [string]::IsNullOrWhiteSpace($candidate) -and $candidate -ne 'REPLACE_WITH_BASE64_64_BYTE_SECRET') {
                $secret = $candidate
            }
            break
        }
    }

    if ([string]::IsNullOrWhiteSpace($secret)) {
        $bytes = New-Object byte[] 64
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        $secret = [Convert]::ToBase64String($bytes)
    }

    Set-AuditLensEnvFileValue -ConfigPath $ConfigPath -Name 'AUDITLENS_SESSION_SECRET' -Value $secret | Out-Null
    return $envPath
}

function Import-AuditLensRuntimeEnv {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ConfigPath,
        [switch]$PreserveExistingSecrets
    )

    $envPath = [System.IO.Path]::ChangeExtension($ConfigPath, ".env")
    if (-not $PreserveExistingSecrets) {
        Clear-AuditLensSecretEnv
    }
    if (-not (Test-Path $envPath)) {
        return $envPath
    }

    $lines = Get-Content $envPath
    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
            continue
        }

        $separator = $trimmed.IndexOf("=")
        if ($separator -lt 1) {
            continue
        }

        $name = $trimmed.Substring(0, $separator).Trim()
        $value = $trimmed.Substring($separator + 1)
        if ($name -eq "AUDITLENS_SESSION_SECRET" -or $name -like "AUDITLENS_*_API_KEY" -or $name -like "AUDITLENS_CONNECTOR_SECRET_*") {
            Set-AuditLensEnvValue -Name $name -Value $value.Trim()
        }
    }

    return $envPath
}

Export-ModuleMember -Function Clear-AuditLensSecretEnv, Ensure-AuditLensSessionSecret, Import-AuditLensRuntimeEnv, Set-AuditLensEnvValue, Set-AuditLensEnvFileValue
