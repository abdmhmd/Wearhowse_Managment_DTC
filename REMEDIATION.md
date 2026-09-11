# WMS Remediation — Phase 0 (Safety Nets)

This repository is under remediation. Before any role-model change is executed the
codebase must be left in a **clean, stable, tested** state. Phase 0 provides these
safety nets; it does **not** change any role/permission/supplier logic.

## What Phase 0 delivered

| # | Item | Where |
|---|------|-------|
| 0.1 | TypeScript compiles with 0 errors | `src/modules/authorization/audit.service.ts` (extended `AuditAction` union) |
| 0.2 | `/my-custody` route reachable again | `permissions.ts` + `migrations/037_add_custodies_view_own.sql` (+ `.down.sql`) + `tests/authorization/custodies-view-own.test.ts` |
| 0.3 | Pre-remediation database backup | `scripts/backup-before-remediation.sh` |
| 0.4 | Test baseline | `remediation_phase0_test_baseline.txt` |
| 0.5 | Feature branch + commit | `remediation/role-model-v2` — `chore(remediation): phase 0 safety nets` |

Full account: see **`PHASE0_REPORT.md`** (project root).

## Backup (Task 0.3)

Before any future migration or data change, take a backup:

```bash
# Linux / Git Bash:
scripts/backup-before-remediation.sh

# With an explicit connection string:
DATABASE_URL="postgresql://postgres:123456@localhost:5432/DTC_WMS_final_db?sslmode=disable" \
  scripts/backup-before-remediation.sh
```

Output: `backend/backups/pre-remediation_<stamp>.sql` (plain SQL, `pg_dump --no-owner --no-privileges`).
Restore with:

```bash
psql "postgresql://postgres:123456@localhost:5432/DTC_WMS_final_db?sslmode=disable" \
  -f backend/backups/pre-remediation_<stamp>.sql
```

> Windows note: `pg_dump` ships at `C:\Program Files\PostgreSQL\<ver>\bin\pg_dump.exe`.
> A verification backup was produced during Phase 0
> (`backend/backups/pre-remediation_backup.sql`, ~150 KB). `backups/` is git-ignored.

## Migration ledger hazards (pre-existing — NOT fixed in Phase 0)

The migration runner (`scripts/run-migrations.ts`) verifies checksums of applied
files against the current contents on disk and aborts on mismatch unless `--force`.

- Migrations **019** and **029** were edited on disk **after** being applied.
- The **main DB** ledger already matches current disk content (its checksums were
  re-recorded at some earlier point) — the **test DB** did not match; applying
  migration 037 to the test DB therefore required `--force`, which **re-records**
  checksums for 019/029 **without re-running their SQL**. The test-DB schema still
  carries the pre-edit version of those two migrations.
- **Reconcile in Phase 1:** confirm what actually lives in each database before
  building further on 019/029, and consider a fresh `--force`/dedicated alignment
  migration so ledger, disk and schema agree everywhere.

## Migration numbering

- `037` — `custodies:view_own` permission (Phase 0, applied).
- The role-model rename migration (7 → 4 roles) is **038**.

## Phase roadmap (do not run outside its phase)

- **Phase 1 (P1)** — Role rename to `admin`, `sub_warehouse_manager`,
  `department_manager`, `supervisor` on branch `feature/role-model-remediation`.
- Later phases follow the remediation plan in `role_model_code_audit.md`.