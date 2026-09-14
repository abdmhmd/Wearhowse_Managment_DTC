# WMS Deployment Guide — Windows 11 Server (no Docker)

This guide deploys the WMS application ("C:\WMS") to a bare-metal Windows 11
server: Node.js + PostgreSQL 16 on the same machine, the React frontend served
by IIS and reverse-proxied to the Express API.

```
Browser ──▶ IIS (port 80, React static files)
                │
                └── URL Rewrite: /api/* ──▶ http://localhost:5000/api/* (Express)
                                                     │
                                                     ▼
                                             PostgreSQL 16 (SSL, port 5432, localhost only)
```

---

## Section 1 — Prerequisites

| Requirement | Minimum                      | Notes                                  |
|-------------|------------------------------|----------------------------------------|
| OS          | Windows 11 Pro / Enterprise  | Pro needed for IIS / Task Scheduler    |
| RAM         | 8 GB                         | 4 GB workable for small demo           |
| Disk        | 50 GB free                   | Backups stored under C:\WMS_Backups   |
| Node.js     | **20.x LTS**                 | Tested with 20; NOT 22-only features   |
| PostgreSQL  | **16**                       | EDB installer                          |
| Git         | latest                       | For updates                            |
| IIS         | Windows feature "Web Server" | With "URL Rewrite" module              |
| PowerShell  | 5.1+ (built-in)              | Execution policy must allow scripts    |
| PM2         | latest global                | Optional but recommended for services  |

Check versions:

```powershell
node -v          # v20.x.x expected
npm -v
git --version
psql --version
```

---

## Section 2 — First-time setup

### 2.1 Project location

Copy the project to `C:\WMS`. The path MUST contain no spaces.

```powershell
# From wherever the project currently lives
robocopy "C:\Users\ASUS\Downloads\Telegram Desktop\WMS" "C:\WMS" /E /XD node_modules dist .git /NFL /NDL /NJH /NJS
```

> `Telegram Desktop` contains spaces and long paths — that folder is fine for
> development, but the production target should be `C:\WMS`.

Normalize line endings before first build (scripts are LF in the repo; Windows
handles both, but do this once):

```powershell
cd C:\WMS
git add --renormalize .  # after cloning, commit if changed
```

### 2.2 Install PostgreSQL 16

```powershell
# 1. Run the EDB installer (download from https://www.postgresql.org/download/windows/)
#    - Leave port 5432
#    - Remember the postgres superuser password
# 2. Verify
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" --version
```

### 2.3 Enable PostgreSQL SSL (REQUIRED for NODE_ENV=production)

The backend forces `ssl = { rejectUnauthorized: true }` whenever
`NODE_ENV=production` (`WMS_Managment_Backend\src\config\database.ts`), and a
second guard (`src\utils\env.ts\assertSafeEnv`) refuses to boot production with
a `localhost`/`127.0.0.1` `DATABASE_URL`. Enable SSL:

```powershell
$PGDATA = "C:\Program Files\PostgreSQL\16\data"
$hostname = [System.Net.Dns]::GetHostName()
$bin = "C:\Program Files\PostgreSQL\16\bin"

# 1) Self-signed server cert whose CN = this machine's hostname
& "$bin\openssl.exe" req -new -x509 -days 3650 -nodes `
    -text -out "$PGDATA\server.crt" -keyout "$PGDATA\server.key" `
    -subj "/CN=$hostname"

# 2) Restrict key permissions (must NOT be world-readable)
icacls "$PGDATA\server.key" /inheritance:r /grant:r "NT AUTHORITY\NetworkService:R" "BUILTIN\Administrators:R"
# or, simpler and MySQL-safe:
# icacls "$PGDATA\server.key" /inheritance:r /grant:r "Users:R" "Administrators:R"
```

Append to `"$PGDATA\postgresql.conf"`:

```ini
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
```

Edit `"$PGDATA\pg_hba.conf"` and force SSL for local TCP:

```ini
host    all   all   127.0.0.1/32    scram-sha-256
hostssl all   all   0.0.0.0/0       scram-sha-256
```

Restart the service and verify you can connect with `sslmode=require`:

```powershell
Restart-Service postgresql-x64-16
& "$bin\psql.exe" "host=$hostname port=5432 dbname=postgres user=postgres sslmode=require" -c "SELECT 1;"
```

Set `NODE_EXTRA_CA_CERTS=$PGDATA\server.crt` in `.env.production` so Node trusts
the self-signed cert when the SNI/hostname matches.

### 2.4 Create database and user

