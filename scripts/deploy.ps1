#Requires -Version 5.1
<#
.SYNOPSIS
    WMS production deploy script (pull, build, migrate, restart, health-check).
.PARAMETER ProjectRoot
    Repository root on the server. Default: C:\WMS
.PARAMETER EnvFile
    Absolute path to the production env file. Default: <ProjectRoot>\.env.production
.PARAMETER SkipMigrations
    Skip the migration step (useful for code-only refreshes).
.PARAMETER SkipRestart
    Stop after migrations without restarting the services.
.EXAMPLE
    .\deploy.ps1
    .\deploy.ps1 -SkipMigrations
    .\deploy.ps1 -ProjectRoot "D:\WMS" -EnvFile "D:\WMS\.env.production"
#>
param(
    [string]$ProjectRoot  = 'C:\WMS',
    [string]$EnvFile      = '',
    [switch]$SkipMigrations,
    [switch]$SkipRestart
)

$ErrorActionPreference = 'Stop'

if (-not $EnvFile) { $EnvFile = Join-Path $ProjectRoot '.env.production' }

function Write-Color { param([string]$msg, [ConsoleColor]$color = 'White')
    Write-Host $msg -ForegroundColor $color
}

function Write-Info  { Write-Color "  [INFO]  $args" 'Cyan' }
function Write-Ok    { Write-Color "  [OK]    $args" 'Green' }
function Write-Warn  { Write-Color "  [WARN]  $args" 'Yellow' }
function Write-Err   { Write-Color "  [ERROR] $args" 'Red' }

Write-Color "`n========== WMS DEPLOY ==========" 'White'
Write-Color "Timestamp : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" 'DarkGray'
Write-Color "Project   : $ProjectRoot" 'DarkGray'
Write-Color "Env       : $EnvFile`n" 'DarkGray'

# ── 1. Pre-flight checks ────────────────────────────────────────────────────
if (-not (Test-Path $ProjectRoot))          { Write-Err "Project root not found: $ProjectRoot"; exit 1 }
if (-not (Test-Path $EnvFile))              { Write-Err "Env file not found: $EnvFile";        exit 1 }
if (-not (Test-Path (Join-Path $ProjectRoot 'WMS_Managment_Backend'))) {
    Write-Err "Expected WMS_Managment_Backend folder inside $ProjectRoot"; exit 1
}

# ── 2. Load env vars into process ────────────────────────────────────────────
Write-Info 'Loading environment variables from .env.production...'
$envLines = Get-Content $EnvFile | Where-Object { $_ -and $_ -notmatch '^\s*#' }
foreach ($line in $envLines) {
    $parts = $line -split '=', 2
    if ($parts.Count -eq 2) {
        [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), 'Process')
    }
}
Write-Ok "NODE_ENV=$($env:NODE_ENV); PORT=$($env:PORT)"

# ── 3. Git pull ──────────────────────────────────────────────────────────────
Write-Info 'Pulling latest code...'
Push-Location $ProjectRoot
try {
    git pull --ff-only 2>&1 | ForEach-Object { Write-Info $_ }
    Write-Ok 'Git pull completed'
} catch {
    Write-Warn "git pull failed or not a git repo — continuing with local state: $_"
} finally {
    Pop-Location
}

# ── 4. Backend build ─────────────────────────────────────────────────────────
$BackendDir = Join-Path $ProjectRoot 'WMS_Managment_Backend'
Write-Info 'Installing backend dependencies (npm ci)...'
Push-Location $BackendDir
& npm ci --no-audit --no-fund 2>&1 | ForEach-Object { Write-Info $_ }
Write-Ok 'Backend dependencies installed'

Write-Info 'Building backend...'
& npm run build 2>&1 | ForEach-Object { Write-Info $_ }
if ($LASTEXITCODE -ne 0) { Write-Err 'Backend build failed'; Pop-Location; exit 1 }
Write-Ok 'Backend built successfully'
Pop-Location

