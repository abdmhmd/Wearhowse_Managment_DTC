# WMS Management Backend — Project Report

> Warehouse Management System (WMS) — REST API for inventory control, stock movements, material requests, and role-based warehouse operations.

**Document version:** 1.0
**Status:** Active development
**Last reviewed against source:** `src/` and `migrations/` at current working tree

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Database Schema & ERD Summary](#3-database-schema--erd-summary)
4. [Core Features & Functional Modules](#4-core-features--functional-modules)
5. [API Endpoint Overview](#5-api-endpoint-overview)
6. [Authentication & Authorization Flow](#6-authentication--authorization-flow)
7. [Setup & Deployment Instructions](#7-setup--deployment-instructions)

---

## 1. Project Overview

The **WMS Management Backend** is the server-side application of a Warehouse Management System. It exposes a REST API consumed by a React frontend (`WMS_Frontend`, not covered here) and provides the business logic for:

- **Inventory control** — tracking how much of each item is physically in stock, per warehouse, including batch/lot and expiry information.
- **Stock movements** — inbound (receiving) and outbound (issuing) transactions that post immutable audit movements and update balances atomically.
- **Material requests** — internal requisitions raised by departments, approved by warehouse staff, and fulfilled by issuing vouchers; durable items issued this way are tracked as **custodies**.
- **Project & custody management** — graduation/research projects that borrow durable items, and a return-to-inventory (RTI) workflow.
- **Reporting & settings** — inventory reports, item cards, and system configuration.

The system is **bilingual (Arabic / English)** — master-data tables carry both `name_ar` and `name_en` columns and the API respects a `lang` hint, and it is designed for an **institutional / educational environment** (departments, supervisors, student projects). The current development environment runs on **port 5000** and connects to a PostgreSQL database seeded with demo data.

The application follows a clean **route → controller → service → repository** layering with **Zod** validation, centralized error handling, and PostgreSQL **transactions** for all money/stock-critical operations.

> **Note on the ORM:** despite earlier references to Prisma, this project uses **raw, parameterized SQL** through the `pg` (node-postgres) driver. All schema definition lives in SQL migration files under `migrations/`.

---

## 2. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Language | **TypeScript 5.5** (strict mode, target ES2022) | Type-safe backend code |
| Runtime | **Node.js 20** | Server runtime (Alpine container in prod) |
| Web framework | **Express 4.19** | Routing and middleware |
| Database driver | **pg (node-postgres) 8.12** + connection `Pool` | PostgreSQL access with parameterized queries |
| Database | **PostgreSQL** | Relational storage |
| Authentication | **jsonwebtoken 9** (JWT access + refresh tokens), **bcryptjs** (password hashing) | Login, session, password security |
| Validation | **Zod 4** | Request body/query/env validation |
| Security middleware | **helmet**, **cors**, **express-rate-limit** | Headers, CORS, rate limiting |
| API docs | **swagger-ui-express** | Interactive API documentation |
| Development | **ts-node-dev** (watch mode), **tsc** build, `dotenv` | Local DX and builds |
| Testing | **Jest 30**, **supertest**, **ts-jest** | Unit & integration tests |
| Deployment | **Docker / docker-compose** | Containerized backend + Postgres |

### Project scripts (`package.json`)

| Script | Command |
|---|---|
| `npm run dev` | `ts-node-dev --respawn --transpile-only src/server.ts` (hot-reload dev server) |
| `npm run build` | `tsc` → compile to `dist/` |
| `npm start` | `node dist/server.js` (production) |
| `npm run migrate` | Apply pending SQL migrations |
| `npm run seed:admin` | Create the default `admin` user |
| `npm run seed:demo` / `seed:demo:full` | Seed demo data (basic / comprehensive) |
| `npm run seed:local` | Seed a local database |
| `npm run reset:admin` | Reset the admin password |
| `npm test` | Run the Jest test suite |

---

## 3. Database Schema & ERD Summary

Schema is managed with **hand-written SQL migrations** (no ORM). The migration runner (`scripts/run-migrations.ts`) applies `.sql` files in `migrations/` in sorted order, records them in a `_migrations` table with **SHA-256 checksums** (detecting edits to already-applied files), and supports `--verify`, `--down <name>`, and `--force`.

- `migrations/001_initial_schema.sql` — squashed, consolidated schema (replaces the original `schema.sql` and archive migrations `002`–`014`). Fully idempotent.
- `migrations/015_add_location_tracking.sql` — adds the `locations` table (rack/shelf/bin) and links it to inventory. (At the time of writing the table exists in SQL; no dedicated API endpoints expose it yet.)

### Entity types (PostgreSQL enums)

`user_role`, `transaction_type` (`RV`, `LN`, `RTV`, `RTI`, `ADJ`, `TRF`), `transaction_status` (`draft`, `approved`), `movement_type` (`IN`, `OUT`), `request_status`, `request_priority`, `request_type` (`experiment`, `semester`, `project`), `alert_type`, `alert_status`, `inventory_session_status`, `project_status`, `custody_status`.

### Core tables

| Table | Description |
|---|---|
| `users` | System users (`username`, `password_hash`, `role`, `department_id`, `is_active`) |
| `categories` | Item categories; self-referencing `parent_code` for hierarchy; `prefix` used to auto-generate item codes |
| `units` | Units of measure (`code`, bilingual names) |
| `suppliers` | Vendor master data |
| `departments` | Organizational departments |
| `warehouses` | Warehouse locations |
| `items` | Inventory items (`item_code`, category/unit/warehouse FKs, min/max stock, balances, `last_purchase_price`, `is_consumable`, `sap_material_number`, `gl_account`, …) |
| `unit_conversions` | Conversion factors between units for an item |
| `item_warehouse_stock` | **Source of truth** for stock: one row per item/warehouse with `current_balance` |
| `transactions` | Voucher headers (type, status, supplier/department/warehouse refs) |
| `transaction_details` | Line items per voucher (quantity, unit price/cost, batch number) |
| `stock_movements` | Immutable audit trail of every stock change (before/change/after) |
| `batches` | Lot tracking with `production_date` / `expiry_date` |
| `journal_entries` | Accounting postings generated on approval |
| `material_requests` | Internal requisitions with status workflow |
| `material_request_details` | Request line items |
| `projects` | Graduation/research projects |
| `custodies` | Durable items issued to staff (active/returned) |
| `alerts` | Low-stock / expiry / overstock / pending-request notifications |
| `inventory_sessions` / `inventory_counts` | Cycle-counting sessions and per-item counts |
| `refresh_tokens` | Hashed refresh tokens for session rotation |
| `system_settings` | Key/value configuration (accounting accounts, valuation method) |
| `locations` | Physical rack/shelf/bin positions (migration 015) |

### Primary relationships

- `items → categories` (belongs to one category), `items → units`, `items → warehouses` (default warehouse).
- `item_warehouse_stock` — many-to-many resolution between `items` and `warehouses` (a `UNIQUE(item_id, warehouse_id)`), plus an optional `location_id`.
- `transactions → users` (`created_by`, `approved_by`), optional `supplier_id`, `department_id`, `to_warehouse_id` (transfers).
- `transactions 1─n transaction_details` (CASCADE), `transactions 1─n stock_movements`.
- `material_requests → departments`, `warehouses`, `requested_by`, optional `project_id`, and a circular link to the issue `transaction_id`.
- `custodies → items`, `users (assigned_to)`, `issued_transaction_id`, optional `return_transaction_id`, `request_id`, `project_id`.
- `batches → items`, `warehouses`, `suppliers`, `transactions`.
- Delete policies are intentional: **CASCADE** for child rows that lose meaning (details, counts), **RESTRICT** for financial/audit links, **SET NULL** for optional user links.

### Automation

- `update_updated_at_column()` trigger on all main tables (`BEFORE UPDATE`).
- `fn_check_low_stock()` trigger on `item_warehouse_stock` — automatically inserts a **low-stock alert** when balance falls to/below the minimum.
- `transaction_details.total_price` is a **generated column** (`quantity * unit_price`).

---

## 4. Core Features & Functional Modules

### 4.1 Authentication & Authorization (`src/modules/auth`)

- `POST /api/auth/login` — validates `username`/`password` via Zod, verifies the account is `is_active`, compares the password with bcrypt, and returns an **access token** (default 1h) plus a **refresh token** (default 7d). The refresh token is stored **hashed (SHA-256)** in `refresh_tokens`.
- `POST /api/auth/refresh` — validates the refresh token signature, checks it exists in the DB and is not revoked, **rotates** it (revokes the old, issues a new pair), and returns a fresh access token.
- `POST /api/auth/logout` — revokes the presented refresh token.
- **Hardened by design:** login rate-limit (10 attempts / 15 min), token rate-limit, `AUTH_ACCOUNT_DISABLED` for inactive accounts, and a 24h background cleanup job that deletes expired/revoked refresh tokens.
- Protected routes require `Authorization: Bearer <token>`; role checks are done with the `authorize(...)` middleware.

### 4.2 Master Data Management

Standard CRUD modules (routes follow the pattern `GET /`, `GET /:id|:code`, `POST /`, `PUT /:id|:code`, `DELETE /:id|:code`), with create/update restricted to warehouse staff and delete restricted to admins:

- **Categories** (`categories`) — hierarchical (parent code), optional code `prefix`.
- **Units** (`units`).
- **Suppliers** (`suppliers`).
- **Departments** (`departments`).
- **Warehouses** (`warehouses`).
- **Items** (`items`) — auto-generates `item_code` from the category prefix (`ELEC-1`, `ELEC-2`, …), initializes `item_warehouse_stock`, enforces unique codes, and blocks deletion when transactions exist. `GET /api/items/:id` returns the full **item card** (recent movements, totals, last receiving/issuing vouchers, per-warehouse stock).
- **Unit conversions** (`unit-conversions`) — per-item conversion factors between units.

### 4.3 Inventory & Stock Control

- **Single source of truth:** `item_warehouse_stock.current_balance` is authoritative; `items.current_balance` is kept in sync.
- **Batches:** receiving vouchers with a `batch_number` create lot rows; issuing deducts from the named batch and validates sufficiency; batches carry `production_date` / `expiry_date`.
- **Alerts:** a DB trigger raises `low_stock`; a scheduled job (`alerts.repository.generateExpiryAlerts`) raises `expiry_warning` using each item's own `expiry_alert_days`; `overstock` and `pending_request` are also supported. Alerts are acknowledged/resolved via `PATCH /api/alerts/:id/acknowledge`.
- **Cycle counting:** `inventory` module opens a session that snapshots all active items in a warehouse, records physical counts, and on **close** automatically creates and approves an **ADJ** transaction for every variance.

### 4.4 Transactions & Stock Movements

Voucher types: **RV** (Receiving), **LN** (Issuing), **RTV** (Return to Vendor), **RTI** (Return from Issue), **ADJ** (Adjustment), **TRF** (Transfer).

- `POST /api/transactions` creates a **draft** (header + 1..500 line items). Business rules: LN requires a department; TRF requires a different destination warehouse.
- `POST /api/transactions/:id/approve` runs inside a **database transaction** with row locking (`FOR UPDATE`):
  1. Locks the voucher and rejects double approval.
  2. For **inbound** (RV, RTI) — adds to stock, updates `last_purchase_price` from the unit price.
  3. For **outbound** (LN, RTV) — deducts stock and fails with a precise `INSUFFICIENT_STOCK` message if the balance would go negative.
  4. For **TRF** — deducts from the source warehouse, adds to the destination, and moves batch quantities.
  5. For **ADJ** — applies the signed variance directly.
  6. Writes one `stock_movements` row per detail (before/change/after), updates batches, and posts a **journal entry** to `journal_entries` using configured accounting accounts (inventory, suppliers, expense prefix).
- All stock updates are atomic — partial approval is impossible.

### 4.5 Material Requests (`/api/requests`)

Full requisition workflow: **pending → approved → issued** (plus rejected / cancelled).

- **Create** (department managers or warehouse staff): line items, department, warehouse, `request_type` (`experiment` / `semester` / `project`), priority, and optional project link.
- **Approve / Reject** (warehouse ops) with a rejection reason.
- **Issue** (warehouse ops) — automatically **creates and approves an LN voucher**, then creates **custody records** for durable (non-consumable) items and links the transaction to the request.
- **Cancel** — the original requester or management may cancel a pending/approved request.

### 4.6 Projects & Custodies

- **Projects** (`projects`) — graduation/research projects with supervisor, department, and open/closed status. Closing is **blocked while active custodies exist**.
- **Custodies** (`custodies`) — durable items issued to staff are tracked; `POST /api/custodies/:id/return` creates + approves an **RTI** voucher (return to inventory) and marks the custody returned. This is the system's asset-lending loop: request → issue LN → custody → return RTI → back into stock.

### 4.7 Reporting & Settings

- **Inventory report** (`GET /api/reports/inventory`) — filterable by warehouse, category, active status, low-stock/overstock, and free-text search; includes per-item movement summaries and pagination.
- **Item card report** (`GET /api/reports/item-card/:id`) — detailed single-item history.
- **Stock movements** (`/api/stock-movements`) — filterable audit log.
- **Settings** (`/api/settings`) — key/value configuration for accounting accounts (`inventory_account`, `supplier_account`, `expense_account_prefix`) and `valuation_method`; admin-only updates.

### 4.8 System Infrastructure

- **Startup guards:** environment variables are validated with a Zod schema at boot; an `assertSafeEnv()` guard refuses to start with placeholder JWT secrets or with `production` pointing at `localhost`.
- **Centralized error handling:** typed error hierarchy (`AppError`, `NotFoundError`, `ValidationError`, `AuthError`, `ForbiddenError`, `ConflictError`) mapped to consistent JSON errors by a global handler.
- **Logging & observability:** structured request logger (adds `X-Request-Id`), leveled application logger, `/health` endpoint with DB connectivity check.
- **Localization:** `languageMiddleware` resolves `req.lang` from `?lang=` or `Accept-Language`; alert messages are stored bilingually (`message_ar` / `message_en`).

---

## 5. API Endpoint Overview

All routes are mounted under `/api`. **Standard response envelopes:**

- Success: `{ "success": true, "data": ... }` — lists additionally return `{ "items": [...], "pagination": { page, limit, total, totalPages } }`.
- Error: `{ "success": false, "error": { "message", "code", "details? } }`.
- Common status codes: `200` OK, `201` Created, `400` validation, `401` auth, `403` forbidden, `404` not found, `409` conflict, `500`/`503` server/DB errors.

| Group | Base path | Key endpoints |
|---|---|---|
| Auth | `/api/auth` | `POST /login`, `POST /refresh`, `POST /logout` (rate-limited) |
| Categories | `/api/categories` | CRUD (code-based) |
| Units | `/api/units` | CRUD (code-based) |
| Suppliers | `/api/suppliers` | CRUD |
| Departments | `/api/departments` | CRUD (code-based) |
| Warehouses | `/api/warehouses` | CRUD |
| Users | `/api/users` | CRUD (admin only for mutations) |
| Items | `/api/items` | `GET /`, `GET /generate-code/:categoryCode`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` |
| Unit conversions | `/api/unit-conversions` | CRUD + `GET /item/:itemId` |
| Transactions | `/api/transactions` | `GET /`, `GET /:id`, `POST /` (draft), `POST /:id/approve` |
| Stock movements | `/api/stock-movements` | `GET /`, `GET /item/:itemId`, `GET /transaction/:transactionId` |
| Material requests | `/api/requests` | `GET /`, `GET /:id`, `POST /`, `PATCH /:id/approve`, `/reject`, `/cancel`, `POST /:id/issue` |
| Projects | `/api/projects` | CRUD + `PATCH /:id/close` |
| Custodies | `/api/custodies` | `GET /`, `GET /:id`, `POST /:id/return` |
| Inventory | `/api/inventory` | `POST /sessions`, `GET /sessions/:id`, `POST /sessions/:id/count`, `POST /sessions/:id/close` |
| Batches | `/api/batches` | List batches |
| Alerts | `/api/alerts` | `GET /`, `GET /summary`, `PATCH /:id/acknowledge` |
| Reports | `/api/reports` | `GET /inventory`, `GET /item-card/:id` |
| Settings | `/api/settings` | `GET /`, `PUT /` (admin) |
| Docs & health | `/api/docs`, `/api/docs.json`, `/health` | Swagger UI, spec, health check |

---

## 6. Authentication & Authorization Flow

### Login flow

1. Client sends `{ username, password }` to `POST /api/auth/login`.
2. Controller validates the body (Zod), looks up the user, and rejects unknown usernames, inactive accounts (`AUTH_ACCOUNT_DISABLED`), and wrong passwords (`AUTH_INVALID_CREDENTIALS`).
3. On success, the server issues an **access token** (JWT signed with `JWT_SECRET`, payload `{ userId, username, role }`) and a **refresh token** (signed with `JWT_REFRESH_SECRET`, `type: 'refresh'`).
4. The refresh token hash is persisted in `refresh_tokens`; the client stores both tokens and sends the access token on subsequent calls.

### Protecting endpoints

1. `authenticate` middleware parses the `Authorization: Bearer <token>` header, verifies signature/expiry with `JWT_SECRET`, rejects refresh tokens used as access tokens, and attaches `req.user` (`{ userId, username, role }`).
2. `authorize([...roles])` then checks `req.user.role` against the allowed list and returns **403** if it doesn't match.

### Token refresh

- The client calls `POST /api/auth/refresh` with the refresh token.
- The server verifies the signature, checks the hashed value still exists and isn't revoked, then **rotates**: revokes the old token, issues a new access + refresh pair, and stores the new hash.
- A scheduled job deletes expired/revoked refresh tokens every 24h.

### Roles & typical permissions

| Role | Typical permissions |
|---|---|
| `system_admin` | Full access — user management, settings, deletes, everything |
| `warehouse_manager` | Warehouse operations + approvals, master-data CRUD, reports |
| `storekeeper` | Day-to-day stock operations: items, draft transactions, requests issue |
| `accountant` | Read access + reports + stock movements |
| `department_manager` | Create/approve own department's material requests & projects, view custodies |
| `viewer` | Read-only access to lists and dashboards |

Convenience groupings used in routes (`auth.middleware.ts`): `WAREHOUSE_OPS` (admin, warehouse_manager, storekeeper), `MANAGEMENT` (admin, warehouse_manager), `CAN_REQUEST` (admin, warehouse_manager, department_manager), `READ_ONLY`, `CAN_VIEW_REPORTS`.

Safety guard in the users module: the **last active `system_admin` cannot be disabled, demoted, or deleted**.

---

## 7. Setup & Deployment Instructions

### 7.1 Prerequisites

- Node.js 20+ and npm.
- PostgreSQL 15/16 (local or hosted, e.g. Neon/Supabase/RDS).

### 7.2 Environment variables (`.env`)

Copy `.env.example` to `.env` and fill in real values:

```dotenv
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
PORT=5000
JWT_SECRET=change_this_to_a_secure_random_secret_in_production   # ≥ 32 chars
JWT_REFRESH_SECRET=change_this_to_a_different_secure_random_secret # ≥ 32 chars
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGINS=http://localhost:5173,http://localhost:5000
```

> The server refuses to boot if `JWT_SECRET`/`JWT_REFRESH_SECRET` are still the placeholder values, or if `NODE_ENV=production` targets `localhost`.

### 7.3 Install, migrate, seed, run

```bash
npm install

# 1) Apply SQL migrations (tracks applied files + checksums in _migrations)
npm run migrate
#   useful variants:  npm run migrate -- --verify   (dry-run status)
#                     npm run migrate -- --down 015_add_location_tracking

# 2) Seed the database
npm run seed:admin      # creates admin / Admin@123  (idempotent)
npm run seed:demo       # basic demo data: categories, units, warehouses,
                        # suppliers, departments, users, items, conversions,
                        # 4 transactions with movements
npm run seed:demo:full  # comprehensive demo incl. batches, projects,
                        # custodies, requests, inventory sessions, alerts

# 3) Start development server (hot reload)
npm run dev
```

The server starts on `$PORT` (default 3000; the development environment uses **5000**), verifies the database connection, and logs:

```
Server running on port 5000 | DB: connected
```

### 7.4 Production build & containerized deployment

```bash
npm run build       # compiles to dist/
npm start           # node dist/server.js

# Or use Docker Compose (Postgres + backend)
docker compose up --build
```

- `Dockerfile` — multi-stage build (`node:20-alpine`), runs as non-root user, health-check on `/health`.
- `docker-compose.yml` — a Postgres 16 service (initialized from `schema.sql`) and the backend service on port 3000.
- The container healthcheck and `docker compose up` ready-state both rely on `/health`.

### 7.5 Testing

```bash
npm test
```

The suite (`tests/`) covers auth, categories, units, suppliers, departments, warehouses, users, items (+ requirements), transactions (+ approval), stock movements, unit conversions, material requests (project requests), projects (close), custodies (return), reports, alerts (expiry), and error cases — using Jest + Supertest. Tests expect `NODE_ENV=test` and a test database (`DATABASE_URL` in `.env.test`).

### 7.6 API documentation

With the server running, open:

- Swagger UI: `http://localhost:5000/api/docs`
- Raw spec: `http://localhost:5000/api/docs.json`
- Health check: `http://localhost:5000/health`

---

*End of report.*
