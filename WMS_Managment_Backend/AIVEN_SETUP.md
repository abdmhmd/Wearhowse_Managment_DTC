# Aiven PostgreSQL Setup

Connect the WMS backend to an **Aiven for PostgreSQL** cloud service over TLS.

## 1. Create the service

1. Log in to <https://console.aiven.io>
2. Create a new **PostgreSQL** service (free/startup tier available)
3. From the service **Overview** page, note down:
   - **Service URI** — `postgres://avnadmin:PASSWORD@HOST:PORT/defaultdb?sslmode=require`
   - **Host**, **Port**, **User**, **Password**, **Database**

## 2. Download the CA certificate

1. In the Aiven console → your service → **Overview**
2. Find **CA Certificate** → click **Download**
3. Save it as `WMS_Managment_Backend/certs/ca.pem`

> The repository never commits the certificate. `certs/` is tracked only via
> `certs/.gitkeep`; `*.pem`/`*.crt`/`*.key` are gitignored.

## 3. Configure `.env.production`

Point the same `DATABASE_URL` and SSL switches the backend reads:

```text
DATABASE_URL=postgresql://avnadmin:YOUR_PASSWORD@HOST:PORT/defaultdb?sslmode=require
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
DB_SSL_CA_PATH=./certs/ca.pem
```

| Variable | Aiven value |
|----------|-------------|
| `DATABASE_URL` | The exact Service URI from the Aiven console |
| `DB_SSL` | `true` (TLS required by Aiven) |
| `DB_SSL_CA_PATH` | `./certs/ca.pem` (backend working dir) |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` to verify the server cert against the Aiven CA |

`DB_SSL_CA_PATH` is read relative to the process working directory — start the
backend and migration runner from inside `WMS_Managment_Backend`, or use an
absolute path.

## 4. Run migrations

```powershell
cd WMS_Managment_Backend
npm run migrate
# or inspect-only:
npm run migrate -- --verify
```

The migration runner reuses the shared pool (`src/config/database.ts`), so it
picks up `DATABASE_URL` + `DB_SSL_*` automatically.

## 5. Verify

```powershell
npm start
# Expect: "✅ Database connected (SSL: true, host: <service>.aivencloud.com)"
```

Then check the health endpoint:

```powershell
Invoke-RestMethod http://localhost:5000/health
# -> { status:'ok', db:'connected', ssl:true, host:'<service>.aivencloud.com', ... }
```

## 6. Aiven connection limits

- Free/startup plans allow roughly **20–100 direct connections**.
- Use **PgBouncer** (Aiven's connection pooling) if many services/instances
  connect at once.
- Keep `pool.max` ≤ **10** in production (see `src/config/database.ts`).
  Aiven recommends matching the pool limit to your plan's direct-connection cap.

## 7. Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `self signed certificate in certificate chain` | Missing CA cert | Download `ca.pem`, set `DB_SSL_CA_PATH` |
| `no pg_hba.conf entry` | Wrong host/port or SSL not enabled | Use the exact URI from the Aiven console |
| `password authentication failed` | Wrong password | Reset password in Aiven console |
| `too many connections` | Pool/connections above plan cap | Set `pool.max` ≤ 10; enable PgBouncer |
| `ECONNREFUSED` | Host/port wrong | Verify host ends with `.aivencloud.com` |
| `--refusing to start server (unsafe environment)--` | `NODE_ENV=production` + DATABASE_URL host lookup | Aiven hosts pass; see `assertSafeEnv` in `src/utils/env.ts` |

## Local development (unchanged)

Local `npm run dev` stays on plain TCP:

```text
DB_SSL=false
```

When `DB_SSL` is unset entirely, production keeps the legacy
`rejectUnauthorized: true` behavior so existing LAN deployments do not break.