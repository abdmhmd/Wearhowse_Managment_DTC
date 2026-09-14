# Users — Department Field with Role-Based Validation

**Commit:** `270abdf` — `feat(users): add department field with role-based validation`
**Branch:** `remediation/role-model-v2`

## What changed

The user create/edit form now assigns a **Department** to every non-admin user.

### Files changed

Backend (`WMS_Managment_Backend`):
- `src/modules/users/users.service.ts` — service-level guard on `create` and `update`: any non-`admin` role must keep a `department_id`. Enforced against the **final** user state on edit (role and/or department may change in one request). Throws 400 with code **`DEPARTMENT_REQUIRED_FOR_ROLE`**. Also reuses a single current-role lookup for the last-admin and warehouse guards.
- `src/modules/users/users.validator.ts` — removed the old department-required `superRefine` (it only fired for department_manager/supervisor and surfaced a generic `VALIDATION_ERROR`). The service now enforces the uniform rule with the coded error so the HTTP response carries `DEPARTMENT_REQUIRED_FOR_ROLE`.
- `scripts/fix-users-missing-department.ts` — idempotent data-migration script (see Data fix).

Frontend (`WMS_Frontend/src`):
- `pages/users/UsersPage.tsx` — department field is now a **SearchableSelect** present in the create and edit forms:
  - **admin** → field disabled and cleared (submitted as `null`).
  - **sub_warehouse_manager / department_manager / supervisor** → required; inline bilingual error on submit.
  - Edit pre-fills the department; the edit submit now sends `department_id` always (clears it for admin) and re-checks the final role/department on the client.
  - Warehouses group now shows for `sub_warehouse_manager` **or** `supervisor` (was WM-only) and gets a help hint.
  - `handleUpdate` guard mirrors the backend rule client-side (no round-trip for the obvious case).
- `schemas/users.schema.ts` — required-department refine applies to **all** non-admin roles; Zod messages are i18n keys.
- `utils/apiErrors.ts` — maps `DEPARTMENT_REQUIRED_FOR_ROLE` → translated message.
- `locales/en|ar/translation.json` — new `pages.users.*` keys: `department`, `departmentPlaceholder`, `departmentSearchPlaceholder`, `departmentHelp`, `departmentRequiredForRole`, `warehousesHelp`.

### Validation rules
| Role | Department | Warehouses |
| --- | --- | --- |
| `admin` | not required (always `null`) | hidden |
| `sub_warehouse_manager` | **required** | allowed (WM: at least one) |
| `department_manager` | **required** | hidden |
| `supervisor` | **required** | allowed (optional) |

### Data fix (`DTC_WMS_final_db`)
Two active users were missing a department (would now block edits). Fixed after confirmation:
- `md_wh` (sub_warehouse_manager) → `department_id = 16` (`MD`) — its only warehouse is `MD_W` (dept 16).
- `hamza_subw` (sub_warehouse_manager) → `department_id = 6` (`IT-Deap`) — its only warehouse is `IT-Wearhowse` (dept 6).

Verification: 0 users remain in `(sub_warehouse_manager, department_manager, supervisor)` with `department_id IS NULL`. Admins correctly keep `department_id = NULL`.

### Tests
- Backend: **66 suites / 632 passed** (628 → 632; +4 in `tests/users/users-department-required.test.ts` covering create-400, create-201, demote-admin-400, update-200). 3 existing suites updated to comply with the new rule (`users.test.ts`, `users-admin-crud.test.ts`, `authorization/scope-regressions.test.ts`).
- Frontend: **15 files / 119 passed** (114 → 119; new `src/__tests__/users-form.test.tsx`: admin without department, WM blocked without department, WM with selected department, edit pre-fill, role→admin disables department).
- Typechecks + production build pass on both sides.

## Manual verification
1. Build & run backend (`npm run build; npm start`) and frontend (`npm run dev`).
2. As **admin**: Users → Create User → role = Warehouse Manager → submit without a department → inline "القسم مطلوب لهذا الدور / Department is required for this role".
3. Pick a department, save → row appears with the department; API returns `201`.
4. Edit a Warehouse Manager → department pre-filled; switching the role to **System Admin** disables and clears it; Save sends `department_id: null`.
5. Log in as `md_wh` and `hamza_subw` → department-scoped access works after the data fix.

Note: repo-root deployment deliverables (`src/app.ts` health endpoint, `.env.production.example`, `scripts/*.ps1`, `DEPLOYMENT_*.md`) remain **uncommitted** awaiting your decision.