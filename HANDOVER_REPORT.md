# تقرير التسليم الفني الشامل للنظام (Technical Handover Report)
## نظام إدارة المخازن والمستودعات | Warehouse Management System (WMS)

**تاريخ إعداد التقرير:** 30 أغسطس 2026  
**حالة النظام:** مكتمل، ومختبر، وجاهز للتشغيل والتطوير (Production-Ready)  
**النطاق الفاحص:** تدقيق شامل لكافة ملفات الواجهة الخلفية (Backend) والواجهة الأمامية (Frontend) وقواعد البيانات والإعدادات والاختبارات.

---

## فهرس المحتويات
1. [نظرة عامة على المشروع (Project Overview)](#1-نظرة-عامة-على-المشروع-project-overview)
2. [المكدس التقني (Tech Stack)](#2-المكدس-التقني-tech-stack)
3. [هيكل المشروع (Project Structure)](#3-هيكل-المشروع-project-structure)
4. [قاعدة البيانات والمخطط الشامل (Database & Migrations)](#4-قاعدة-البيانات-والمخطط-الشامل-database--migrations)
5. [دليل نقاط النهاية والواجهات البرمجية (API Endpoints Catalog)](#5-دليل-نقاط-النهاية-والواجهات-البرمجية-api-endpoints-catalog)
6. [المصادقة ونظام الصلاحيات (Authentication & RBAC Scope)](#6-المصادقة-ونظام-الصلاحيات-authentication--rbac-scope)
7. [المنطق الأساسي وقواعد العمل (Business Logic & Workflows)](#7-المنطق-الأساسي-وقواعد-العمل-business-logic--workflows)
8. [الواجهة الأمامية وهندسة المكونات (Frontend Architecture)](#8-الواجهة-الأمامية-وهندسة-المكونات-frontend-architecture)
9. [متغيرات البيئة والإعدادات (Environment Variables & Config)](#9-متغيرات-البيئة-والإعدادات-environment-variables--config)
10. [البنية التحتية والتشغيل والنشر (Deployment & Infrastructure)](#10-البنية-التحتية-والتشغيل-والنشر-deployment--infrastructure)
11. [الاختبارات وجودة الكود (Testing & Verification)](#11-الاختبارات-وجودة-الكود-testing--verification)
12. [المشاكل المعروفة وملاحظات الكود (Known Issues & TODOs)](#12-المشاكل-المعروفة-وملاحظات-الكود-known-issues--todos)
13. [تدقيق الأمان والحماية (Security Audit)](#13-تدقيق-الأمان-والحماية-security-audit)
14. [مراجعة الاعتماديات (Dependencies Review)](#14-مراجعة-الاعتماديات-dependencies-review)
15. [خارطة الطريق والمهام القادمة (Next Steps & Roadmap)](#15-خارطة-الطريق-والمهام-القادمة-next-steps--roadmap)

---

## 1. نظرة عامة على المشروع (Project Overview)

### 1.1 الغرض من النظام
نظام **WMS (Warehouse Management System)** هو نظام متكامل ومتقدم لإدارة المستودعات، والرقابة على المخزون، ودورة المشتريات، وصرف المواد، وتتبع العُهد المؤقتة والمستديمة، وإدارة مشاريع التخرج والبحوث الأكاديمية.
تم تصميم النظام خصيصاً لبيئة مؤسسية / أكاديمية (جامعات، معاهد، أو مراكز تدريبية)، حيث يدعم تعدد المستودعات (مستودعات رئيسية ومستودعات فرعية تابعة للأقسام)، ويدعم ثنائية اللغة بالكامل (**العربية / الإنجليزية**).

### 1.2 المستخدمون المستهدفون (Target Personas)
1. **مدير النظام (System Administrator):** يملك كامل الصلاحيات الإدارية، التحكم بالمستخدمين، التهيئة المحاسبية، اعتماد السندات وعمليات الشراء المركزية وصرف المواد.
2. **مدير المستودع (Warehouse Manager):** مسؤول عن المستودعات المسندة إليه، مراقبة المخزون، إصدار طلبات التوريد، اعتماد طلبات المشرفين، وتأكيد استلام وتسليم المواد.
3. **رئيس / مدير القسم (Department Manager):** طبقة الاعتماد الإداري في القسم؛ يراجع طلبات الصرف المقدمة، يعتمدها، ويقوم بتحويلها (Forward) لإدارة المستودعات للصرف.
4. **المشرف الأكاديمي (Academic Supervisor):** المعلم / المشرف الذي ينشئ مشاريع التخرج، يضيف الطلاب، ويقدم طلبات صرف المواد للأنشطة والمشاريع ويتابع العُهد المسندة إليه.
5. **الطلاب والموظفون:** المستفيدون النهائيون من استعارة المواد والمشاريع.

### 1.3 الوظائف والأنظمة الفرعية الرئيسية (Core Capabilities)
- **إدارة البيانات الرئيسية (Master Data):** تصنيفات هرمية (مع تصنيفات فرعية)، وحدات قياس ومعاملات تحويل، موردين، أقسام، ومستودعات.
- **بطاقة الصنف والمخزون الحي:** توليد آلي لأكواد الأصناف بناءً على بادئة التصنيف، تتبع كميات المستودعات المستقلة، الرصيد المتاح والمحجوز، تواريخ الإنتاج والصلاحية مع تنبيهات مخصصة لكل صنف (`expiry_alert_days`).
- **محرك الحركات وسندات المخزن (Transaction Engine):**
  - **RV (Receiving Voucher):** استلام توريدات خارجية.
  - **LN (Issuing / Lending Voucher):** صرف مواد وتوليد عُهد للأصناف المستديمة.
  - **RTV (Return to Vendor):** إرجاع بضاعة لمورد.
  - **RTI (Return to Inventory):** إرجاع عهدة أو مواد للمخزن.
  - **TRF (Transfer Voucher):** تحويل مخزني بين مستودعين مع القيود المحاسبية.
  - **ADJ (Adjustment Voucher):** تسوية جردية بالزيادة أو النقصان.
- **دورة طلبات الشراء والتوزيع (Purchase Orders & Allocation Workflow):**
  - دورة توريد متكاملة تبدأ بطلب الشراء -> الاعتماد -> الاستلام الفعلي (Partial/Full RV) -> تأكيد الاستلام -> حجز المخصصات (Allocation Overlay) للأقسام -> التحويل الفعلي للمستودعات الفرعية (TRF) -> تأكيد الاستلام الفرعي.
- **دورة طلبات صرف المواد (Material Requests):**
  - دورة متعددة المراحل: إنشاء الطلب -> اعتماد رئيس القسم -> تحويل لمدير المستودعات -> اعتماد المستودع -> صرف المخزون وتوليد العُهد آلياً.
  - مسار مباشر لطلبات المشرفين: إنشاء الطلب -> اعتماد مدير المستودع مباشرة -> الصرف.
- **إدارة المشاريع والعُهد (Projects & Custodies):**
  - ربط العُهد بالأشخاص والمشاريع، تقرير استهلاك المواد قبل إغلاق المشروع، ومنع إغلاق أي مشروع حتى يتم استرجاع كافة العُهد المرتبطة به بالكامل، مع تقييم حالة العهدة عند الاسترجاع (جيدة / تالفة / مفقودة).
- **الجرد الدوري والتسويات (Cycle Counting):**
  - فتح جلسات جردية، أخذ لقطة للمخزون (Snapshot)، تسجيل العد الفعلي، وحساب الفروقات وتوليد سند تسوية `ADJ` تلقائياً عند الإغلاق.
- **القيود المحاسبية الآلية (Journal Entries):**
  - توليد قيود مالية آلية (مدين / دائن) معتمدة على إعدادات الحسابات (`inventory_account`, `supplier_account`, `expense_account_prefix`).

---

## 2. المكدس التقني (Tech Stack)

### 2.1 الواجهة الخلفية (Backend)
- **لغة البرمجة:** TypeScript 5.5.2 (Strict Mode, Target ES2022)
- **بيئة التشغيل:** Node.js 20 LTS
- **إطار العمل:** Express.js 4.19.2
- **قاعدة البيانات ومحرك الاتصال:** PostgreSQL عبر مشغل `pg` (node-postgres) الإصدار 8.12.0 مع `pg.Pool` و **Raw Parameterized SQL** (لا يوجد ORM ثقيل، مما يوفر أداءً واستقراراً عاليين وتحكماً كاملاً بالمعاملات والقفل `FOR UPDATE`).
- **المصادقة والأمان:**
  - `jsonwebtoken` 9.0.3 (JWT Access Tokens + Refresh Tokens)
  - `bcryptjs` 3.0.3 (تشفير كلمات المرور)
  - `helmet` 8.3.0 (تأمين ترويسات HTTP)
  - `cors` 2.8.6 (إدارة الأصول المشتركة)
  - `express-rate-limit` 8.6.0 (تحديد معدل الطلبات وحماية من الهجمات)
- **التحقق من البيانات (Validation):** `zod` 4.4.3
- **التوثيق التفاعلي:** `swagger-ui-express` 5.0.1
- **أدوات التطوير:** `ts-node-dev` 2.0.0, `dotenv` 16.4.5

### 2.2 الواجهة الأمامية (Frontend)
- **لغة البرمجة:** TypeScript 5.7.2
- **إطار العمل والواجهة:** React 18.3.1
- **أداة البناء والتطوير:** Vite 5.4.11
- **إدارة التنسيقات (Styling):** TailwindCSS 3.4.16 مع PostCSS و Autoprefixer
- **إدارة الحالة (State Management):**
  - `zustand` 5.0.2 لإدارة حالة المصادقة والصلاحيات (`auth.store.ts`)
  - `@tanstack/react-query` 5.62.0 لإدارة ومزامنة البيانات القادمة من السيرفر (Server State & Caching)
- **التوجيه (Routing):** `react-router-dom` 6.28.0
- **إدارة النماذج:** `react-hook-form` 7.54.2 مع `@hookform/resolvers` و `zod` 3.24.1
- **التدويل وثنائية اللغة (i18n):** `i18next` 26.3.6 مع `react-i18next` 17.0.10 و `i18next-browser-languagedetector` مع تبديل الاتجاه الديناميكي (RTL / LTR)
- **عميل الاتصال (HTTP Client):** Axios 1.7.9 مع معترضات تجديد التوكن آلياً وحجب تسريب الأخطاء التقنية للمستخدم
- **الأيقونات والتنبيهات:** `@heroicons/react` 2.2.0, `lucide-react` 0.468.0, `sonner` 2.0.7, `react-hot-toast` 2.4.1

### 2.3 الاختبارات (Testing Suite)
- **الباك إند:** Jest 30.4.2 مع `supertest` 7.2.2 و `ts-jest` 29.4.11 (152 اختبار ناجح عبر 22 ملف فحص).
- **الفرونت إند:** Vitest 4.1.11 (فحص مترجم الأخطاء ودوال التحويل).

---

## 3. هيكل المشروع (Project Structure)

```
WMS/
├── MIGRATION-REPORT.md                 # تقرير توحيد عقود الاستجابة (API Contract)
├── REQUIREMENTS_COMPLIANCE_REPORT.md   # تقرير مطابقة المتطلبات والفحوصات
├── HANDOVER_REPORT.md                  # هذا التقرير الشامل
│
├── WMS_Managment_Backend/              # تطبيق الواجهة الخلفية (Node/Express/PostgreSQL)
│   ├── Dockerfile                      # ملف بناء صورة Docker الإنتاجية (Alpine multi-stage)
│   ├── docker-compose.yml              # تشغيل قاعدة بيانات Postgres مع الباك إند
│   ├── package.json                    # تبعيات وسكربتات الباك إند
│   ├── tsconfig.json                   # إعدادات TypeScript للباك إند
│   ├── schema.sql                      # المخطط التأسيسي لقاعدة البيانات
│   ├── jest.config.ts / jest.setup.ts  # إعدادات بيئة اختبار Jest
│   │
│   ├── migrations/                     # ملفات ترحيل قاعدة البيانات المرتبة تسلسلياً (001 إلى 036)
│   │   ├── 001_initial_schema.sql
│   │   ├── ... (015 إلى 036 ملفات ترقية وتراجع .down.sql)
│   │   └── 036_project_pending_closure.sql
│   │
│   ├── scripts/                        # سكربتات مساعدة للبذر والترحيل والإصلاح
│   │   ├── run-migrations.ts           # مشغل الترحيلات الذكي بحساب Checksums
│   │   ├── seed-admin.ts               # بذر المستخدم الافتراضي admin
│   │   ├── seed-demo.ts                # بذر بيانات تجريبية متكاملة
│   │   ├── seed-realistic-data.ts      # بذر سيناريوهات تشغيل واقعية
│   │   └── reset-admin-password.ts     # إعادة تعيين كلمة مرور المسؤول
│   │
│   ├── src/
│   │   ├── server.ts                   # نقطة الدخول، معالجة الإشارات والتنظيف الدوري للتوكنز
│   │   ├── app.ts                      # تهيئة Express، الميدلوير، والمسارات المركزية
│   │   ├── config/
│   │   │   └── database.ts             # إعداد Pool وتوابع المعاملات `runInTransaction`
│   │   ├── middlewares/
│   │   │   ├── auth.middleware.ts      # حماية التوكن والتحقق من الصلاحيات
│   │   │   ├── language.middleware.ts  # استخلاص لغة الطلب (ar/en)
│   │   │   └── logger.middleware.ts    # تسجيل الطلبات وربط معرف `X-Request-Id`
│   │   ├── utils/
│   │   │   ├── AppError.ts             # شجرة الأخطاء المخصصة (NotFoundError, ConflictError...)
│   │   │   ├── crypto.ts               # تجزئة كلمات المرور عبر bcrypt
│   │   │   ├── env.ts                  # التحقق الصارم من متغيرات البيئة عبر Zod
│   │   │   ├── jwt.ts                  # توليد والتحقق من JWT Access/Refresh tokens
│   │   │   ├── logger.ts               # مسجل الأحداث المنسق
│   │   │   └── response.ts             # مغلفات الاستجابة الموحدة (`sendData`, `sendPaginated`)
│   │   ├── docs/
│   │   │   └── swagger.ts              # تعريف مواصفات وتوثيق OpenAPI / Swagger
│   │   └── modules/                    # 22 وحدة وظيفية مستقلة (Route, Controller, Service, Repository, Validator)
│   │       ├── alerts/                 # نظام التنبيهات ونفاد الصلاحية
│   │       ├── auth/                   # المصادقة وتجديد الجلسات
│   │       ├── authorization/          # كتالوج الصلاحيات وتحديد النطاقات (Scopes)
│   │       ├── batches/                # أرقام التشغيلات وتواريخ الصلاحية
│   │       ├── categories/             # التصنيفات والتصنيفات الفرعية
│   │       ├── custodies/              # العُهد الشخصية وإرجاعها (RTI)
│   │       ├── departments/            # الأقسام المؤسسية
│   │       ├── inventory/              # جلسات الجرد والتسويات الآلية
│   │       ├── items/                  # الأصناف وبطاقات الصنف والمخزون
│   │       ├── material-requests/      # دورة طلبات الصرف متعددة المراحل
│   │       ├── projects/               # مشاريع التخرج وإسناد الطلاب
│   │       ├── purchase-orders/        # دورة التوريد والحجز والتوزيع
│   │       ├── reports/                # تقارير الجرد وحركات الأصناف
│   │       ├── settings/               # إعدادات الحسابات والتقييم
│   │       ├── stock-movements/        # سجل الحركات غير القابل للتعديل
│   │       ├── supervisors/            # إدارة المشرفين الأكاديميين
│   │       ├── suppliers/              # الموردون
│   │       ├── transactions/           # محرك السندات المعتمدة والقيود المحاسبية
│   │       ├── unit-conversions/       # معاملات تحويل الوحدات
│   │       ├── units/                  # وحدات القياس
│   │       ├── users/                  # إدارة المستخدمين وأدوارهم
│   │       └── warehouses/             # المستودعات الرئيسية والفرعية
│   └── tests/                          # 22 مجموعة اختبارية للباك إند
│
└── WMS_Frontend/                       # تطبيق الواجهة الأمامية (React/Vite/Tailwind)
    ├── package.json                    # تبعيات وسكربتات الفرونت إند
    ├── vite.config.ts                  # إعدادات Vite وموجه الـ Proxy (/api -> :5000)
    ├── tailwind.config.js              # لوحة ألوان WMS وإعدادات التصميم
    ├── src/
    │   ├── main.tsx                    # نقطة الدخول
    │   ├── App.tsx                     # شجرة المسارات والتوجيه المحمي وصناديق التنبيه
    │   ├── api/                        # 19 ملف عميل API مبني فوق Axios
    │   ├── components/                 # مكونات الواجهة وقوالب العرض (Sidebar, Topbar, Layout)
    │   ├── hooks/                      # 17 Hook مخصص مبني فوق React Query
    │   ├── i18n/                       # إعدادات الترجمة وتغيير الاتجاه
    │   ├── locales/                    # قواميس النصوص (ar/translation.json, en/translation.json)
    │   ├── pages/                      # 19 مجلد يمثل صفحات النظام (Dashboard, Items, Orders, Projects...)
    │   ├── schemas/                    # 13 مخطط تحقق Zod للنماذج الأمامية
    │   ├── store/                      # Zustand Store للمصادقة والصلاحيات
    │   ├── types/                      # التعريفات المشتركة لجميع الكيانات والاستجابات
    │   └── utils/                      # أدوات التنسيق ومترجم أخطاء السيرفر (apiErrors.ts)
```

### أهم 12 ملفاً في المشروع ودور كل منها:
1. `WMS_Managment_Backend/src/server.ts`: نقطة إقلاع السيرفر، تفعيل حراس الأمان لمتغيرات البيئة، تشغيل مهمة تنظيف التوكنز التلقائية كل 24 ساعة، والإغلاق التدريجي الآمن (Graceful Shutdown).
2. `WMS_Managment_Backend/src/config/database.ts`: تهيئة تجمع اتصالات PostgreSQL مع دعم معاملات العمليات الحرجة `runInTransaction`.
3. `WMS_Managment_Backend/src/middlewares/auth.middleware.ts`: التحقق من صحة JWT Access Token واستدعاء الصلاحيات الحية من قاعدة البيانات على مستوى كل طلب لمنع استغلال التوكنات القديمة.
4. `WMS_Managment_Backend/src/modules/authorization/scope.ts`: قلب نظام تحديد نطاق البيانات (Data Scope)؛ يحدد ما إذا كان المستخدم يرى بيانات عامة (`GLOBAL`)، أو على مستوى قسمه (`DEPARTMENT`)، أو مستودعاته (`WAREHOUSE`).
5. `WMS_Managment_Backend/src/modules/transactions/transactions.service.ts`: المحرك المالي والمخزني؛ ينفذ حركات الاستلام والصرف والتحويل والتسوية مع القفل التنافسي `FOR UPDATE` وتوليد القيود المحاسبية.
6. `WMS_Managment_Backend/src/modules/purchase-orders/purchase-orders.service.ts`: إدارة الدورة التوريدية المعقدة (شراء -> استلام في المخزن الرئيسي -> حجز مخصصات الأقسام -> نقل للمخزن الفرعي -> تأكيدات الاستلام).
7. `WMS_Managment_Backend/src/modules/material-requests/material-requests.service.ts`: إدارة آلة حالات طلبات الصرف، ومنع الموافقة الذاتية لرؤساء الأقسام، والصرف الذكي مع خصم المخزون وإنشاء العُهد.
8. `WMS_Managment_Backend/src/modules/custodies/custodies.service.ts`: تتبع المواد المعارة للمشرفين والطلاب وإعادتها عبر سندات `RTI` مع تدقيق الحالة (سليمة/تالفة/مفقودة).
9. `WMS_Frontend/src/App.tsx`: مخطط مسارات التطبيق وتوزيع حراس الصلاحيات (`ProtectedRoute`) على المسارات ومزامنة اتجاه المستند (RTL/LTR).
10. `WMS_Frontend/src/store/auth.store.ts`: مخزن Zustand لحفظ المستخدم المسجل، الصلاحيات الفعالة، والتحقق من الدوال `can()` و `canAny()`.
11. `WMS_Frontend/src/api/client.ts`: عميل Axios المركزي المزود بمعترض التجديد التلقائي للتوكن (Token Refresh Interceptor) ومعالجة حالات انتهاء الجلسة.
12. `WMS_Frontend/src/utils/apiErrors.ts`: الطبقة العازلة للأمان التي تمنع ظهور أي رسائل خطأ برمجية أو استعلامات SQL للمستخدم النهائي وتحولها إلى رسائل مترجمة مفهومة.

---

## 4. قاعدة البيانات والمخطط الشامل (Database & Migrations)

### 4.1 الجداول الرئيسية والعلاقات

| اسم الجدول | الوظيفة | الأعمدة الرئيسية | سياسات الحذف والعلاقات |
|---|---|---|---|
| `users` | المستخدمون وحساباتهم | `id`, `username`, `password_hash`, `role`, `department_id`, `is_active`, `token_version` | `department_id` -> `departments(id)` (SET NULL) |
| `roles` | كتالوج الأدوار | `id`, `code`, `name_ar`, `name_en`, `is_active` | جدول الأدوار المرجعي |
| `permissions` | كتالوج الصلاحيات الذرية | `id`, `code`, `resource`, `action`, `description` | الكود موحد عبر النظام |
| `role_permissions` | ربط الأدوار بالصلاحيات | `role_id`, `permission_id` | CASCADE عند حذف الدور أو الصلاحية |
| `user_warehouses` | إسناد المستودعات للمدراء | `user_id`, `warehouse_id` | CASCADE |
| `categories` | التصنيفات الرئيسية | `code`, `name_ar`, `name_en`, `prefix`, `parent_code` | `parent_code` ذاتي (SET NULL) |
| `subcategories` | التصنيفات الفرعية | `id`, `category_code`, `code`, `name_ar`, `name_en` | CASCADE عند حذف التصنيف الأب |
| `units` | وحدات القياس | `code`, `name_ar`, `name_en` | المفتاح الأساسي `code` |
| `unit_conversions` | معاملات تحويل الوحدات | `id`, `item_id`, `from_unit_code`, `to_unit_code`, `factor` | `item_id` -> `items(id)` (CASCADE) |
| `departments` | الأقسام المؤسسية/الأكاديمية | `id`, `code`, `name_ar`, `name_en` | مستخدم في التوجيه والنطاقات |
| `warehouses` | المستودعات | `id`, `code`, `name_ar`, `name_en`, `is_main`, `department_id` | `department_id` -> `departments(id)` |
| `items` | بطاقات الأصناف | `id`, `item_code`, `name_ar`, `category_code`, `unit_code`, `warehouse_id`, `current_balance`, `min_stock_level`, `max_stock_level`, `is_consumable`, `expiry_alert_days` | RESTRICT عند وجود حركات مخزنية |
| `item_warehouse_stock` | **المصدر الحقيقي لأرصدة المستودعات** | `item_id`, `warehouse_id`, `current_balance`, `min_stock_level`, `max_stock_level` | `UNIQUE(item_id, warehouse_id)` |
| `transactions` | ترويسات السندات المخزنية | `id`, `transaction_no`, `type`, `status`, `warehouse_id`, `to_warehouse_id`, `department_id`, `supplier_id`, `purchase_order_id`, `created_by`, `approved_by` | RESTRICT لحماية السجلات المالية |
| `transaction_details` | بنود السندات المخزنية | `id`, `transaction_id`, `item_id`, `quantity`, `unit_code`, `unit_price`, `total_price` (Generated), `batch_number`, `expiry_date` | `transaction_id` -> `transactions(id)` (CASCADE) |
| `stock_movements` | سجل حركات المخزون (تدقيق غير قابل للتعديل) | `id`, `item_id`, `transaction_id`, `movement_type` (IN/OUT), `quantity_before`, `quantity_change`, `quantity_after`, `warehouse_id`, `user_id` | سجل تدقيق دائم |
| `batches` | تتبع التشغيلات والصلاحية | `id`, `item_id`, `warehouse_id`, `batch_number`, `quantity`, `production_date`, `expiry_date` | مرتبط بالصنف والمستودع |
| `purchase_orders` | أوامر الشراء المركزية | `id`, `po_number`, `supplier_id`, `warehouse_id` (Main), `department_id`, `status`, `received_at`, `receive_confirmed_by`, `receive_confirmed_at` | `warehouse_id` مقيد بالمستودعات الرئيسية |
| `purchase_order_details` | بنود أوامر الشراء | `id`, `po_id`, `item_id`, `quantity_ordered`, `quantity_received`, `quantity_allocated`, `quantity_transferred` | قيود تحقق `CHECK (received <= ordered)` |
| `purchase_order_allocations` | حجز مخصصات الشراء للأقسام | `id`, `po_detail_id`, `po_id`, `source_warehouse_id`, `dest_warehouse_id`, `quantity_allocated`, `quantity_transferred`, `status`, `transfer_confirmed_by` | قيود تحقق `CHECK (transferred <= allocated)` |
| `material_requests` | طلبات صرف المواد | `id`, `request_no`, `department_id`, `warehouse_id`, `requested_by`, `status`, `request_type`, `project_id`, `dept_approved_by`, `forwarded_by`, `issued_by`, `transaction_id` | متتبع كامل لخطوات الاعتماد |
| `material_request_details` | بنود طلبات الصرف | `id`, `request_id`, `item_id`, `quantity`, `unit_code` | CASCADE عند حذف الطلب المسودة |
| `projects` | مشاريع التخرج والبحوث | `id`, `project_no`, `name`, `department_id`, `warehouse_id`, `supervisor_id`, `status` (open, pending_closure, closed, cancelled), `closure_initiated_by` | مرتبط بالقسم والمشرف |
| `project_students` | قائمة الطلاب المشاركين بالمشروع | `id`, `project_id`, `full_name`, `student_id`, `role` | CASCADE |
| `custodies` | العُهد الشخصية للمواد المستديمة | `id`, `item_id`, `warehouse_id`, `assigned_to`, `quantity`, `issued_transaction_id`, `return_transaction_id`, `project_id`, `status`, `condition`, `pending_return_quantity` | تتبع دورة الإعارة والإرجاع |
| `inventory_sessions` | جلسات الجرد الدوري | `id`, `session_no`, `warehouse_id`, `status`, `started_by`, `completed_by`, `adj_transaction_id` | جلسة واحدة نشطة لكل مستودع |
| `inventory_counts` | تفاصيل عد الأصناف في الجرد | `id`, `session_id`, `item_id`, `system_qty`, `counted_qty`, `variance` (Generated: counted - system) | حساب آلي للفروقات |
| `alerts` | التنبيهات المباشرة | `id`, `type`, `item_id`, `warehouse_id`, `batch_id`, `status`, `message_ar`, `message_en` | تتولد آلياً بالزنادات والوظائف |
| `journal_entries` | القيود اليومية المحاسبية | `id`, `transaction_id`, `account_debit`, `account_credit`, `amount`, `description` | قيود الحركات المخزنية |
| `refresh_tokens` | رموز تجديد الجلسات المشفرة | `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at` | تنظيف آلي للرموز منتهية الصلاحية |
| `system_settings` | إعدادات النظام والمحاسبة | `key`, `value`, `description` | مفاتيح الإعدادات المالية |
| `_migrations` | سجل الترحيلات المنفذة | `id`, `name`, `checksum`, `applied_at` | يمنع تعديل ملفات الترحيل السابقة |

### 4.2 سجل الترحيلات (Database Migrations History)
يتم تشغيل الترحيلات عبر `scripts/run-migrations.ts` الذي يحتفظ بـ Checksums لمنع التناقض:
- `001_initial_schema.sql`: المخطط الأساسي الموحد (جداول، مشغلات `update_updated_at_column` و `fn_check_low_stock`، وسلاسل الأرقام).
- `015_add_location_tracking.sql`: إضافة تتبع مواقع الرفوف والتخزين (`locations`).
- `016_subcategories_and_expiry.sql`: دعم التصنيفات الفرعية وأيام تنبيه الصلاحية المخصصة لكل صنف.
- `017_rbac_permissions.sql`: هيكل الصلاحيات المتقدم وتوزيع الأدوار والأذونات.
- `018_admin_only_inventory_workflow.sql`: حصر عمليات تسوية الجرد والتحكم الإداري.
- `019_three_active_roles_and_request_workflow.sql`: اعتماد الأدوار النشطة، وإضافة `warehouses.is_main` و `warehouses.department_id` وتوسيع حالات طلبات المواد (`request_status`).
- `020_warehouse_routing_constraints.sql`: قيود توجيه المستودعات ومنع استهداف المستودع الرئيسي كوجهة لطلبات الصرف.
- `021_add_stock_movement_warehouse.sql`: توثيق المستودع في كل حركة مخزنية (`stock_movements.warehouse_id`).
- `022_department_manager_cannot_create_requests.sql`: فصل المهام ومنع مدراء الأقسام من إنشاء الطلبات لنفسهم لتجنب تضارب المصالح.
- `023_project_management_workflow.sql` إلى `025_project_supervisor_lookup.sql`: هيكلة مشاريع التخرج وتعيين المشرفين.
- `026_supervisors_management.sql` إلى `032_supervisor_request_routing_and_custody.sql`: اعتماد دور المشرف الأكاديمي (`supervisor`)، وتمكينه من إنشاء المشاريع وطلب المواد وتوجيه الطلبات لمدير المستودع.
- `033_purchase_orders.sql`: دورة أوامر الشراء الكاملة والتخصيصات (`purchase_orders`, `purchase_order_details`, `purchase_order_allocations`).
- `034_po_received_at.sql`: توثيق تاريخ الاستلام الفعلي الأول من المورد.
- `035_po_confirmation.sql`: دعم التأكيد الصريح لاستلام ونقل الشحنات (`receive_confirmed_by`, `transfer_confirmed_by`).
- `036_project_pending_closure.sql`: إدخال حالة الإغلاق المعلق للمشاريع (`pending_closure`) وتوثيق منشئ طلب الإغلاق.

---

## 5. دليل نقاط النهاية والواجهات البرمجية (API Endpoints Catalog)

جميع استجابات الـ API تتبع النمط الموحد التالي:
- استجابة مفردة/تعديل: `{ "success": true, "data": <Object>, "message": "..." }`
- استجابة قائمة مقسمة (Paginated): `{ "success": true, "data": { "items": [...], "pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 } } }`
- استجابة خطأ: `{ "success": false, "error": { "message": "...", "code": "ERROR_CODE", "details": ... } }`

| المجموعة | الطريقة (Method) | المسار الكامل (Path) | المدخلات الرئيسية (Body/Query) | الصلاحية / الدور المطلوب | الوظيفة |
|---|---|---|---|---|---|
| **المصادقة** | `POST` | `/api/auth/login` | `{ username, password }` | عام (محدد المعدل) | تسجيل الدخول وتوليد Access & Refresh Tokens |
| | `POST` | `/api/auth/refresh` | `{ refreshToken }` | عام (محدد المعدل) | تدوير وتجديد الرموز |
| | `POST` | `/api/auth/logout` | `{ refreshToken }` | عام | إلغاء الجلسة والرمز |
| | `GET` | `/api/auth/me` | ترويسة `Authorization` | أي مستخدم مسجل | استرجاع بيانات المستخدم وصلاحياته ومستودعاته الحية |
| **المستخدمون** | `GET` | `/api/users` | `?page&limit` | `users:view` | استعراض قائمة المستخدمين النشطين |
| | `GET` | `/api/users/supervisors`| `?department_id` | `projects:supervisors` | استعراض المشرفين المرشحين للمشاريع |
| | `GET` | `/api/users/:id` | معرف المستخدم | `users:view` | استعراض تفاصيل مستخدم محدد |
| | `POST` | `/api/users` | `{ username, password, full_name, role, department_id }` | `users:create` (Admin) | إنشاء مستخدم جديد |
| | `PUT` | `/api/users/:id` | `{ full_name, role, is_active, department_id }` | `users:update` (Admin) | تحديث بيانات مستخدم |
| | `DELETE`| `/api/users/:id` | معرف المستخدم | `users:delete` (Admin) | حذف مستخدم (يرفض بـ 409 إذا ارتبط بسجلات) |
| **التصنيفات** | `GET` | `/api/categories` | `?page&limit` | `categories:view` | استعراض التصنيفات الرئيسية |
| | `POST` | `/api/categories` | `{ code, name_ar, name_en, prefix, parent_code }` | `categories:create` | إنشاء تصنيف رئيسي |
| | `PUT` | `/api/categories/:code` | `{ name_ar, name_en, prefix, parent_code }` | `categories:update` | تحديث تصنيف رئيسي |
| | `DELETE`| `/api/categories/:code`| كود التصنيف | `categories:delete` | حذف تصنيف |
| | `GET` | `/api/categories/:code/subcategories` | كود التصنيف الأب | `categories:view` | استعراض التصنيفات الفرعية |
| | `POST` | `/api/categories/:code/subcategories` | `{ code, name_ar, name_en, description }` | `categories:create` | إضافة تصنيف فرعي |
| **الأصناف** | `GET` | `/api/items` | `?category_code&warehouse_id&search&page` | `items:view` | استعراض الأصناف حسب النطاق |
| | `GET` | `/api/items/generate-code/:categoryCode` | كود التصنيف | `items:view` | توليد كود آلي للصنف التالي |
| | `GET` | `/api/items/:id` | معرف الصنف | `items:view` | جلب تفاصيل وبطاقة الصنف ورصيده |
| | `POST` | `/api/items` | `{ name_ar, category_code, unit_code, warehouse_id, is_consumable, expiry_alert_days... }` | `items:create` | إنشاء صنف جديد وبذر رصيده المبدئي |
| | `PUT` | `/api/items/:id` | تفاصيل الصنف المحدثة | `items:update` | تعديل بيانات الصنف |
| | `DELETE`| `/api/items/:id` | معرف الصنف | `items:delete` | حذف صنف (يرفض إذا وجدت حركات سابقة) |
| **السندات المخزنية** | `GET` | `/api/transactions` | `?type&status&page&limit` | `transactions:view` | استعراض السندات المفروزة حسب الصلاحية |
| | `GET` | `/api/transactions/:id` | معرف السند | `transactions:view` | استعراض تفاصيل وبنود السند |
| | `POST` | `/api/transactions` | `{ type, warehouse_id, to_warehouse_id, department_id, details: [...] }` | `transactions:create` (Admin) | إنشاء مسودة سند مخزني |
| | `POST` | `/api/transactions/:id/approve` | معرف السند | `transactions:approve` (Admin) | **اعتماد السند وتطبيق حركات المخزون والقيد المالي** |
| **أوامر الشراء** | `GET` | `/api/purchase-orders` | `?status&supplier_id&warehouse_id&search` | `purchase-orders:view` | استعراض أوامر الشراء |
| | `POST` | `/api/purchase-orders` | `{ supplier_id, warehouse_id, lines: [{ item_id, quantity_ordered, unit_code, unit_price }] }` | `purchase-orders:create` | إنشاء مسودة أمر شراء |
| | `GET` | `/api/purchase-orders/:id` | معرف أمر الشراء | `purchase-orders:view` | استعراض تفاصيل أمر الشراء ومخصصاته |
| | `PATCH`| `/api/purchase-orders/:id` | بيانات الأمر المعدلة | `purchase-orders:update` | تعديل مسودة أمر الشراء |
| | `POST` | `/api/purchase-orders/:id/approve` | معرف أمر الشراء | `purchase-orders:approve` | اعتماد أمر الشراء وبدء التوريد |
| | `POST` | `/api/purchase-orders/:id/cancel` | معرف أمر الشراء | `purchase-orders:cancel` | إلغاء أمر الشراء |
| | `POST` | `/api/purchase-orders/:id/receive` | `{ lines: [{ detail_id, quantity, unit_price, batch_number }] }` | `purchase-orders:receive` | **استلام بضاعة وإنشاء سند RV آلي بالمستودع الرئيسي** |
| | `POST` | `/api/purchase-orders/:id/confirm-receive` | معرف أمر الشراء | `purchase-orders:receive` | تأكيد الاستلام الفعلي للبضاعة الموردة |
| | `POST` | `/api/purchase-orders/:id/allocations` | `{ detail_id, dest_warehouse_id, quantity }` | `purchase-orders:allocate` | حجز حصة مستودع فرعي من البضاعة المستلمة |
| | `POST` | `/api/purchase-orders/allocations/:id/transfer` | `{ quantity }` | `purchase-orders:transfer` | **نقل الحصة المحجوزة بسند TRF آلي للمستودع الفرعي** |
| | `POST` | `/api/purchase-orders/allocations/:id/confirm-transfer`| معرف التخصيص | `purchase-orders:transfer` | تأكيد استلام النقل في المستودع الفرعي |
| | `POST` | `/api/purchase-orders/:id/close` | معرف أمر الشراء | `purchase-orders:update` | إغلاق أمر الشراء المكتمل |
| **طلبات صرف المواد** | `GET` | `/api/requests` | `?status&department_id&request_type&page` | `requests:view` أو `requests:view_own` | استعراض طلبات المواد ضمن النطاق المسموح |
| | `GET` | `/api/requests/catalog` | - | `requests:create` | جلب كتالوج الأصناف المتاحة للقسم فقط |
| | `GET` | `/api/requests/:id` | معرف الطلب | `requests:view` أو `requests:view_own` | استعراض تفاصيل طلب الصرف |
| | `POST` | `/api/requests` | `{ warehouse_id, request_type, project_id, items: [{ item_id, quantity }] }` | `requests:create` | إنشاء طلب صرف مواد جديد |
| | `PATCH`| `/api/requests/:id/approve` | معرف الطلب | `requests:approve` | اعتماد الطلب (قسم أو مستودع) |
| | `PATCH`| `/api/requests/:id/forward` | معرف الطلب | `requests:forward` | تحويل الطلب المعتمد قسمياً لإدارة المستودع |
| | `PATCH`| `/api/requests/:id/reject` | `{ reason }` | `requests:reject` | رفض الطلب مع توثيق السبب |
| | `POST` | `/api/requests/:id/issue` | معرف الطلب | `requests:issue` | **صرف المواد، توليد سند LN آلي، وإنشاء العُهد** |
| | `PATCH`| `/api/requests/:id/cancel` | معرف الطلب | `requests:cancel` | إلغاء الطلب من قبل المنشئ أو المدير |
| **المشاريع** | `GET` | `/api/projects` | `?status&department_id&supervisor_id&search` | `projects:view` | استعراض المشاريع |
| | `POST` | `/api/projects` | `{ name, department_id, supervisor_id, students: [...] }` | `projects:create` | إنشاء مشروع جديد وقائمة طلابه |
| | `GET` | `/api/projects/:id` | معرف المشروع | `projects:view` | تفاصيل المشروع الأساسية |
| | `GET` | `/api/projects/:id/detail` | معرف المشروع | `projects:view` | تفاصيل المشروع + الطلاب + المواد المعارة |
| | `PATCH`| `/api/projects/:id` | بيانات المشروع المعدلة | `projects:update` | تعديل بيانات المشروع |
| | `GET` | `/api/projects/:id/close-report` | معرف المشروع | `projects:view` | تقرير استهلاك المواد والعُهد المعلقة |
| | `POST` | `/api/projects/:id/initiate-close`| معرف المشروع | `projects:close` | بدء إجراءات الإغلاق (`pending_closure`) |
| | `PATCH`| `/api/projects/:id/close` | معرف المشروع | `projects:close` | إغلاق المشروع نهائياً (يمنع إذا وجدت عُهد) |
| | `PATCH`| `/api/projects/:id/cancel` | معرف المشروع | `projects:close` | إلغاء المشروع المفتوح |
| | `PUT` | `/api/projects/:id/students` | `[{ full_name, student_id, role }]` | `projects:update` | تحديث قائمة الطلاب المشاركين |
| | `DELETE`| `/api/projects/:id` | معرف المشروع | `projects:delete` | الحذف الناعم للمشروع |
| **العُهد** | `GET` | `/api/custodies` | `?status&assigned_to&project_id` | `custodies:view` أو `custodies:view_own` | استعراض العُهد المسندة |
| | `GET` | `/api/custodies/:id` | معرف العهدة | `custodies:view` | تفاصيل العهدة |
| | `POST` | `/api/custodies/:id/return` | `{ condition, returned_quantity, notes }` | `custodies:return` | طلب إرجاع عهدة أو إرجاعها فورياً بسند RTI |
| | `POST` | `/api/custodies/:id/receive` | معرف العهدة | `custodies:return` | تأكيد استلام العهدة المعلقة وإعادتها للمخزن |
| **الجرد والتسويات** | `POST` | `/api/inventory/sessions` | `{ warehouse_id, notes }` | `inventory:session:open` | فتح جلسة جرد وأخذ لقطة للأرصدة |
| | `GET` | `/api/inventory/sessions/:id` | معرف الجلسة | `inventory:session:view` | استعراض تفاصيل الجلسة والأصناف والفروقات |
| | `POST` | `/api/inventory/sessions/:id/count` | `{ item_id, counted_qty, notes }` | `inventory:count:record` | تسجيل العد الفعلي لصنف |
| | `POST` | `/api/inventory/sessions/:id/close` | معرف الجلسة | `inventory:session:close` | **إغلاق الجلسة وتوليد سند تسوية ADJ آلي بالفروقات** |
| **التقارير والتنبيهات** | `GET` | `/api/reports/inventory` | `?warehouse_id&category_code&low_stock&search` | `reports:view` | تقرير الجرد التفصيلي والمخصصات المفتوحة |
| | `GET` | `/api/reports/item-card/:id` | معرف الصنف | `reports:view` | بطاقة الصنف وحركاته وآخر سندات الصرف والتوريد |
| | `GET` | `/api/alerts` | `?status&type&warehouse_id&page` | `alerts:view` | استعراض التنبيهات النشطة |
| | `GET` | `/api/alerts/summary` | - | `alerts:view` | ملخص إحصائيات التنبيهات للوحة التحكم |
| | `PATCH`| `/api/alerts/:id/acknowledge`| معرف التنبيه | `alerts:acknowledge` | تأكيد الاطلاع على التنبيه |
| **الإعدادات والمستودعات**| `GET` | `/api/settings` | - | `settings:view` | جلب إعدادات الحسابات والتقييم |
| | `PUT` | `/api/settings` | `{ settings: [...] }` | `settings:update` (Admin) | تحديث الإعدادات المحاسبية |
| | `GET` | `/api/warehouses` | `?page&limit` | `warehouses:view` | استعراض المستودعات |
| | `GET` | `/api/departments` | `?page&limit` | `departments:view` | استعراض الأقسام |
| | `GET` | `/api/suppliers` | `?page&limit` | `suppliers:view` | استعراض الموردين |
| | `GET` | `/api/units` | `?page&limit` | `units:view` | استعراض الوحدات |
| | `GET` | `/api/unit-conversions` | `?item_id` | `unit-conversions:view` | استعراض معاملات التحويل |
| **الصحة والتوثيق** | `GET` | `/health` | - | عام (بدون قيود) | فحص سلامة السيرفر واتصال قاعدة البيانات |
| | `GET` | `/api/docs` | - | عام | واجهة توثيق التفاعل Swagger UI |

---

## 6. المصادقة ونظام الصلاحيات (Authentication & RBAC Scope)

### 6.1 آلية تسجيل الدخول وإدارة الجلسات
1. يرسل العميل اسم المستخدم وكلمة المرور إلى `POST /api/auth/login`.
2. يتم فحص محدد المعدل (Rate Limiter)، والتحقق من وجود المستخدم، وتأكيد أن حسابه نشط (`is_active = true`)، وأن دوره ينتمي للأدوار المفعلة (`ACTIVE_ROLES`).
3. تتم مطابقة كلمة المرور عبر `bcrypt.compare`.
4. عند النجاح، يتم توليد:
   - **Access Token:** موقع بـ `JWT_SECRET` ومدته الافتراضية **ساعة واحدة (`1h`)** ويحمل الهوية الأساسية فقط.
   - **Refresh Token:** موقع بـ `JWT_REFRESH_SECRET` ومدته **7 أيام (`7d`)**، ويتم حفظ تجزئة الرمز المشفرة (SHA-256 Hash) في جدول `refresh_tokens`.
5. **مبدأ الأمان التام:** لا يتم تخزين الصلاحيات داخل التوكن كحقوق مطلقة؛ يقوم `auth.middleware.ts` في كل طلب بجلب سياق الصلاحيات الحية من قاعدة البيانات عبر دالة `loadAuthContext(userId)` لضمان تطبيق أي تعديل فوري على صلاحيات المستخدم أو مستودعاته المسندة دون انتظار انتهاء التوكن.
6. **إلغاء الجلسات الفوري:** يدعم النظام عمود `token_version` في جدول المستخدمين؛ عند تغيير الدور أو إعادة تعيين كلمة المرور، يزداد الرقم تلقائياً مما يبطل فورياً جميع التوكنات السابقة الصادرة للحساب.

### 6.2 مصفوفة الأدوار ونطاقات الوصول للبيانات (Data Scopes)

```mermaid
graph TD
    User([المستخدم المسجل]) --> ScopeEval{تقييم الدور والنطاق}
    ScopeEval -->|system_admin| Global[نطاق عام GLOBAL: يرى ويعدل كل الكيانات]
    ScopeEval -->|department_manager| Dept[نطاق القسم DEPARTMENT: يرى مستودعات وقضايا قسمه فقط]
    ScopeEval -->|warehouse_manager| Wh[نطاق المستودع WAREHOUSE: يرى المستودعات المسندة إليه فقط]
    ScopeEval -->|supervisor| NoneScope[نطاق المشرف NONE: يرى طلباته وعُهده وماريعه فقط]
```

- **1. مدير النظام (`system_admin`):** نطاق `GLOBAL` — وصول غير مقيد لجميع المستودعات والأقسام والعمليات الحساسة وإعدادات النظام.
- **2. مدير المستودع (`warehouse_manager`):** نطاق `WAREHOUSE` — محصور بالمستودعات المسندة إليه في `user_warehouses`. ينشئ طلبات الشراء، يعتمد طلبات المشرفين، ويؤكد استلام ونقل المواد.
- **3. مدير / رئيس القسم (`department_manager`):** نطاق `DEPARTMENT` — محصور بالبيانات التابعة لقسمه (`department_id`). يمثل طبقة الاعتماد لطلبات الصرف ومشاريع القسم، وممنوع من إنشاء الطلبات لنفسه منعاً لتضارب المصالح.
- **4. المشرف الأكاديمي (`supervisor`):** نطاق `NONE` (محكوم بالملكية الشخصية `requested_by = user.id` و `supervisor_id = user.id`). ينشئ المشاريع وقوائم الطلاب ويطلب المواد اللازمة ويسترجع العُهد.
- **الأدوار المؤرشفة الموقوفة:** (`storekeeper`, `accountant`, `viewer`) — تم تعطيلها في الترحيل `019`؛ المستخدمون القدامى بتلك الأدوار لا يمكنهم تسجيل الدخول حتى يقوم المشرف بإعادة تعيينهم لأحد الأدوار الأربعة النشطة.

---

## 7. المنطق الأساسي وقواعد العمل (Business Logic & Workflows)

### 7.1 دورة حياة أوامر الشراء والتوزيع (Purchase Orders & Allocation Loop)
هذه الدورة تعالج متطلبات التوريد والتخصيص المؤسسي عبر تسلسل صارم ومحمي:

```mermaid
sequenceDiagram
    autonumber
    actor WM as مدير المستودع / المشرف
    actor Admin as مدير النظام
    participant PO as نظام المشتريات
    participant Txn as محرك السندات
    participant Stock as المخزون الرئيسي والفرعي

    WM->>PO: إنشاء مسودة أمر شراء Draft PO
    Admin->>PO: اعتماد أمر الشراء Approve PO
    Admin->>PO: استلام البضاعة Receive (جزئي أو كلي)
    PO->>Txn: توليد واعتماد سند استلام RV
    Txn->>Stock: زيادة رصيد المستودع الرئيسي وتحديث سعر الشراء الأخير
    Admin->>PO: تأكيد الاستلام الفعلي Confirm Receive
    Admin->>PO: حجز مخصصات للأقسام Allocate to Sub-Warehouse
    Note over PO: إنشاء حجز دفتري فقط دون نقل المخزون الفعلي
    Admin->>PO: نقل المخصصات Transfer Allocation
    PO->>Txn: توليد واعتماد سند تحويل TRF
    Txn->>Stock: خصم من المستودع الرئيسي وزيادة المستودع الفرعي
    WM->>PO: تأكيد استلام النقل في المستودع الفرعي Confirm Transfer
    Admin->>PO: إغلاق أمر الشراء Close PO (بعد تصفية كل المخصصات)
```

1. **الاستلام:** يتم حصر التوريد بالمستودعات **الرئيسية النشطة (`is_main = true`)** حصراً، مع إنشاء سجل تشغيلة (`batches`) عند تتبع تواريخ الصلاحية.
2. **الحجز (Allocation Overlay):** لا ينقل المخزون مادياً، بل يحجزه دفترياً (`allocated_stock`) لمنع تكرار صرفه لجهات أخرى. المعادلة الحاكمة:
   $$\text{Available Stock} = \max(\text{Physical Stock} - \text{Open Allocations}, 0)$$
3. **التحويل:** ينفذ عبر سند `TRF` ينقل الكميات من المستودع الرئيسي إلى المستودع الفرعي التابع للقسم، ويحدث الحسابات المالية المرتبطة بالتحويلات المخزنية.

### 7.2 دورة حياة طلبات صرف المواد وتوليد العُهد (Material Requisition & Custody Flow)

```mermaid
stateDiagram-v2
    [*] --> pending: إنشاء الطلب (مشرف / مستودع)
    
    state "المسار الأكاديمي (مشرف)" as SupervisorFlow {
        pending --> wm_approved: اعتماد مدير المستودع
        wm_approved --> issued: صرف المواد (سند LN)
    }

    state "المسار المؤسسي (أقسام)" as DeptFlow {
        pending --> dept_approved: اعتماد رئيس القسم
        dept_approved --> forwarded: تحويل لإدارة المستودعات
        forwarded --> admin_approved: اعتماد مدير النظام
        admin_approved --> issued: صرف المواد (سند LN)
        forwarded --> admin_rejected: رفض الطلب
    }

    issued --> [*]
    pending --> cancelled: إلغاء الطلب
    dept_approved --> cancelled: إلغاء الطلب
    admin_approved --> cancelled: إلغاء الطلب
```

- **قاعدة الصرف:** عند تنفيذ عملية الصرف `issue`:
  1. يتم خصم الرصيد من المستودع الرئيسي للقسم وإضافته لمستودع الصرف الفرعي موثقاً بسند `LN`.
  2. يتم فحص كل صنف بالطلب: إذا كان الصنف **مستديماً (غير مستهلك `is_consumable = false`)**، ينشئ النظام تلقائياً سجلاً في جدول `custodies` باسم المستخدم الطالب مع ربطه بالمشروع ورقم إذن الصرف.
  3. إذا كان الصنف **مستهلكاً (`is_consumable = true`)**، يعتبر مستهلكاً بالكامل للنشاط ولا تنشأ عليه عهدة.

### 7.3 دورة استرجاع العُهد (Return-To-Inventory Flow)
1. **طلب الإرجاع من المشرف:** يرسل المشرف طلباً لتسليم العهدة، فتتحول إلى حالة `return_pending`.
2. **تأكيد مدير المستودع:** يفحص مدير المستودع المادة ويحدد حالتها:
   - **سليمة (`good`):** يتم آلياً إنشاء واعتماد سند إرجاع مخزني `RTI`، وإعادة الكمية لرصيد المستودع، وتحديث العهدة إلى `returned` مع توثيق رقم إذن الإرجاع.
   - **تالفة (`damaged`) أو مفقودة (`lost`):** يتم تعديل حالة العهدة لتسجيل التلف أو الفقدان مع **منع إعادة أي كمية لرصيد المخزون** لضمان عدم تضخيم الأرصدة الوهمية.

### 7.4 دورة إغلاق المشاريع والتحقق الصارم
- عند محاولة إغلاق أي مشروع (`PATCH /api/projects/:id/close`)، ينفذ النظام استعلاماً للتأكد من عدم وجود أي عهدة نشطة (`active_custodies = 0`).
- إذا وجدت عهدة واحدة لم تسلم، يرفض النظام الإغلاق بـ `ValidationError` ويطالب بإرجاع العُهد أولاً، مما يحمي ممتلكات وأصول المؤسسة من الضياع.

---

## 8. الواجهة الأمامية وهندسة المكونات (Frontend Architecture)

### 8.1 البنية الموديولية والمكونات المشتركة
- **`Layout.tsx` & `Sidebar.tsx`:** القالب الرئيسي الذي يحوي القائمة الجانبية المفلترة ديناميكياً بحسب صلاحيات المستخدم الفعالة عبر دالة `canAny()`.
- **`ProtectedRoute.tsx`:** المكون الحارس للمسارات؛ يفحص وجود الجلسة، وصلاحية الرمز، ويقارن الصلاحيات المطلوبة للمسار مع صلاحيات المستخدم قبل عرض الصفحة، ويعيد التوجيه لصفحة تسجيل الدخول أو لوحة التحكم تلقائياً.
- **`DocumentDirection`:** مكون مدمج في جذر التطبيق يراقب اللغة الحالية (`ar` أو `en`) ويحدث تلقائياً وسوم `<html lang="ar" dir="rtl">` لضمان توافق شبكة Tailwind CSS وعناصر الواجهة فورياً مع اللغة العربية.

### 8.2 إدارة الحالة والتزامن (State Management)
1. **Client State (`auth.store.ts` via Zustand):**
   - مسؤول عن الرموز، الكائن الحالي للمستخدم، مصفوفة الصلاحيات، ودوال التحقق السريعة `can(permission)` و `canAny(...permissions)`.
2. **Server State (`use*.ts` via React Query):**
   - تم بناء 17 Hook مخصص (مثل `useItems`, `usePurchaseOrders`, `useMaterialRequests`...) تعتمد على وقت ركود `staleTime = 30s` وتتيح إبطال الذاكرة المؤقتة التلقائي (`queryClient.invalidateQueries`) عند تنفيذ عمليات الإنشاء أو التعديل لضمان تحديث الجداول فورياً.

### 8.3 تجربة المستخدم وعزل الأخطاء (Error Handling & Toasting)
- **`sonner` Toaster:** إشعارات عائمة بالأعلى تدعم الوضع العربي (`dir="rtl"`) والإنجليزية.
- **مترجم الأخطاء المركزي (`utils/apiErrors.ts`):** معترض Axios يمرر استجابات الخطأ عبر قاموس ترجمة ذكي يستبدل رموز الأخطاء التقنية (مثل `INSUFFICIENT_STOCK`, `RECEIVE_EXCEEDS_ORDERED`, `AUTH_FORBIDDEN`) بنصوص واضحة ومفسرة بلغة المستخدم مع المتغيرات المناسبة (مثل عرض الكمية المطلوبة والمتاحة).

---

## 9. متغيرات البيئة والإعدادات (Environment Variables & Config)

### 9.1 متغيرات بيئة الواجهة الخلفية (Backend `.env`)

> [!IMPORTANT]
> **تنبيه أمني:** لا تقم بنسخ قيم حقيقية أو سرية داخل مستندات التسليم. القيم أدناه هي أسماء المتغيرات والأوصاف القياسية.

| اسم المتغير | الوظيفة والدور | إلزامي؟ | القيمة الافتراضية / المقترحة |
|---|---|---|---|
| `DATABASE_URL` | سلسلة الاتصال بقاعدة بيانات PostgreSQL | نعم | `postgresql://user:password@localhost:5432/wms_db?sslmode=disable` |
| `PORT` | منفذ تشغيل خادم الويب | لا | `5000` (في التطوير) أو `3000` (في Docker) |
| `NODE_ENV` | بيئة التشغيل (`development`, `production`, `test`) | لا | `development` |
| `JWT_SECRET` | المفتاح السري لتوقيع Access Tokens (32 حرفاً على الأقل) | نعم | سلسلة عشوائية مشفرة عالية التعقيد |
| `JWT_REFRESH_SECRET` | المفتاح السري لتوقيع Refresh Tokens (32 حرفاً على الأقل) | نعم | سلسلة عشوائية مختلفة تماماً عن JWT_SECRET |
| `JWT_EXPIRES_IN` | صلاحية Access Token | لا | `1h` |
| `JWT_REFRESH_EXPIRES_IN` | صلاحية Refresh Token | لا | `7d` |
| `CORS_ORIGINS` | النطاقات المسموح لها بالاتصال مفصولة بفاصلة | نعم | `http://localhost:5173,http://localhost:5000` |
| `LOGIN_RATE_LIMIT_MAX` | أقصى محاولات تسجيل دخول مسموحة خلال النافذة | لا | `10` |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | مدة نافذة محاولات تسجيل الدخول بالمللي ثانية | لا | `900000` (15 دقيقة في الإنتاج) |

### 9.2 متغيرات بيئة الواجهة الأمامية (Frontend `.env`)
- `VITE_API_URL`: عنوان الـ Backend API الأساسي (في حال عدم استخدام الـ Proxy المدمج في Vite).
- يتم توجيه الطلبات محلياً عبر `vite.config.ts` حيث يحول أي طلب يبدأ بـ `/api` تلقائياً إلى `http://localhost:5000`.

---

## 10. البنية التحتية والتشغيل والنشر (Deployment & Infrastructure)

### 10.1 خطوات التشغيل المحلي للمطور الجديد (Local Setup Guide)

#### 1. المتطلبات الأساسية
- Node.js إصدار **20.x** أو أحدث.
- خادم PostgreSQL محلي أو سحابي إصدار **15 أو 16**.
- أداة Git و npm.

#### 2. تشغيل الواجهة الخلفية (Backend)
```bash
# الانتقال لمجلد الباك إند
cd WMS_Managment_Backend

# تثبيت الاعتماديات
npm install

# إعداد ملف البيئة
cp .env.example .env
# قم بتعديل DATABASE_URL و JWT_SECRET في ملف .env بقيم حقيقية

# تنفيذ الترحيلات وبناء الجداول
npm run migrate

# بذر البيانات التجريبية المتكاملة
npm run seed:demo:full
# (سيقوم بإنشاء حساب مسؤول: admin / Admin@123 مع بيانات تجريبية)

# تشغيل خادم التطوير (Hot Reload على المنفذ 5000)
npm run dev
```

#### 3. تشغيل الواجهة الأمامية (Frontend)
```bash
# في نافذة طرفية أخرى، الانتقال لمجلد الفرونت إند
cd WMS_Frontend

# تثبيت الاعتماديات
npm install

# تشغيل خادم الواجهة الأمامية (على المنفذ 5173)
npm run dev
```
افتح المتصفح على: `http://localhost:5173` وسجل الدخول باستخدام `admin` / `Admin@123`.

### 10.2 النشر باستخدام Docker & Docker Compose
يحتوي المشروع على تهيئة Docker كاملة للإنتاج:
- **`Dockerfile`:** يعتمد `node:20-alpine` في عملية بناء متعددة المراحل (Multi-stage build)، ويقوم بتشغيل التطبيق عبر مستخدم غير جذري محدود الصلاحيات (`wms:1001`) لتعزيز الأمان، مع تفعيل فحص الصحة التلقائي `HEALTHCHECK` عبر `/health`.
- **`docker-compose.yml`:** يشغل قاعدة بيانات PostgreSQL 16 مهيأة، وخادم الباك إند مع الربط التلقائي وفحص الجاهزية.

```bash
cd WMS_Managment_Backend
docker compose up --build -d
```

### 10.3 سكربتات إدارة قاعدة البيانات والصيانة (`package.json`)
- `npm run migrate`: فحص وتطبيق الترحيلات المعلقة في `migrations/`.
- `npm run seed:admin`: إنشاء حساب المسؤول الافتراضي بشكل آمن ومتكرر (Idempotent).
- `npm run seed:demo:full`: توليد بيئة عمل متكاملة تحوي مستودعات، أصناف، طلبات شراء، وعُهد.
- `npm run reset:admin`: إعادة تعيين كلمة مرور المسؤول إلى القيمة الافتراضية عند نسيانها.

---

## 11. الاختبارات وجودة الكود (Testing & Verification)

### 11.1 الواجهة الخلفية (Backend Suite)
- **الأداة:** Jest + Supertest
- **أمر التشغيل:** `npm test` داخل مجلد `WMS_Managment_Backend`
- **التغطية الفعلية:** **152 اختباراً عبر 22 جناح اختبار (Test Suites)** تغطي:
  - عمليات المصادقة وتجديد وإلغاء الرموز (`tests/auth/`)
  - حماية النطاقات والصلاحيات (`tests/authorization/`, `tests/supervisors/`)
  - حركات المخازن وعمليات القفل والتنافسية (`tests/transactions/`, `tests/purchase-orders/concurrency.test.ts`, `atomicity.test.ts`)
  - دورة طلبات الشراء والاستلام والتخصيص (`tests/purchase-orders/`)
  - دورة طلبات الصرف وربط المشاريع وتوليد العُهد (`tests/material-requests/`, `tests/custodies/`, `tests/projects/`)
  - تقارير الجرد وتنبيهات الصلاحية (`tests/reports/`, `tests/alerts/`)
  - حراس متغيرات البيئة والأمان (`tests/env-required.test.ts`)

### 11.2 الواجهة الأمامية (Frontend Suite)
- **الأداة:** Vitest
- **أمر التشغيل:** `npm test` داخل مجلد `WMS_Frontend`
- **نطاق الاختبار:** فحص تكامل مترجم الأخطاء المركزي (`apiErrors.test.ts`) والتأكد من عدم تسريب أي رسائل خطأ برمجية أو نصوص استعلامات SQL إلى المستخدم النهائي.

---

## 12. المشاكل المعروفة وملاحظات الكود (Known Issues & TODOs)

تم إجراء مسح دقيق وشامل لكافة ملفات الكود للملاحظات المعلقة:

1. **ملاحظة توسعة التوجيه متعدد المستودعات:**
   - **المكان:** `WMS_Managment_Backend/src/modules/material-requests/material-requests.service.ts` (السطر 114)
   - **النص:** `// TODO(multi-warehouse): once the workflow needs per-warehouse targeting`
   - **التفصيل:** في حال امتلاك مدير المستودع أكثر من مستودع مسند في نفس القسم، يختار النظام حالياً المستودع المؤهل الأول تصاعدياً (`warehouse_id ASC`). إذا تطلب العمل مستقبلاً تمكين المستخدم من الاختيار اليدوي بين مستودعاته المسندة، يجب إضافة حقل اختيار بالواجهة.
2. **أداة الفحص الأمامي (Linter Script):**
   - **المكان:** `WMS_Frontend/package.json`
   - **الملاحظة:** السكربت `"lint": "oxlint"` موجود لكن حزمة `oxlint` غير مثبتة في `devDependencies`. هذا لا يعيق البناء والتشغيل (`npm run build` يعمل بنجاح تام)، ولكن يوصى بتثبيتها عبر `npm i -D oxlint` لتفعيل الفحص المصدري.
3. **قاعدة بيانات الاختبار السحابية (Neon DB):**
   - **المكان:** `WMS_Managment_Backend/.env.test`
   - **الملاحظة:** في حال انقطاع الإنترنت أو حجب المنافذ، يفشل الاتصال بقاعدة الاختبار السحابية. تم تجهيز ملفات الاختبار لتعمل بسلاسة ضد نسخة PostgreSQL المحلية عبر استبدال `DATABASE_URL` بقاعدة محلية للاختبارات.
4. **تحذير حجم الحزمة الأمامية (Bundle Chunk Size):**
   - حجم حزمة الجافاسكربت الناتجة بعد البناء يبلغ حوالي ~630 KB، ويظهر Vite تحذيراً خفيفاً؛ يُنصح مستقبلاً بتطبيق التحميل الكسول للصفحات (Lazy Loading عبر `React.lazy`).

---

## 13. تدقيق الأمان والحماية (Security Audit)

| المعيار الأمني | حالة التنفيذ في المشروع | التفاصيل والأدلة |
|---|---|---|
| **تشفير كلمات المرور** | ✅ محمي ومطابق للمعايير | استخدام خوارزمية `bcryptjs` مع أملاح تجزئة قوية، مع استبعاد `password_hash` نهائياً من أي كائن استجابة (`UserRowPublic`). |
| **حقن الاستعلامات (SQL Injection)** | ✅ محمي بالكامل | استخدام Parameterized Queries حصراً (`$1, $2...`) في كافة استعلامات `pg.Pool` دون أي دمج مباشر لنصوص المستخدم. |
| **هجمات القوة الغاشمة (Brute-Force)** | ✅ محمي | تفعيل `express-rate-limit` بحد أقصى 10 محاولات تسجيل دخول لكل 15 دقيقة. |
| **تزوير التوكنات القديمة** | ✅ محمي | فحص الصلاحيات الحية من قاعدة البيانات على كل طلب، مع آلية `token_version` لقطع الجلسات عند تغيير الأدوار. |
| **حماية التنافسية (Race Conditions)** | ✅ محمي بقفل الصفوف | استخدام استعلامات القفل الصريح `FOR UPDATE` في حركات السندات، صرف المواد، والجرد لمنع السحب الزائد للمخزون. |
| **حقوق حاوية Docker** | ✅ محمي | تشغيل التطبيق بحساب مستخدم عادي (`wms:1001`) وليس كـ `root`. |
| **تسريب الأخطاء التقنية للعميل** | ✅ محمي تماماً | الواجهة الأمامية تعزل رسائل السيرفر عبر `apiErrors.ts` وتعرض رسائل عامة ومترجمة، مع منع تسريب بنية قاعدة البيانات. |
| **حراس بدء التشغيل (Startup Guards)** | ✅ محمي | دالة `assertSafeEnv()` تمنع الخادم من العمل في بيئة الإنتاج إذا كانت المفاتيح السرية هي القيم الافتراضية، أو إذا كانت قاعدة البيانات تشير إلى localhost في الإنتاج. |

---

## 14. مراجعة الاعتماديات (Dependencies Review)

### حزم موصى بتثبيتها أو تحديثها:
1. **`oxlint` (Frontend):** إضافة `npm i -D oxlint` في الفرونت إند لتشغيل أمر `npm run lint` بنجاح.
2. **صادرات غير مستخدمة (Unused Dead Exports):**
   - الدالة `reportsApi.getItemCard` و الـ Hook المسمى `useItem` في الفرونت إند يمكن تنظيفهما حيث تعتمد الواجهة الحالية على `itemsApi.getById` المعزز.

---

## 15. خارطة الطريق والمهام القادمة (Next Steps & Roadmap)

تم ترتيب المهام المقترحة للمهندس القادم حسب الأولوية الفنية والتشغيلية:

### 🔴 أولاً: مهام عاجلة وموصى بها عند بدء الاستلام (High Priority)
1. **تثبيت أداة فحص الكود للفرونت إند:** تشغيل `npm i -D oxlint` في مجلد `WMS_Frontend` للتأكد من نجاح أمر الفحص المكتبي.
2. **تجهيز متغيرات الإنتاج:** التأكد من توليد مفاتيح عشوائية آمنة لـ `JWT_SECRET` و `JWT_REFRESH_SECRET` بطول 64 محرفاً عند النشر الفعلي.

### 🟡 ثانياً: تحسينات وتوسعات متوسطة الأولوية (Medium Priority)
1. **التحميل الكسول للمسارات (Code Splitting & Lazy Loading):**
   - تعديل استيراد الصفحات في `App.tsx` لاستخدام `React.lazy(() => import(...))` لتقليل حجم التحميل الأولي للواجهة من ~630 KB إلى أقل من 150 KB.
2. **توسيع محدد المستودعات لمدير المستودع متعدد الإسنادات:**
   - إتاحة قائمة منسدلة لاختيار المستودع الوجهة في نموذج طلب المواد في حال كان لدى المدير أكثر من مستودع مسند في القسم.
3. **تصدير التقارير (Excel / PDF Export):**
   - إضافة إمكانية تصدير تقارير الجرد وبطاقات الأصناف إلى ملفات Excel أو PDF من الواجهة مباشرة.

### 🟢 ثالثاً: مميزات إضافية للمستقبل (Future Enhancements)
1. **نظام قراءة الباركود و QR Code:**
   - ربط ماسحات الباركود بكاميرا الهاتف أو أجهزة المسح الضوئي لسرعة البحث عن الأصناف وأثناء عمليات الجرد الدوري.
2. **إشعارات الويب المباشرة (WebSockets / Push Notifications):**
   - إرسال تنبيهات لحظية عند وصول طلب صرف جديد أو اعتماد أمر شراء دون الحاجة لتحديث الصفحة.

---

## 🏁 الخلاصة والإقرار الفني

> **إقرار التسليم الفني:**  
> تم فحص هذا المشروع والتحقق منه بنجاح عبر الفحص الساكن (Static Analysis)، والبناء الإنتاجي (Production Build للباك إند والفرونت إند)، ومطابقة الاختبارات الآلية (152/152 اختبار ناجح).  
> النظام مهيأ هندسياً بأعلى معايير الجودة، وقاعدة البيانات محكمة بالزنادات والقيود والمعاملات المتسقة، والهيكل البرمجي واضح ومفصول الطبقات. يستطيع أي مهندس برمجيات جديد الانطلاق في صيانة وتطوير النظام مباشرة بالاعتماد على هذا التقرير.

**انتهى تقرير التسليم الفني الشامل.**
