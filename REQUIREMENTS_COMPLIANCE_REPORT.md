# WMS Extension — Compliance & Verification Report
# تقرير المطابقة والتحقق — توسعة نظام إدارة المخازن

**Date / التاريخ:** 2026-08-02
**Scope / النطاق:** Backend + Frontend extension (items fields, expiry alerts, projects, custodies, request types, RTI return flow, UI)

---

## 1. Executive Summary / الملخص التنفيذي

**EN**
All extension requirements are implemented and verified. The backend test suite passes fully (152/152 tests, 22/22 suites). Both backend TypeScript compile and frontend production build pass. Two frontend spec items were completed during this audit (project-close custody warning, RTI voucher display), and three remaining test-suite failures were resolved (one real bug in the inventory report, one soft-delete consistency fix, and stale assertions updated to the current contracts). The only tooling gap is frontend lint: `oxlint` is declared in `package.json` but not installed (no `eslint` fallback either); this is pre-existing and does not affect the build.

**AR**
جميع متطلبات التوسعة منفّذة وتم التحقق منها. مجموعة اختبارات الواجهة الخلفية ناجحة بالكامل (152/152 اختبارًا، 22/22 مجموعة). يمرّ تجميع TypeScript للواجهة الخلفية وبناء الإنتاج للواجهة الأمامية بنجاح. أُنجزت خلال هذا التدقيق نقطتان من متطلبات الواجهة الأمامية (تحذير العهود عند إغلاق المشروع، عرض رقم إذن الإرجاع RTI)، وحُلّت ثلاث حالات فشل متبقية في الاختبارات (خلل فعلي في تقرير الجرد، وإصلاح اتساق للحذف الناعم، وتحديث تأكيدات قديمة لتتوافق مع العقود الحالية). الفجوة الوحيدة في الأدوات هي فحص الأكواد الأمامي: `oxlint` مُعلن في `package.json` لكنه غير مثبّت (ولا يوجد بديل `eslint`)؛ وهي فجوة سابقة ولا تؤثر على البناء.

---

## 2. What was verified / ما تم التحقق منه

**Checked files (main) / الملفات الرئيسية التي تم فحصها:**
- Backend: `src/modules/{items,categories,transactions,material-requests,projects,custodies,alerts,reports,users,settings,inventory,batches}/*`, `src/app.ts`, `src/server.ts`, migrations 002–014, tests in `tests/`.
- Frontend: `src/App.tsx`, `src/components/layout/{Sidebar,ProtectedRoute,Topbar}.tsx`, `src/pages/{items,material-requests,projects,custodies,transactions,reports,settings}/*`, `src/hooks/use{Projects,Custodies,MaterialRequests,Settings}.ts`, `src/api/*`, `src/types/index.ts`, `src/locales/{en,ar}/translation.json`.

**How / المنهجية:** static review + automated checks (typecheck, production build, full Jest suite against a local PostgreSQL copy of the schema), plus an independent sub-agent frontend audit.

---

## 3. Requirements Audit / جدول مطابقة المتطلبات

| # | Requirement / المتطلب | Status / الحالة | Evidence / الدليل |
|---|------------------------|-----------------|-------------------|
| 1 | **Database:** items get new fields — `is_consumable`, `expiry_alert_days`, `sap_material_number`, `gl_account` | ✅ Implemented | `migrations/012_new_requirements.sql`; persisted in `items.service.ts`; `tests/items/items-requirements.test.ts` (create/get/update/delete round-trip) |
| 2 | **Items & Alerts:** consumable flag on create/edit forms; expiry alerts per item (`expiry_alert_days`), alert list + acknowledge | ✅ Implemented | `src/modules/alerts/*`, `migrations/009_alerts.sql`; `tests/alerts/expiry-alerts.test.ts` (only items in window alert; idempotent); frontend item forms + `AlertsPage` |
| 3 | **Material Requests:** `request_type` (experiment/semester/project) with project linking (`project_id`, project_no/name) in validator, service, repository | ✅ Implemented | `src/modules/material-requests/*`; `tests/material-requests/project-request.test.ts` (validator requires project for `project` type; join fields; request_count) |
| 4 | **Requests & Logic:** approve / reject / cancel / issue with stock deduction, automatic custody creation for durable items | ✅ Implemented | `material-requests.service.ts`; `tests/custodies/custodies.test.ts` (consumable→no custody, durable→active custody) |
| 5 | **Projects:** list, create, edit, close (blocked while active custodies exist), delete | ✅ Implemented | `src/modules/projects/*`; `tests/projects/projects-close.test.ts` (close blocked with active custody, succeeds after return); `active_custodies` count added to list/detail |
| 6 | **Custodies:** list active/returned with filters; auto-created on issue; return action creates + approves an RTI transaction and marks the custody returned | ✅ Implemented | `src/modules/custodies/*`, `tests/custodies/custody-return.test.ts` (RTI approved, custody returned with links, double-return throws) |
| 7 | **RTI Return Flow:** return-to-inventory transaction created and approved atomically, linked to the custody | ✅ Implemented | `custodies.service.ts::returnItem` (returns `transaction_id` + `transaction_no`); `approveTransaction.test.ts` |
| 8 | **UI & Navigation:** routes for Projects, Custodies, Material Requests (+ create/detail) with role guards; sidebar entries; Arabic/English labels | ✅ Implemented | `App.tsx`, `Sidebar.tsx`, `ProtectedRoute.tsx`; all new pages present; translations in `locales/{en,ar}` |
| 9 | **UI — Projects:** close confirm dialog warns about active custodies before closing | ✅ Implemented (completed in this audit) | `ProjectsPage.tsx` — `closeCustodyWarning` with live `active_custodies` count |
| 10 | **UI — Custodies:** return action surfaces the RTI voucher number on success + Return Voucher column | ✅ Implemented (completed in this audit) | `useCustodies.ts` toast `RTI #<no>`; `CustodiesPage.tsx` Return Voucher column |
| 11 | **UI — Items form:** consumable + alert-days fields surfaced | ✅ Implemented | `ItemsPage.tsx` create/edit form; `items.schema.ts`; `ITEM_TYPE_LABELS` added to `types/index.ts` |

