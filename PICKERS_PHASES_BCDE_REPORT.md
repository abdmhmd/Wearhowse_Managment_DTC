# SearchableSelect Pickers — Phases B/C/D/E Report

Branch: `remediation/role-model-v2`
Date: 2026-09-14

## Commits

| # | Hash | Message | Key Files |
|---|------|---------|-----------|
| 1 | `8987deb` | `feat(frontend): use SearchableSelect for warehouse dropdowns` | CreatePurchaseRequestPage, CreatePurchaseOrderPage, ItemsPage, ReportsPage, en/ar translation.json |
| 2 | `fe8b617` | `feat(frontend): use SearchableSelect for department dropdowns` | WarehousesPage, SupervisorsPage, CreateTransactionPage |
| 3 | `cb91813` | `feat(frontend): use SearchableSelect for user dropdowns` | ProjectsPage |
| 4 | `7f93c53` | `feat(frontend): use SearchableSelect for project dropdowns` | CreateMaterialRequestPage |
| 5 | `8250740` | `test(frontend): add coverage for new pickers` | warehouses.test, purchase-requestCreateForm.test, purchase-requests-form.test, projects-form.test, material-requests-form.test |

> **File-layer note:** Some files contain picker changes from multiple phases (e.g. `ProjectsPage` includes department, warehouse and supervisor pickers; `CreateTransactionPage` includes warehouse and LN-department pickers). To allow clean per-phase commits at file level, those mixed files were placed in the commit whose message best describes their *primary new* picker, with the report documenting exact locations per phase.

## Locations Updated (by Phase)

### Phase B — Warehouses

| File | Component / Picker | `id` / `aria-label` | Notes |
|------|-------------------|---------------------|-------|
| `CreatePurchaseRequestPage.tsx` | Warehouse | `pr-warehouse` / `t('pages.purchaseRequests.warehouse')` | Filtered to department-owned main warehouses; bilingual label `code — name`, sublabel department name. |
| `CreatePurchaseOrderPage.tsx` | Warehouse (admin) | `po-warehouse` / `t('pages.purchaseOrders.receivingWarehouse')` | Only shown to admin; options include all warehouses with dept sublabel. |
| `ItemsPage.tsx` | Warehouse (create + edit forms) | `item-warehouse` / `t('form.warehouse')` | `replaceAll` to replace both create and edit warehouse Select blocks; filter-bar warehouse select also replaced. |
| `ItemsPage.tsx` | Warehouse (filter bar) | (filter-bar area) | Inline filter; no additional id/aria needed. |
| `ReportsPage.tsx` | Warehouse (filter) | (via aria-label) `reports.warehouse` / `t('reports.warehouse')` | Replaces the native warehouse filter `<select>`. |
| `ProjectsPage.tsx` | Warehouse | `pj-warehouse` / `t('pages.projects.warehouse')` | Options drawn from `warehousesForDept(department_id)`; disabled when editing as department-manager; sublabel shows department name. |
| `CreateTransactionPage.tsx` | Warehouse (header) | `tx-warehouse` / `t('form.warehouse')` | Required warehouse; sublabel shows department name. |
| `CreateMaterialRequestPage.tsx` | Warehouse | `mr-warehouse` / `t('pages.materialRequests.warehouse')` | Only for admin/sub-WM; derives department automatically on selection via `handleWarehouseChange`. |

### Phase C — Departments

| File | Component / Picker | `id` / `aria-label` | Notes |
|------|-------------------|---------------------|-------|
| `WarehousesPage.tsx` | Department (create/edit form) | `wh-department` / `t('pages.warehouses.department')` | Sentinel `''` for "Central (No Department)" mapped to `null` on submit via Zod `departmentIdField` preprocess; placeholder shown on fresh create. |
| `WarehousesPage.tsx` | Department (filter bar) | `wh-filter-department` / `t('pages.warehouses.filterByDepartment')` | No sentinel option (no central filter available); `''` maps to `ALL`. |
| `SupervisorsPage.tsx` | Department (admin create) | `sup-department` / `t('form.department')` | Admin-only; options numeric value → department id. |
| `CreateTransactionPage.tsx` | Department (LN header) | `tx-department` / `t('form.department')` | Only shown for LN transaction type; numeric department id. |
| `ProjectsPage.tsx` | Department (create) | `pj-department` / `t('pages.projects.department')` | Shown only when create mode and user is not warehouse-manager/supervisor; numeric id. |

### Phase D — Users / Supervisors

| File | Component / Picker | `id` / `aria-label` | Notes |
|------|-------------------|---------------------|-------|
| `ProjectsPage.tsx` | Supervisor | `pj-supervisor` / `t('pages.projects.supervisor')` | Options: `useSupervisors()` filtered role `supervisor`; label `full_name — username`; sublabel `getLocalizedRoleLabel(role)` ("Supervisor"). |

