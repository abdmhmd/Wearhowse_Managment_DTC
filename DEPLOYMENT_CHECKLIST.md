# WMS Production Deployment Checklist — Windows 11

Copy this into your deployment log. Tick items in order. Anything unchecked means
**do not go live** until resolved.

## A. Prerequisites
- [ ] Windows 11 Pro/Enterprise, 8 GB RAM
- [ ] Node.js 20.x LTS installed: `node -v` → `v20.x.x`
- [ ] PostgreSQL 16 installed: `psql --version`
- [ ] Git installed: `git --version`
- [ ] IIS + URL Rewrite module installed (frontend host)
- [ ] Project copied to `C:\WMS` (no spaces in path)
- [ ] `C:\WMS\scripts` contains: `deploy.ps1`, `startup.ps1`, `health-check.ps1`, `backup-db.ps1`, `load-env.ps1`

## B. PostgreSQL
- [ ] PostgreSQL service running: `Get-Service postgresql-x64-16`
- [ ] DB role `wms_user` created (strong password)
- [ ] Database `DTC_WMS_final_db` created, owned by `wms_user`
- [ ] SSL enabled in `postgresql.conf` (`ssl=on`, cert files set)
- [ ] Server cert regenerated with CN = machine hostname
- [ ] `pg_hba.conf` uses `hostssl` for remote hosts
- [ ] `icacls` restricted `server.key` permissions
- [ ] `psql "host=<hostname> ... sslmode=require" -c "SELECT 1;"` succeeds
- [ ] Backup task runs and writes to `C:\WMS_Backups`

## C. Environment
- [ ] `C:\WMS\.env.production` created from `.env.production.example`
- [ ] `DATABASE_URL` host = server hostname/LAN IP (**not** localhost)
- [ ] `DATABASE_URL` password matches `wms_user` password
- [ ] `JWT_SECRET` ≥ 32 random chars (fresh, 64 recommended)
- [ ] `JWT_REFRESH_SECRET` ≥ 32 random chars (fresh, different from JWT_SECRET)
- [ ] `CORS_ORIGINS` includes every frontend origin
- [ ] `NODE_EXTRA_CA_CERTS` = path to `server.crt` (self-signed)
- [ ] `.env.production` is **git-ignored** and never committed
- [ ] PowerShell script execution allowed: `Set-ExecutionPolicy -Scope LocalMachine RemoteSigned`

## D. Build & deploy
- [ ] Backend build clean: `npm run build` in `WMS_Managment_Backend`
- [ ] Backend typecheck clean: `npm run typecheck`
- [ ] Frontend build clean: `npm run build` in `WMS_Frontend`
- [ ] Frontend typecheck clean: `npm run typecheck`
- [ ] No stray `CHANGE_ME_*` / `YOUR_SERVER_*` remainder in `.env.production`
- [ ] Migrations applied & green: `npm run migrate` (46 ✓)

## E. Migrations & seed
- [ ] `npm run seed:admin` ran successfully
- [ ] Admin bootstrap password changed from `Admin@123` via UI immediately after first login
- [ ] Other bootstrap accounts (campus cards) re-run as required

## F. Services & firewall
- [ ] Backend started (`pm2 status` → `wms-backend` online)
- [ ] `pm2 save` + `pm2-startup install` executed (or NSSM service set to auto-start)
- [ ] IIS site `WMS` pointing at `WMS_Frontend\dist`
- [ ] `web.config` with API proxy + SPA fallback present in `dist`
- [ ] Firewall allows inbound 80 (and 5000 if exposed)
- [ ] Firewall blocks inbound 5432
- [ ] `C:\WMS\scripts\health-check.ps1` exits 0

## G. Monitoring & automation
- [ ] Task Scheduler "WMS Startup" created (AtStartup, SYSTEM)
- [ ] Task Scheduler "WMS DB Backup" created (daily 03:00)
- [ ] XML exports saved under `C:\WMS\logs`
- [ ] Backend logs configured (PM2 files under `C:\WMS\logs`)

## H. Final verification
- [ ] `Invoke-RestMethod http://localhost:5000/api/health` returns `status:"ok"`, `db:"connected"`
- [ ] Login API returns a JWT with correct role/tenant claims
- [ ] Frontend reachable at `http://<server-ip>/`
- [ ] End-to-end smoke: create item → create transaction (RV) → approve → verify stock
- [ ] Backend RESTARTS cleanly without the deploy script (boot resilience)
- [ ] Rule: **No `localhost` DATABASE_URL, no weak JWT secrets, no unencrypted PG**

## I. Post-go-live
- [ ] `.env.production.example` kept in sync with any new env vars
- [ ] Backup retention verified (>2 successful dumps, oldest pruned)
- [ ] Known bootstrap passwords rotated
- [ ] `DEPLOYMENT_WINDOWS.md` sections 9–10 (update/rollback) rehearsed on a test machine