```powershell
$bin = "C:\Program Files\PostgreSQL\16\bin"
& "$bin\psql.exe" -U postgres -h localhost -c "CREATE ROLE wms_user LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';"
& "$bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE \`"DTC_WMS_final_db\`" OWNER wms_user;"
# Verify
& "$bin\psql.exe" -h localhost -U wms_user -d DTC_WMS_final_db -c "SELECT current_user, current_database();"
```

---

## Section 3 — Environment setup

```powershell
cd C:\WMS
Copy-Item .env.production.example .env.production
```

Fill in every `CHANGE_ME_*` and `YOUR_SERVER_*` placeholder:

1. `DATABASE_URL` — host MUST be this server's hostname or LAN IP (NOT
   `localhost`/`127.0.0.1`, the app refuses loopback in production).
   ```powershell
   [System.Net.Dns]::GetHostName()   # e.g. SRV-WMS → host=srv-wms
   ```
   → `postgresql://wms_user:STRONG!@srv-wms:5432/DTC_WMS_final_db`
2. `JWT_SECRET` / `JWT_REFRESH_SECRET` — 64 random chars:
   ```powershell
   -join ((65..90)+(97..122)+(48..57) | Get-Random -Count 64 | ForEach-Object {[char]$_})
   ```
3. `CORS_ORIGINS` — for the IIS site(s): `http://localhost,http://<server-ip>,http://<hostname>`
4. `NODE_EXTRA_CA_CERTS` — `C:\Program Files\PostgreSQL\16\data\server.crt`
5. `LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW_MS` — defaults 10 / 900000.

> Variables in `.env.production` NOT used by the application (informational):
> `VITE_API_URL` (frontend uses a relative `/api` base — see §4.3),
> `RATE_LIMIT_*` (general API limiter is hardcoded to 200 req / 15 min),
> `LOG_LEVEL`, `SEED_ADMIN_*`. The `POSTGRES_*` vars are used by
> `scripts\backup-db.ps1`.

---

## Section 4 — Build and start

All commands run from PowerShell with `C:\WMS` as the working directory. There
is **no root package.json** — install/build inside each app folder.

### 4.1 Backend

```powershell
cd C:\WMS\WMS_Managment_Backend
npm ci --no-audit --no-fund
npm run build            # -> dist\server.js
npm run typecheck
```

### 4.2 Frontend

```powershell
cd C:\WMS\WMS_Frontend
npm ci --no-audit --no-fund
# Vite reads VITE_* from WMS_Frontend\.env.production. The gitignored file is
# written automatically by scripts\deploy.ps1. For a manual build:
"VITE_API_URL=http://{{server-ip}}:5000/api" | Out-File -Encoding UTF8 .env.production
npm run build            # -> WMS_Frontend\dist\  (static files for IIS)
npm run typecheck
```

### 4.3 Serve the frontend with IIS + URL Rewrite (recommended)

1. Enable IIS: Control Panel → Programs → Windows Features → Internet
   Information Services (check CGI too).
2. Install the **URL Rewrite** module:
   https://www.iis.net/downloads/microsoft/url-rewrite
3. Create a site `WMS` whose physical path is `C:\WMS\WMS_Frontend\dist`.
4. Add `C:\WMS\WMS_Frontend\dist\web.config`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="API proxy" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://localhost:5000/api/{R:1}" />
        </rule>
        <rule name="SPA fallback" stopProcessing="true">
          <match url=".*" />
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
    <staticContent>
      <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAge="1.00:00:00" />
    </staticContent>
  </system.webServer>