### Phase E — Projects

| File | Component / Picker | `id` / `aria-label` | Notes |
|------|-------------------|---------------------|-------|
| `CreateMaterialRequestPage.tsx` | Project | `mr-project` / `t('pages.materialRequests.project')` | Shown only when request_type === "project"; label `project_no — name`; sublabel `supervisor_name`; cleared value stored as `''` (sent to backend as `null`). |

### Native `<select>` Controls Left Intentionally

| Control | File | Reason (kept <10 items / other constraint) |
|---------|------|------------------------------------------|
| Type filter (Main/Sub) | WarehousesPage | 2 options. |
| Category filter | ItemsPage | ~6 categories. |
| Request type (experiment/semester/project) | CreateMaterialRequestPage | 3 options. |
| Priority (low/normal/high/urgent) | CreateMaterialRequestPage | 4 options. |
| Department (read-only derived) | CreateMaterialRequestPage | Disabled; derives from selected warehouse. |
| Status filters | CustodiesListPage, PurchaseRequestsListPage, MaterialRequestsListPage, TransactionsListPage | 2–9 status options. |
| Type filters | TransactionsListPage | 6 transaction types. |
| Status filter | ProjectsPage | 4 statuses. |
| Return condition | CustodyReceiveDialog | 3 options. |
| Role | UsersPage | 4 roles. |
| Items / Categories / Units selects | ItemsPage, CreateMaterialRequestPage (line items) | Short lists; residual note: may be worth replacing in a future sweep if list grows. |
| Language | SettingsPage | 2 options. |

## i18n Coverage

All picker labels/placeholders added to both `en/translation.json` and `ar/translation.json` under `components`:

| Key | EN | AR |
|-----|----|----|
| `components.warehousePicker.placeholder` | Select warehouse | اختر مستودعاً |
| `components.warehousePicker.searchPlaceholder` | Search warehouse... | ابحث عن مستودع... |
| `components.warehousePicker.emptyMessage` | No warehouses found | لا توجد مستودعات |
| `components.departmentPicker.placeholder` | Select department | اختر قسماً |
| `components.departmentPicker.searchPlaceholder` | Search department... | ابحث عن قسم... |
| `components.departmentPicker.emptyMessage` | No departments found | لا توجد أقسام |
| `components.departmentPicker.noDepartment` | No department (Central) | بدون قسم (مركزي) |
| `components.userPicker.placeholder` | Select user | اختر مستخدماً |
| `components.userPicker.searchPlaceholder` | Search user... | ابحث عن مستخدم... |
| `components.userPicker.emptyMessage` | No users found | لا يوجد مستخدمون |
| `components.projectPicker.placeholder` | Select project | اختر مشروعاً |
| `components.projectPicker.searchPlaceholder` | Search project... | ابحث عن مشروع... |
| `components.projectPicker.emptyMessage` | No projects found | لا توجد مشاريع |

## Tests

| Test File | Env | Tests | Coverage |
|-----------|-----|-------|----------|
| `warehouses.test.tsx` (updated) | happy-dom | 6 | Department filter via SearchableSelect; create-form department picker renders Central/IT; select updates; central null submission; main-warehouse conflict; type filter stays native. |
| `purchase-requestCreateForm.test.tsx` (updated) | happy-dom | 4 | Warehouse SearchableSelect interaction inside create modal; form validation; line item handling; submit payload. |
| `purchase-requests-form.test.tsx` (new) | happy-dom | 2 | Warehouse picker options rendered (bilingual + department sublabel); selection updates trigger. |
| `projects-form.test.tsx` (new) | happy-dom | 3 | Supervisor picker options (full_name — username + role sublabel); selection; department picker options rendered. |
| `material-requests-form.test.tsx` (new) | happy-dom | 2 | Project picker hidden until request_type=project; options (project_no — name + supervisor sublabel); selection updates trigger. |

**Baseline:** 15 files / 119 tests.
**After:** 18 files / 126 tests (7 net new).
**All tests pass; `tsc -b --noEmit` and `vite build` clean.**

## Residual Notes

- **`''` sentinel pattern:** WarehousePage and CreateMaterialRequestPage use an `''` sentinel option for "no department" / "no project" to allow RHF to store `null` on submit while still matching a SearchableSelect option value. The schema Zod preprocess (`departmentIdField`) maps `''` → `null` on validation.
- **Items / Categories / Units:** Native `<select>` controls remain in the item line forms. These are short lists (<10 typical items); could be migrated in a future pass.
- **Backend untouched:** No backend changes. All frontend-only.
- **Deployment deliverables:** Not committed in this series; still pending user decision.
