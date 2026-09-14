#Requires -Version 5.1
<#
.SYNOPSIS
    Load the production env file into the current PowerShell process.
.DESCRIPTION
    dotenv (used by run-migrations / seed scripts) does NOT override variables
    that already exist in the process environment. So scripts that need the
    production DATABASE_URL must have it exported into the shell first. This
    helper does exactly that: it exports every non-comment line of the env file
    before you run npm commands.
.PARAMETER EnvFile
    Path to the env file. Default: C:\WMS\.env.production
.EXAMPLE
    . C:\WMS\scripts\load-env.ps1
    . C:\WMS\scripts\load-env.ps1 -EnvFile D:\prod\.env.production
    # then run, in the same shell:
    cd C:\WMS\WMS_Managment_Backend
    npm run migrate
#>
param([string]$EnvFile = 'C:\WMS\.env.production')

if (-not (Test-Path $EnvFile)) {
    Write-Error "Env file not found: $EnvFile" -ErrorAction Stop
}

Get-Content $EnvFile | Where-Object { $_ -and $_ -notmatch '^\s*#' } | ForEach-Object {
    $parts = $_ -split '=', 2
    if ($parts.Count -eq 2) {
        Remove-Item -Path "env:$($parts[0].Trim())" -ErrorAction SilentlyContinue
        Set-Item -Path "env:$($parts[0].Trim())" -Value $parts[1].Trim()
    }
}

Write-Host "Loaded environment from $EnvFile" -ForegroundColor Green