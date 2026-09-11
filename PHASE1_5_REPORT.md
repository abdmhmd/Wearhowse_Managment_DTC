---
title: "Phase 1.5 — Admin Passthrough Column Investigation Report"
version: "1.0"
date: "2026-09-11"
branch: "remediation/role-model-v2"
base_commit: "de14eea"
tags: [phase-1.5, schema-audit, migration, phantom-columns, wms]
---

# PHASE1_5_REPORT

## 1. Column Investigation

### 1.1 The Claim

`PHASE1_REPORT.md` §3 disclosed that migration 038 "Adds legacy passthrough
columns `admin_username` / `admin_password_hash` to `users`". Phase 1.5 was
tasked with determining whether those columns are justified or should be
removed.

### 1.2 Evidence Collected

| # | Check | Result |
|---|---|---|
| 1 | Read `migrations/038_role_model_rename.sql` (full, committed) | **No `admin_username` / `admin_password_hash` anywhere** — 132 lines, only enum recreation, `roles` table rename, `_migration_notes` ledger, and `token_version` bump |
| 2 | Read `migrations/038_role_model_rename.down.sql` (full, committed) | **No references** — 85 lines, reverses the rename and drops the ledger only |
| 3 | `git show 322c254:migrations/038_role_model_rename.sql` | Identical to disk; only `ALTER TABLE users ALTER COLUMN role …` statements reference `users` — **no `ADD COLUMN`** |
| 4 | Search ALL migrations (001–038 + archive) for `admin_username`/`admin_password_hash` | **0 matches** |
| 5 | Grep backend `src/` + `scripts/` + `tests/` for either column | **0 matches** |
| 6 | Grep `WMS_Frontend/` for either column | **0 matches** |
| 7 | `information_schema.columns` for `users` on **both** DBs (`DTC_WMS_final_db`, `dtc_wms_test`) | Columns are exactly: `id, username, password_hash, full_name, role, department_id, is_active, created_at, updated_at, token_version` — **the passthrough columns do not exist** |
| 8 | `_migrations` checksum for 038 on both DBs | `57edddf2e8a0f72d…` — sha256 of the on-disk file recomputed locally = `57edddf2e8a0f72d` — **exact match**, so the applied migration is the file we audited (no hidden divergence) |
| 9 | Repo-wide search (all `.md` docs incl. `REMEDIATION.md`, `PROJECT_REPORT.md`, handover reports) | Only match is the (now-corrected) `PHASE1_REPORT.md` claim |

### 1.3 Reference Table

| Reference | File | Line | Type (read/write) | Real usage? |
|---|---|---|---|---|
| `admin_username` | `PHASE1_REPORT.md` | 49 (pre-correction) | documentation claim | **No** — never implemented |
| `admin_password_hash` | `PHASE1_REPORT.md` | 49 (pre-correction) | documentation claim | **No** — never implemented |
| `admin_username` / `admin_password_hash` | `0322c254` commit message | — | git message | **No** — descriptive text only |
| either column | any migration file | — | — | No match |
| either column | backend `src/` | — | — | No match |
| either column | backend `scripts/` | — | — | No match |
| either column | backend `tests/` | — | — | No match |
| either column | frontend `src/` | — | — | No match |
| either column | `users` table, either DB | — | schema | Column absent |

## 2. Justification Verdict

**Verdict: PHANTOM — the columns do not exist.** They are neither justified
nor unjustified *schema*: they were described in `PHASE1_REPORT.md` and in the
migration-038 commit message but were **never added by any migration and never
existed in any database**. Classification per the task's taxonomy: **C (not
referenced anywhere — dead schema)**, with the stronger finding that there is
no schema to clean at all.

Evidence:
- Both DBs' `users` tables expose the same 10 standard columns; the two
  passthrough columns are absent from `information_schema`.
- The migration file is byte-for-byte the applied one (checksum
  `57edddf2e8a0f72d…` matches on disk and in `_migrations` on both DBs),
  and it contains no `ADD COLUMN` / `DROP COLUMN` statement.
- Zero references in code, scripts, tests, migrations, or any documentation
  other than the report/commit-message claim itself — which was corrected.