</configuration>
```

Because the frontend calls `/api` (relative base URL, `src\api\client.ts`), the
reverse proxy makes all traffic same-origin — no CORS issues. CORS remains
configured for direct API calls from other origins.

Alternative if IIS is not desired: `npm run preview` (port 4173) inside
`WMS_Frontend` — development use only.

### 4.4 Database migrations & seed

```powershell
cd C:\WMS\WMS_Managment_Backend
# Load .env.production into the process environment (dotenv won't override it):
. C:\WMS\scripts\load-env.ps1
npm run migrate                       # applies 001..046, checksum-verified
npm run seed:admin                    # creates admin / Admin@123 (bootstrap ONLY)
```

**Immediately after seeding, change the admin password** (it is a predictable
bootstrap default): log in as `admin` and restore/reset it via
**Users → your admin account → reset**, or run:

```powershell
npm run reset:admin    # resets to Admin@123 again — use it to regain access, then change via UI
```

### 4.5 Start the backend

```powershell
cd C:\WMS\WMS_Managment_Backend
npm start              # node dist/server.js, NODE_ENV=production
```

First boot refuses to start if the environment is unsafe (weak JWT secrets,
loopback DATABASE_URL, etc.). See Section 11.

---

## Section 5 — Windows service (PM2 or NSSM)

### 5.1 PM2 (recommended)

```powershell
npm install -g pm2 pm2-windows-startup
```

Load env + boot the service:

```powershell
# make an ecosystem file so env + args are reproducible
Set-Content -Encoding UTF8 C:\WMS\ecosystem.config.js @"
module.exports = {
  apps: [{
    name: 'wms-backend',
    script: 'C:/WMS/WMS_Managment_Backend/dist/server.js',
    cwd: 'C:/WMS/WMS_Managment_Backend',
    env: { NODE_ENV: 'production' },
    max_memory_restart: '500M',
    error_file: 'C:/WMS/logs/pm2-backend-error.log',
    out_file: 'C:/WMS/logs/pm2-backend-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
}
"@
cd C:\WMS
pm2 start ecosystem.config.js
pm2 save
pm2-startup install      # registers a boot task that restores PM2 processes
pm2 status
```

Verify:

```powershell
pm2 logs wms-backend --lines 30
```

### 5.2 NSSM (alternative)

```powershell
nssm install WMSBackend "C:\Program Files\nodejs\node.exe" "C:\WMS\WMS_Managment_Backend\dist\server.js"
nssm set WMSBackend AppDirectory C:\WMS\WMS_Managment_Backend
nssm set WMSBackend AppEnvironmentExtra NODE_ENV=production PORT=5000
nssm set WMSBackend Start SERVICE_AUTO_START
nssm start WMSBackend
```

> NSSM does NOT automatically load `.env.production`; set every required
> variable via `AppEnvironmentExtra` (DATABASE_URL, JWT_SECRET,
> JWT_REFRESH_SECRET, CORS_ORIGINS, …).

---

## Section 6 — Firewall rules

Run in an **elevated** PowerShell:

```powershell
# Allow web + API inbound
New-NetFirewallRule -DisplayName "WMS HTTP"  -Direction Inbound -LocalPort 80  -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "WMS API"   -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow
# Block PostgreSQL from the network (localhost-only connections)
New-NetFirewallRule -DisplayName "Block PG External" -Direction Inbound -LocalPort 5432 -Protocol TCP -Action Block

# Confirm
Get-NetFirewallRule -DisplayName "WMS*", "Block PG External" | Format-Table DisplayName,Enabled,Direction,Action
```

> If you do NOT want the API exposed on 5000, block it externally too and rely
> on the IIS proxy only (then health checks still work on localhost).

---

## Section 7 — Task Scheduler

### 7.1 Startup (run at boot)

```powershell
$action  = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File C:\WMS\scripts\startup.ps1"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "WMS Startup" -Action $action -Trigger $trigger -Principal $principal -Description "Start WMS backend on boot"
```

### 7.2 Daily database backup (3:00 AM)

```powershell
$action  = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File C:\WMS\scripts\backup-db.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At 3:00AM
Register-ScheduledTask -TaskName "WMS DB Backup" -Action $action -Trigger $trigger -Principal $principal -RunLevel Highest -Description "Daily WMS PostgreSQL backup (30-day retention)"
```

### 7.3 Export / import the XML

```powershell
Export-ScheduledTask -TaskName "WMS Startup" | Out-File -Encoding UTF8 C:\WMS\logs\WMS-Startup-task.xml
Export-ScheduledTask -TaskName "WMS DB Backup" | Out-File -Encoding UTF8 C:\WMS\logs\WMS-Backup-task.xml
```

On another machine, import with:

```powershell
schtasks /Create /XML "C:\WMS\logs\WMS-Startup-task.xml" /TN "WMS Startup"
schtasks /Create /XML "C:\WMS\logs\WMS-Backup-task.xml"  /TN "WMS DB Backup"
```

Test the backup task once by running it manually and checking `C:\WMS_Backups`.

---

## Section 8 — Verification

```powershell
# 1. Health endpoint (server + script)
Invoke-RestMethod http://localhost:5000/api/health | ConvertTo-Json -Depth 4
C:\WMS\scripts\health-check.ps1          # exit 0 = healthy

# 2. Backend process
pm2 status                               # wms-backend online, no restarts

# 3. Login flow
$login = Invoke-RestMethod -Method Post -Uri "http://localhost:5000/api/auth/login" `
  -ContentType application/json -Body (@{ username='admin'; password='<new-password>' } | ConvertTo-Json)
$login.data.token                        # non-empty JWT expected

# 4. Frontend
# Browse http://<server-ip>/  →  login page renders, log in, and complete a
# representative workflow:
#   Create item → Create transaction (RV) → Approve → Verify stock.
```

---

## Section 9 — Update procedure

```powershell
cd C:\WMS
# 1. Stop service
pm2 stop wms-backend
# (or: nssm stop WMSBackend)

# 2–6. One-shot deploy (pull, npm ci, build, migrate, restart, health-check)
powershell -ExecutionPolicy Bypass -File C:\WMS\scripts\deploy.ps1
```

Manual equivalent:

```powershell
pm2 stop wms-backend
git -C C:\WMS pull --ff-only
cd C:\WMS\WMS_Managment_Backend; npm ci --no-audit --no-fund; npm run build; cd ..
cd C:\WMS\WMS_Frontend;        npm ci --no-audit --no-fund; npm run build; cd ..
cd C:\WMS\WMS_Managment_Backend; npm run migrate
pm2 restart wms-backend
C:\WMS\scripts\health-check.ps1
```

> `deploy.ps1` prefers `git pull --ff-only`. If your remote copy diverged, pull
> fails safely and the script continues with local state — verify afterwards.

---

## Section 10 — Rollback

```powershell
# 1. Stop
pm2 stop wms-backend
# 2. Revert code to the last known-good tag/branch
git -C C:\WMS checkout deploy/stable   # or: git -C C:\WMS revert <commit>
# 3. Rebuild (code only)
cd C:\WMS\WMS_Managment_Backend; npm run build; cd ..
cd C:\WMS\WMS_Frontend; npm run build; cd ..
# 4. If the last deploy changed the database, restore the prior dump
#    (custom-format dump):
& "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" --clean --if-exists --host 127.0.0.1 --username wms_user --dbname DTC_WMS_final_db C:\WMS_Backups\wms_20260913_030000.sql
# 5. Restart + verify
pm2 restart wms-backend
C:\WMS\scripts\health-check.ps1
```

> Migrations are forward-only and checksum-locked. To regress a schema change
> you must restore from a pre-change dump, then re-verify the migration log
> (`SELECT filename, applied_at FROM _migrations ORDER BY id;`).
> Test rollback on a scratch copy before you need it.

---

## Section 11 — Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| Backend exits on start; log says `Refusing to start server (unsafe environment)` | Weak JWT secrets, loopback DATABASE_URL in production, or placeholder secrets. Fix `.env.production` (§3), then `restart`. |
| Backend exits: `Missing or invalid required environment variables` | `.env.production` wasn't loaded into the process (PM2/NSSM don't auto-load). Load env (startup/deploy scripts) or put vars into the service config. |
| `error: no pg_hba.conf entry for host ... SSL off` | PostgreSQL requires SSL (`hostssl` line) but `sslmode=disable` — remove `?sslmode=disable`, configure SSL (§2.3). |
| `self-signed certificate` / `unable to verify first certificate` | `rejectUnauthorized: true`; set `NODE_EXTRA_CA_CERTS` to `server.crt`, and ensure cert CN matches the host in DATABASE_URL. |
| `connection refused on port 5432` | PostgreSQL service not running: `Start-Service postgresql-x64-16`; or the firewall blocked both directions. |
| `connect ECONNREFUSED 127.0.0.1:5000` / health fails locally | Backend not running — `pm2 status`, `pm2 logs wms-backend`. |
| Frontend loads but API 404/401 | IIS proxy rule not applied / `web.config` missing in `dist`; or CORS blocks the origin. Check browser console + `Get-WebURL` (IIS). |
| `.env.production` never picked up | Scripts load it into the process env; files inside `WMS_Managment_Backend\.env` are NOT read by scripts (they set process vars first). Run `npm run migrate`/`seed:*` from a shell primed by the scripts, or copy the vars. |
| Port conflict on 5000/80 | `netstat -ano | findstr :5000`, kill the owning PID (`taskkill /PID <pid> /F`), or change `PORT`. |
| PM2 process exits during idle due to token cleanup | Expected every 24 h; `max_memory_restart` guards leaks. See `pm2 logs`. |
| Slow response / high CPU | `pm2 monit`; increase `max_memory_restart`; check PG `pg_stat_activity`. |
| Backups missing | `backup-db.ps1` needs run as the task user with privileges to read PG. Check `C:\WMS_Backups` and Task Scheduler "Last Run Result". |

**Log locations**

| Log | Path |
|---|---|
| Backend console (PM2) | `C:\WMS\logs\pm2-backend-out.log` / `-error.log` |
| Startup script | `C:\WMS\logs\startup.log` |
| App debug output | only in `NODE_ENV=development`; production logs go to console/PM2 files |
| PostgreSQL | `C:\Program Files\PostgreSQL\16\data\log\*.log` |
| IIS request logs | `C:\inetpub\logs\LogFiles\W3SVC*` |