---

## 4. Automated Checks Results / نتائج الفحوصات الآلية

| Check / الفحص | Result / النتيجة |
|---------------|------------------|
| Backend typecheck (`npm run build` → `tsc`) | ✅ PASS |
| Backend test suite (Jest, local DB) | ✅ **152/152 tests, 22/22 suites passed** |
| Frontend typecheck + production build (`tsc -b && vite build`) | ✅ PASS (only pre-existing 630 kB chunk-size warning) |
| Frontend lint (`npm run lint` → `oxlint`) | ❌ FAIL — `oxlint` not installed (pre-existing; no eslint fallback) |

**Note / ملاحظة:** the remote Neon test DB (`.env.test`) is unreachable from this machine, so the suite is run against a local PostgreSQL copy of the schema (loading `.env.test` vars, overriding `DATABASE_URL` from `.env`). Migration `014_users_department.sql` must be applied.

---

## 5. Issues found & fixed during the audit / مشكلات اكتشفت وعولجت

1. **Real bug — inventory report** (`inventoryReport.service.ts`): the inventory report omitted `warehouse_id` and `category_code` from rows. Added both columns to the SELECT.
2. **Consistency fix — users soft delete** (`users.repository.ts`): `findById` now filters `is_active = true`, matching `findAll`/`countAll`/`findByDepartment`, so deleted users are hidden from `GET /users/:id` (login already checks `is_active`).
3. **Stale tests updated to current (correct) contracts:** integration (`/health`→`healthy`, missing transaction→404, accountant reports→200), `env-required` (32-char JWT_SECRET requirement, database module now throws without `DATABASE_URL`), `auth.test.ts` and `error-cases.test.ts` (controllers/middleware use the `next(err)` contract; validation asserted at the validator layer), `unit-conversions` delete (soft delete leaves an `is_active=false` row).

---

## 6. Remaining issues / blockers / المشكلات المتبقية

1. **Frontend lint unavailable** — `oxlint` declared but not installed; no `eslint` config/install. Low risk; build and typecheck pass. Install `oxlint` (`npm i -D oxlint`) or add ESLint to enable the `lint` script.
2. **Remote test DB (Neon) unreachable** — tests must run against local PostgreSQL; CI would need a reachable DB.
3. **Bundle size warning** (630 kB) — cosmetic; code-splitting recommended for larger apps.
4. **Minor API deviation:** `Custody` frontend type uses flattened fields (`item_code`, `warehouse_name_ar`, `project_no`, …) instead of nested `item`/`warehouse`/`project` objects — acceptable for the current UI.

---

## 7. Conclusion / الخلاصة

**EN:** The extension is complete and verified against the requirements: all database, service, transaction, and UI layers are implemented, tested (152/152), and build cleanly. The two previously-missing UI behaviors (close-with-custody-warning, RTI voucher display) are now in place.
**AR:** التوسعة مكتملة ومتحقق منها وفق المتطلبات: جميع طبقات قاعدة البيانات والخدمات والمعاملات وواجهة المستخدم منفّذة ومختبرة (152/152) وتمر بالبناء بنجاح. السلوكان الناقصان سابقًا في الواجهة (التحذير عند الإغلاق مع العهود النشطة، وعرض رقم إذن الإرجاع) أصبحا جاهزين الآن.