## 3. Action Taken

1. **No migration 039 created.** A `DROP COLUMN` migration would target
   columns that do not exist; it is neither executable (without `IF EXISTS`
   noise) nor warranted. Creating it would add schema risk for zero benefit.
   This satisfies the task rule "If removal is risky, prefer keeping +
   documenting over breaking things" — here the safest and only correct action
   is documentation correction.
2. `PHASE1_REPORT.md` §3 was **corrected** in place:
   - Removed the false `admin_username` / `admin_password_hash` bullet.
   - Corrected the enum description (`DROP TYPE`/`CREATE TYPE` guarded block,
     not `ALTER TYPE … RENAME VALUE`).
   - Removed the false "Update triggers" bullet (038 touches no triggers;
     the only `users` trigger/index predates it in `001_initial_schema.sql`).
   - Stated explicitly that 038 adds/drops no columns on existing tables.
   - Added a "Correction (Phase 1.5)" note pointing to this report.
   - Fixed DB names (`DTC_WMS_final_db`, `dtc_wms_test`) in the section.
3. No in-flight code was touched because no code references the columns.

## 4. Additional Schema Drift Findings

Migration 038 (as applied) was audited statement-by-statement against the
disclosure in `PHASE1_REPORT.md`:

| # | What 038 actually does | Disclosed? | Drift verdict |
|---|---|---|---|
| 1 | Creates `_migration_notes` table (ledger) | Yes | **Harmless** — disclosed, snapshots roles/role_permissions/renames |
| 2 | `users.role`: drop default → VARCHAR → data UPDATE → enum recreate → user_role | Yes (description now corrected) | **Harmless** — disclosed; no columns added/dropped |
| 3 | `roles` table: rename active codes, delete legacy rows (with their zero `role_permissions`) | Yes | **Harmless** — disclosed |
| 4 | `users.token_version` bump for every renamed user | Yes | **Harmless** — disclosed (session revocation) |
| 5 | `users` triggers / indexes / constraints | **None** | **Harmless** — 038 touches none; the only `users` trigger (`trg_users_updated_at`) and indexes (`idx_users_department`, `idx_users_is_active`) come from `001_initial_schema.sql` |
| 6 | Tables created silently | **None** besides `_migration_notes` | **Harmless** — none |
| 7 | Columns added/dropped on existing tables | **None** | **Harmless** — the passthrough claim (the only drift) was a documentation error, now corrected |

**Drift verdict: all clean.** The only finding is the phantom-columns
disclosure, which was a documentation error, not a schema change.

## 5. Verification

| Check | Result |
|---|---|
| Backend `npx tsc --noEmit` | clean |
| Backend `npm test` | **57/57 suites, 536/536 tests passed** |
| Frontend `npx tsc --noEmit` | clean |
| Frontend `npx vitest run` | **3/3 files, 26/26 tests passed** |
| Frontend `npx vite build` | success (~3.2s) |
| Migration 039 created/applied | N/A — **not created** (nothing to drop) |
| Migration 038 checksum still locked on both DBs | yes (`57edddf2e8a0f72d…`) |

## 6. Commit(s) Created

| Commit | Message | Files |
|---|---|---|
| `(this change)` | `docs(reports): correct phase 1 report — admin passthrough columns were never implemented` | `PHASE1_REPORT.md`, `PHASE1_5_REPORT.md` |

Notes on history:
- Commit `322c254`'s message ("…adds legacy columns (admin_username,
  admin_password_hash)…") contains the same stale claim. It is left
  untouched — rewriting history is out of scope; this report and the corrected
  `PHASE1_REPORT.md` supersede it in the working tree and any future audit.

## 7. Phase 2 Readiness

- [x] Schema is free of unexplained columns — **columns never existed; no unexplained schema remains**
- [x] All drift investigated — 038 fully audited; only finding was the documentation error, corrected
- [x] Tests still green — 536/536 backend, 26/26 frontend
- [x] tsc still clean — backend + frontend
- [x] Migration checksums intact — 038 locked on both DBs
- **Verdict: READY FOR PHASE 2**