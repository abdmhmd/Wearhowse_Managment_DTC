#Requires -Version 5.1
<#
.SYNOPSIS
    Dump the WMS PostgreSQL database to a timestamped file and compress it.
.PARAMETER EnvFile
    Path to the env file. Default: C:\WMS\.env.production
.PARAMETER BackupDir
    Directory where backups are saved. Default: C:\WMS_Backups
.PARAMETER PgDumpPath
    Full path to pg_dump.exe. Auto-detected for PG 16, 15, 14 if omitted.
.PARAMETER RetentionDays
    Delete backups older than this many days. Default: 30
.PARAMETER Format
    Dump format: "plain" (SQL, zipped) or "custom" (binary, self-compressed).
    Default: plain
.EXAMPLE
    .\backup-db.ps1
    .\backup-db.ps1 -BackupDir "D:\Backups" -RetentionDays 7
#>
param(
    [string]$EnvFile       = 'C:\WMS\.env.production',
    [string]$BackupDir     = 'C:\WMS_Backups',
    [string]$PgDumpPath    = '',
    [int]$RetentionDays    = 30,
    [ValidateSet('plain','custom')]
    [string]$Format        = 'plain'
)

$ErrorActionPreference = 'Stop'

function Write-Color { param([string]$msg, [ConsoleColor]$c = 'White'); Write-Host $msg -ForegroundColor $c }
function Write-Info  { Write-Color "  [INFO]  $args" 'Cyan' }
function Write-Ok    { Write-Color "  [OK]    $args" 'Green' }
function Write-Warn  { Write-Color "  [WARN]  $args" 'Yellow' }
function Write-Err   { Write-Color "  [ERROR] $args" 'Red' }

Write-Color "`n========== WMS DATABASE BACKUP ==========" 'White'
Write-Color "Timestamp : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" 'DarkGray'

# ── 1. Load env ──────────────────────────────────────────────────────────────
if (-not (Test-Path $EnvFile)) { Write-Err "Env file not found: $EnvFile"; exit 1 }
$envLines = Get-Content $EnvFile | Where-Object { $_ -and $_ -notmatch '^\s*#' }
foreach ($line in $envLines) {
    $parts = $line -split '=', 2
    if ($parts.Count -eq 2) { [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), 'Process') }
}

# ── 2. Resolve connection details ────────────────────────────────────────────
$dbUrl = $env:DATABASE_URL
$pgHost = $env:POSTGRES_HOST
$pgPort = $env:POSTGRES_PORT
$pgUser = $env:POSTGRES_USER
$pgDb   = $env:POSTGRES_DB

if ($dbUrl -and -not $pgHost) {
    try { $uri = [System.Uri]$dbUrl; $pgHost = $uri.Host; $pgPort = $uri.Port.ToString() } catch {
        Write-Warn "Could not parse DATABASE_URL — will use pg_dump URL mode"
    }
}

if (-not $pgDb -and -not $dbUrl) {
    Write-Err 'No DATABASE_URL and no POSTGRES_DB defined'; exit 1
}

# ── 3. Locate pg_dump ────────────────────────────────────────────────────────
function Find-PgDump {
    $candidates = @(
        "$env:ProgramFiles\PostgreSQL\16\bin\pg_dump.exe",
        "$env:ProgramFiles\PostgreSQL\15\bin\pg_dump.exe",
        "$env:ProgramFiles\PostgreSQL\14\bin\pg_dump.exe",
        "$env:ProgramFiles\PostgreSQL\13\bin\pg_dump.exe",
        "$env:ProgramFiles(x86)\PostgreSQL\16\bin\pg_dump.exe"
    )
    foreach ($p in $candidates) {
        if ($p -and (Test-Path $p)) { return $p }
    }
    $cmd = Get-Command pg_dump -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

if (-not $PgDumpPath -or -not (Test-Path $PgDumpPath)) { $PgDumpPath = Find-PgDump }
if (-not $PgDumpPath -or -not (Test-Path $PgDumpPath)) {
    Write-Err "pg_dump.exe not found. Install PostgreSQL or supply -PgDumpPath."; exit 1
}
Write-Info "pg_dump: $PgDumpPath"

# ── 4. Create backup ─────────────────────────────────────────────────────────
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null }

$dumpFile = Join-Path $BackupDir "wms_${timestamp}.sql"

Write-Info "Dumping database to $dumpFile ..."
if ($dbUrl) {
    $env:PGPASSWORD = $env:POSTGRES_PASSWORD
    & $PgDumpPath --clean --if-exists --no-owner --no-acl --format=$Format --file="$dumpFile" "$dbUrl" 2>&1 | ForEach-Object { Write-Info $_ }
} else {
    & $PgDumpPath --clean --if-exists --no-owner --no-acl --format=$Format --file="$dumpFile" --host="$pgHost" --port="$pgPort" --username="$pgUser" --dbname="$pgDb" 2>&1 | ForEach-Object { Write-Info $_ }
}
if ($LASTEXITCODE -ne 0) { Write-Err "pg_dump failed (exit code $LASTEXITCODE)"; exit 1 }

# ── 5. Compress ──────────────────────────────────────────────────────────────
if ($Format -eq 'custom') {
    $archivePath = $dumpFile
    Write-Info "Custom format already compressed: $archivePath"
} else {
    $archivePath = "${dumpFile}.zip"
    Write-Info "Compressing → $archivePath ..."
    try {
        Compress-Archive -Path $dumpFile -DestinationPath $archivePath -CompressionLevel Optimal -Force
        Remove-Item $dumpFile -Force
    } catch {
        Write-Warn "Compress-Archive failed, trying tar.gz..."
        $tgzPath = "${dumpFile}.tar.gz"
        & tar.exe -czf "$tgzPath" -C $BackupDir (Split-Path $dumpFile -Leaf) 2>&1 | ForEach-Object { Write-Info $_ }
        if ($LASTEXITCODE -eq 0) {
            Remove-Item $dumpFile -Force -ErrorAction SilentlyContinue
            $archivePath = $tgzPath
        } else {
            Write-Warn "tar.gz also failed — keeping uncompressed .sql"
            $archivePath = $dumpFile
        }
    }
}

# ── 6. Retention cleanup ─────────────────────────────────────────────────────
Write-Info "Cleaning backups older than $RetentionDays days..."
Get-ChildItem $BackupDir -File | Where-Object {
    $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays)
} | ForEach-Object {
    Remove-Item $_.FullName -Force
    Write-Info "Removed: $($_.Name)"
}

# ── 7. Summary ───────────────────────────────────────────────────────────────
$sizeMB = [math]::Round((Get-Item $archivePath).Length / 1MB, 2)
Write-Ok "Backup saved: $archivePath ($sizeMB MB)"
