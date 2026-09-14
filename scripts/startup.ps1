#Requires -Version 5.1
<#
.SYNOPSIS
    Start the WMS backend (and optionally the IIS frontend site) at boot.
.DESCRIPTION
    Loads C:\WMS\.env.production into the process environment, ensures the
    backend process is running (PM2 preferred, `npm start` fallback) and logs
    everything to C:\WMS\logs\startup.log. When IIS and a site named after
    -WebSiteName exist, the site is started as well.
.PARAMETER ProjectRoot
    Repository root on the server. Default: C:\WMS
.PARAMETER EnvFile
    Production env file. Default: C:\WMS\.env.production
.PARAMETER WebSiteName
    IIS site name for the frontend. Default: WMS
.PARAMETER LogPath
    Startup log file. Default: C:\WMS\logs\startup.log
.EXAMPLE
    .\startup.ps1
    powershell -ExecutionPolicy Bypass -File C:\WMS\scripts\startup.ps1  (via Task Scheduler)
#>
param(
    [string]$ProjectRoot  = 'C:\WMS',
    [string]$EnvFile      = '',
    [string]$WebSiteName  = 'WMS',
    [string]$LogPath      = ''
)

$ErrorActionPreference = 'Stop'

if (-not $EnvFile) { $EnvFile = Join-Path $ProjectRoot '.env.production' }
if (-not $LogPath) { $LogPath = Join-Path $ProjectRoot 'logs\startup.log' }

$LogDir = Split-Path $LogPath -Parent
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

function Write-Log { param([string]$msg)
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -Path $LogPath -Value $line -Encoding UTF8
}
function Write-LogOk   { Write-Log "OK    - $args" }
function Write-LogWarn { Write-Log "WARN  - $args" }
function Write-LogErr  { Write-Log "ERROR - $args" }

Write-Log "========== WMS STARTUP =========="

if (-not (Test-Path $ProjectRoot)) { Write-LogErr "Project root not found: $ProjectRoot"; exit 1 }
if (-not (Test-Path $EnvFile))     { Write-LogErr "Env file not found: $EnvFile";     exit 1 }

# ── 1. Load environment ───────────────────────────────────────────────────────
Write-Log "Loading environment from $EnvFile"
$envLines = Get-Content $EnvFile | Where-Object { $_ -and $_ -notmatch '^\s*#' }
foreach ($line in $envLines) {
    $parts = $line -split '=', 2
    if ($parts.Count -eq 2) {
        [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), 'Process')
    }
}
$port = if ($env:PORT) { $env:PORT } else { 5000 }
Write-LogOk "NODE_ENV=$($env:NODE_ENV) PORT=$port"

# ── 2. Start backend ──────────────────────────────────────────────────────────
$serverJs = Join-Path (Join-Path $ProjectRoot 'WMS_Managment_Backend') 'dist\server.js'
if (-not (Test-Path $serverJs)) {
    Write-LogErr "Backend entry not found: $serverJs — build first (run scripts\deploy.ps1)"
    exit 1
}

$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2) {
    $pm2Describe = & pm2 describe wms-backend 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Starting backend with PM2: $serverJs"
        & $pm2.Source start $serverJs --name wms-backend --log-date-format 'YYYY-MM-DD HH:mm:ss' 2>&1 | ForEach-Object { Write-Log $_ }
        & $pm2.Source save 2>&1 | ForEach-Object { Write-Log $_ }
    } else {
        Write-Log "Backend already managed by PM2 (wms-backend). Restarting to pick up any changes..."
        & $pm2.Source restart wms-backend 2>&1 | ForEach-Object { Write-Log $_ }
    }
    Write-LogOk "Backend started via PM2 on port $port"
} else {
    Write-LogWarn "PM2 not installed — launching backend with npm start (process will die on logoff/shell exit)."
    Write-LogWarn "Install PM2 for a bootable service:  npm install -g pm2 pm2-windows-startup"
    Push-Location (Join-Path $ProjectRoot 'WMS_Managment_Backend')
    Start-Process -FilePath (Get-Command node).Source -ArgumentList 'dist/server.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden
    Pop-Location
    Write-LogOk "Backend launched via node dist/server.js on port $port"
}

# ── 3. Start frontend site (IIS, optional) ────────────────────────────────────
$iis = Get-Module -ListAvailable WebAdministration -ErrorAction SilentlyContinue
if ($iis -and (Get-Command Get-Website -ErrorAction SilentlyContinue)) {
    try {
        Import-Module WebAdministration -ErrorAction SilentlyContinue
        $site = Get-Website -Name $WebSiteName -ErrorAction SilentlyContinue
        if ($site -and $site.State -ne 'Started') {
            Start-Website -Name $WebSiteName
            Write-LogOk "IIS website '$WebSiteName' started"
        } elseif ($site) {
            Write-LogOk "IIS website '$WebSiteName' already running"
        } else {
            Write-LogWarn "IIS site '$WebSiteName' not found. Create it per DEPLOYMENT_WINDOWS.md §4."
        }
    } catch {
        Write-LogWarn "IIS handling failed: $_"
    }
} else {
    Write-LogWarn 'IIS not detected — frontend must be served by another static server.'
}

# ── 4. Health smoke test ──────────────────────────────────────────────────────
Write-Log "Waiting for health at http://localhost:${port}/api/health ..."
$healthy = $false
for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 2
    try {
        $h = Invoke-RestMethod -Uri "http://localhost:${port}/api/health" -TimeoutSec 5 -ErrorAction SilentlyContinue
        if ($h.success -and $h.data.status -eq 'ok') { $healthy = $true; break }
    } catch {}
}
if ($healthy) {
    Write-LogOk "Backend healthy: v=$($h.data.version) db=$($h.data.db) uptime=$($h.data.uptime)s"
} else {
    Write-LogErr 'Backend not healthy after 20 seconds — inspect PM2 logs and backend log file.'
    exit 1
}

Write-Log '========== STARTUP COMPLETE =========='