# ── 5. Frontend build ────────────────────────────────────────────────────────
$FrontendDir = Join-Path $ProjectRoot 'WMS_Frontend'
Write-Info 'Generating frontend .env.production...'
$frontEnvPath = Join-Path $FrontendDir '.env.production'
$VITE_API_URL = $env:VITE_API_URL
if (-not $VITE_API_URL) { $VITE_API_URL = "http://$($env:COMPUTERNAME):5000/api" }
Set-Content -Path $frontEnvPath -Value "VITE_API_URL=$VITE_API_URL" -Encoding UTF8 -Force
Write-Ok "Wrote $frontEnvPath"

Write-Info 'Installing frontend dependencies (npm ci)...'
Push-Location $FrontendDir
& npm ci --no-audit --no-fund 2>&1 | ForEach-Object { Write-Info $_ }
Write-Ok 'Frontend dependencies installed'

Write-Info 'Building frontend...'
& npm run build 2>&1 | ForEach-Object { Write-Info $_ }
if ($LASTEXITCODE -ne 0) { Write-Err 'Frontend build failed'; Pop-Location; exit 1 }
Write-Ok "Frontend built successfully → $(Join-Path $FrontendDir 'dist')"
Pop-Location

# ── 6. Database migrations ───────────────────────────────────────────────────
if (-not $SkipMigrations) {
    Write-Info 'Running database migrations...'
    Push-Location $BackendDir
    & npm run migrate 2>&1 | ForEach-Object { Write-Info $_ }
    if ($LASTEXITCODE -ne 0) { Write-Err 'Migrations failed'; Pop-Location; exit 1 }
    Write-Ok 'Migrations applied'
    Pop-Location
} else {
    Write-Warn 'Skipping migrations (--SkipMigrations).'
}

# ── 7. Restart services ──────────────────────────────────────────────────────
if (-not $SkipRestart) {
    $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
    if ($pm2) {
        Write-Info 'Restarting backend with PM2...'
        & pm2 restart wms-backend 2>&1 | ForEach-Object { Write-Info $_ }
        if ($LASTEXITCODE -ne 0) {
            Write-Info 'pm2 restart failed — starting fresh...'
            $serverJs = Join-Path $BackendDir 'dist\server.js'
            & pm2 start $serverJs --name wms-backend --log-date-format 'YYYY-MM-DD HH:mm:ss' 2>&1 | ForEach-Object { Write-Info $_ }
            & pm2 save 2>&1 | ForEach-Object { Write-Info $_ }
        }
        Write-Ok 'Backend service restarted via PM2'
    } else {
        Write-Warn 'PM2 not found — skipping service restart. Start manually with: npm start (in WMS_Managment_Backend)'
    }
} else {
    Write-Warn 'Skipping restart (--SkipRestart).'
}

# ── 8. Health check ──────────────────────────────────────────────────────────
$port = if ($env:PORT) { $env:PORT } else { 5000 }
$healthUri = "http://localhost:${port}/api/health"
Write-Info "Waiting for backend health at $healthUri ..."
$healthy = $false
for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 2
    try {
        $h = Invoke-RestMethod -Uri $healthUri -TimeoutSec 5 -ErrorAction SilentlyContinue
        if ($h.success -and $h.data.status -eq 'ok') { $healthy = $true; break }
    } catch { }
}

if ($healthy) {
    Write-Ok "Backend is healthy (v=$($h.data.version) db=$($h.data.db) uptime=$($h.data.uptime)s)"
} else {
    Write-Err "Backend did not become healthy within 20 seconds."
    if ($pm2) { Write-Info 'Checking PM2 logs:'; & pm2 logs wms-backend --lines 20 --nostream 2>&1 | ForEach-Object { Write-Color $_ 'DarkYellow' } }
    exit 1
}

Write-Color "`n========== DEPLOY COMPLETE ==========" 'Green'
