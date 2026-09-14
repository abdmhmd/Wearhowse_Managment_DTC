#Requires -Version 5.1
<#
.SYNOPSIS
    Check the WMS backend health endpoint and exit with a status code.
.PARAMETER Uri
    Health endpoint URL. Default: http://localhost:5000/api/health
.PARAMETER TimeoutSeconds
    Seconds to wait for a response. Default: 10
.EXAMPLE
    .\health-check.ps1
    .\health-check.ps1 -Uri "https://wms.internal/api/health"
    .\health-check.ps1; if ($LASTEXITCODE -eq 0) { "healthy" }
#>
param(
    [string]$Uri           = 'http://localhost:5000/api/health',
    [int]$TimeoutSeconds   = 10
)

$ErrorActionPreference = 'Stop'

function Write-Color { param([string]$msg, [ConsoleColor]$c = 'White'); Write-Host $msg -ForegroundColor $c }

Write-Color "Checking $Uri ..." 'Cyan'

try {
    $res = Invoke-RestMethod -Uri $Uri -TimeoutSec $TimeoutSeconds -ErrorAction Stop
} catch {
    Write-Color "FAIL: could not reach $Uri" 'Red'
    Write-Color "       $($_.Exception.Message)" 'DarkGray'
    exit 1
}

if ($res.success -and $res.data.status -eq 'ok') {
    Write-Color "OK: status=$($res.data.status)" 'Green'
    Write-Color "    version  = $($res.data.version)" 'DarkGray'
    Write-Color "    db       = $($res.data.db)" 'DarkGray'
    Write-Color "    uptime   = $($res.data.uptime) seconds" 'DarkGray'
    Write-Color "    timestamp= $($res.data.timestamp)" 'DarkGray'
    exit 0
}

Write-Color "FAIL: unexpected response from $Uri" 'Red'
Write-Color ($res | ConvertTo-Json -Depth 4) 'DarkGray'
exit 1