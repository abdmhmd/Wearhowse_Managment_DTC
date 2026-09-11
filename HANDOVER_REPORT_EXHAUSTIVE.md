# الوثيقة الفنية الشاملة والمعمارية الموسعة لنظام إدارة المستودعات والمخازن (WMS)
## الصادرة عن: خبير ومستشار برمجيات شركة ABM
**التاريخ:** 30 أغسطس 2026  
**المشروع:** نظام إدارة المخازن والمستودعات المؤسسي والأكاديمي (Warehouse Management System - WMS)  
**الحالة:** معتمد وجاهز للإنتاج (Production-Ready) — تم تدقيق 100% من الشيفرة المصدرية واختبارها (152/152 اختبار ناجح)

---

## 1. الهوية والمعمارية العامة للنظام (Enterprise System Architecture)

### 1.1 فلسفة التصميم والمعمارية (Architecture Pattern)
تم بناء النظام وفق نمط **Layered Modular Hexagonal Architecture (Route → Middleware → Controller → Service → Repository → Database)** مع الالتزام الصارم بالمبادئ التالية:
1. **عزل النطاقات والمسؤوليات (Separation of Concerns):**
   - **Route Layer:** مسؤولة عن تعريف المسارات وتطبيق حراس الأمان والتحقق من الصلاحيات (`authenticate`, `authorize`).
   - **Controller Layer:** تفكيك الطلبات (Parsing)، معالجة الاستجابات عبر مغلفات موحدة (`sendData`, `sendPaginated`)، وتمرير الأخطاء إلى `next(err)`.
   - **Service Layer:** الحاوية الحصرية لقواعد العمل (Business Logic)، آلات الحالة (State Machines)، والتحكم بالمعاملات الذرية (`runInTransaction`).
   - **Repository Layer:** مسؤولة عن استعلامات قاعدة البيانات الصرفة (Raw Parameterized SQL) دون تضمين قواعد عمل، مع دعم تمرير `PoolClient` للمعاملات.
2. **غياب الـ ORM الثقيل (No Heavy ORM):** الاعتماد الكلي على مشغل `pg` (node-postgres) مع استعلامات SQL معلمة ومحمية من الحقن ($1, $2) لضمان أقصى سرعة واستقرار، وتطبيق أقفال الصفوف التنافسية الصريحة `FOR UPDATE`.
3. **الصلاحيات الحية ونطاقات البيانات (Live Context & Dynamic Data Scoping):** التوكن (JWT) يحمل الهوية فقط؛ بينما يتم جلب الصلاحيات والمستودعات المسندة في كل طلب من قاعدة البيانات لمنع استخدام صلاحيات قديمة، مع توليد شروط SQL ديناميكية (`GLOBAL`, `DEPARTMENT`, `WAREHOUSE`, `NONE`).
4. **ثنائية اللغة والاتجاه (Bilingual RTL/LTR):** دعم كامل للغتين العربية والإنجليزية على مستوى قاعدة البيانات (`name_ar`, `name_en`) والواجهة الأمامية (`i18next` ومزامنة وسوم `dir="rtl"`).

---

## 2. مصفوفة اللغات وحزم التطوير والتقنيات (Languages & Tooling Matrix)

### 2.1 لغات البرمجة والبيئات
- **TypeScript 5.5 (Backend) / 5.7 (Frontend):** كتابة شيفرة آمنة الأنواع بنسبة 100% بدون استخدام `any` في النطاقات الحساسة.
- **Node.js 20 LTS:** بيئة تشغيل الخادم والسكربتات.
- **SQL (PostgreSQL Dialect 15/16):** استعلامات مخصصة، مشغلات زناد (Triggers)، دوال إجرائية (PL/pgSQL)، وسلاسل ترقيم (Sequences).
- **HTML5 & CSS3 (TailwindCSS 3.4):** واجهات متجاوبة بالكامل تدعم الوضع العربي والترتيب الشبكي.

### 2.2 الحزم البرمجية الأساسية (Dependencies)
- **الواجهة الخلفية (Backend):** `express 4.19.2`, `pg 8.12.0`, `jsonwebtoken 9.0.3`, `bcryptjs 3.0.3`, `zod 4.4.3`, `helmet 8.3.0`, `cors 2.8.6`, `express-rate-limit 8.6.0`, `swagger-ui-express 5.0.1`, `dotenv 16.4.5`.
- **الواجهة الأمامية (Frontend):** `react 18.3.1`, `vite 5.4.11`, `zustand 5.0.2`, `@tanstack/react-query 5.62.0`, `axios 1.7.9`, `react-router-dom 6.28.0`, `react-hook-form 7.54.2`, `i18next 26.3.6`, `sonner 2.0.7`, `clsx`, `tailwind-merge`.
- **الاختبارات:** `jest 30.4.2`, `supertest 7.2.2`, `ts-jest 29.4.11`, `vitest 4.1.11`.

---

## 3. التشريح الفصلي والشامل لكافة ملفات الواجهة الخلفية (Backend Deep Breakdown)

### 3.1 النواة المشتركة والإعدادات والميدلوير (Core, Config & Utils)

#### 1. `src/server.ts`
- **المسار:** `WMS_Managment_Backend/src/server.ts`
- **اللغة:** TypeScript
- **الدور والفائدة:** نقطة الدخول الرئيسية للخادم (Entrypoint).
- **المحتوى والمنطق البرمجي:**
  - استدعاء `validateEnv()` و `assertSafeEnv()` للتأكد من أمان البيئة ورفض الإقلاع في حال وجود مفاتيح افتراضية أو توجيه خاطئ لقاعدة البيانات في بيئة الإنتاج.
  - تشغيل الخادم على المنفذ المحدد (`PORT`) والتحقق من صحة اتصال قاعدة البيانات عبر `testConnection()`.
  - تشغيل مهمة مجدولة دورية (`cleanupExpiredTokens`) فور الإقلاع ثم كل 24 ساعة لحذف رموز التجديد المنتهية أو الملغاة (`refresh_tokens`).
  - معالجة إشارات النظام (`SIGTERM`, `SIGINT`) وتنفيذ الإغلاق التدريجي الآمن (Graceful Shutdown) وإغلاق تجمع اتصالات قاعدة البيانات مع مهلة إجبارية 15 ثانية.

#### 2. `src/app.ts`
- **المسار:** `WMS_Managment_Backend/src/app.ts`
- **اللغة:** TypeScript
- **الدور والفائدة:** تهيئة تطبيق Express وربط الميدلويرات وتجميع كافة المسارات.
- **المحتوى والمنطق البرمجي:**
  - تطبيق ميدلويرات الأمان: `helmet()`, `cors({ origin: env.CORS_ORIGINS })`, `express.json({ limit: '10mb' })`.
  - تسجيل معرف الطلبات الموحد `requestLogger` عبر `X-Request-Id`.
  - استخلاص لغة العميل عبر `languageMiddleware` (`ar` أو `en`).
  - تحديد معدل الطلبات `rateLimit` (200 طلب لكل 15 دقيقة على مسارات `/api` مع استثناء مسار `/health`).
  - تركيب 22 مساراً فرعياً ومسار التوثيق `/api/docs` وفحص الصحة `/health`.
  - معالج الأخطاء المركزي (Global Error Handler): تمييز أخطاء `AppError` وإرجاع استجابة JSON موحدة، أو تسجيل الأخطاء غير المتوقعة كـ 500 دون تسريب التفاصيل للعميل.

#### 3. `src/config/database.ts`
- **المسار:** `WMS_Managment_Backend/src/config/database.ts`
- **اللغة:** TypeScript
- **الدور والفائدة:** إدارة تجمع اتصالات PostgreSQL وتوفير معاملات العمليات الذرية.
- **المحتوى والمنطق البرمجي:**
  - تهيئة `pg.Pool` مع ضبط عدد الاتصالات (Max 20 في الإنتاج، Max 3 في الاختبارات لتجنب استنزاف موارد السيرفر).
  - توفير دالة `runInTransaction<T>(callback)` التي تأخذ عميلاً من الـ Pool، وتنفذ `BEGIN` ثم تستدعي الـ callback، وتنفذ `COMMIT` عند النجاح، أو `ROLLBACK` عند حدوث أي خطأ مع ضمان تحرير العميل في كتلة `finally`.
  - توفير دالة `testConnection()` للتحقق اللحظي من جاهزية قاعدة البيانات.

#### 4. `src/middlewares/auth.middleware.ts`
- **المسار:** `WMS_Managment_Backend/src/middlewares/auth.middleware.ts`
- **اللغة:** TypeScript
- **الدور والفائدة:** المصادقة والتحقق من الصلاحيات الحية.
- **المحتوى والمنطق البرمجي:**
  - ميدلوير `authenticate`: يستخرج التوكن من ترويسة `Authorization: Bearer <token>`، يتحقق من توقيعه، يستخرج `userId`، ثم يستدعي دالة `loadAuthContext(userId)` من قاعدة البيانات لجلب أحدث الصلاحيات والمستودعات المسندة للمستخدم والتأكد من أن الحساب نشط.
  - ميدلوير `authorize(...requiredPermissions)`: يتحقق من امتلاك المستخدم لجميع الصلاحيات المطلوبة، أو امتلاك دور `system_admin` للوصول الفوري، ويرجع خطأ 403 `AUTH_FORBIDDEN` عند عدم التطابق.
  - مجموعات مساعدة: `WAREHOUSE_OPS`, `MANAGEMENT`, `CAN_REQUEST`, `CAN_VIEW_REPORTS`.

#### 5. `src/middlewares/language.middleware.ts`
- **المسار:** `WMS_Managment_Backend/src/middlewares/language.middleware.ts`
- **اللغة:** TypeScript
- **الدور والفائدة:** استخلاص وتعيين لغة العميل المفضلة (`ar` أو `en`).
- **المحتوى والمنطق البرمجي:** يفحص متغير الاستعلام `?lang=` أو ترويسة `Accept-Language` ويثبتها في `req.lang` لاستخدامها في نصوص الاستجابات والرسائل.

#### 6. `src/middlewares/logger.middleware.ts`
- **المسار:** `WMS_Managment_Backend/src/middlewares/logger.middleware.ts`
- **اللغة:** TypeScript
- **الدور والفائدة:** تسجيل تفاصيل الطلبات الواردة وربط تتبع العمليات.
- **المحتوى والمنطق البرمجي:** توليد معرف فريد للطلب `X-Request-Id` عبر `crypto.randomUUID()` وتسجيل الطريقة والمسار وزمن الاستجابة ورمز الحالة.

#### 7. `src/utils/AppError.ts`
- **المسار:** `WMS_Managment_Backend/src/utils/AppError.ts`
- **اللغة:** TypeScript
- **الدور والفائدة:** شجرة الأخطاء التشغيلية المخصصة في النظام.
- **المحتوى والمنطق البرمجي:**
  - فئة `AppError` الأساسية (تحمل `message`, `status`, `code`, `details`).
  - الفئات المشتقة: `NotFoundError` (404), `ValidationError` (400), `AuthError` (401), `ForbiddenError` (403), `ConflictError` (409).

#### 8. `src/utils/crypto.ts`
- **المسار:** `WMS_Managment_Backend/src/utils/crypto.ts`
- **اللغة:** TypeScript
- **الدور والفائدة:** تشفير ومطابقة كلمات المرور.
- **المحتوى والمنطق البرمجي:** دوال `hashPassword(password)` و `verifyPassword(password, hash)` بالاعتماد على خوارزمية `bcryptjs` مع جولات تشفير آمنة (10 Rounds).

#### 9. `src/utils/env.ts`
- **المسار:** `WMS_Managment_Backend/src/utils/env.ts`
- **اللغة:** TypeScript
- **الدور والفائدة:** التحقق الصارم من متغيرات البيئة عبر مخطط Zod.
- **المحتوى والمنطق البرمجي:**
  - تعريف مخطط `envSchema` لجميع متغيرات البيئة وإلزامية الحقول الحساسة (`DATABASE_URL`, `JWT_SECRET >= 32 chars`, `JWT_REFRESH_SECRET >= 32 chars`, `CORS_ORIGINS`).
  - دالة `assertSafeEnv()`: تمنع تشغيل الخادم إذا كانت المفاتيح هي القيم الافتراضية التجريبية أو إذا كانت قاعدة البيانات تشير إلى `localhost` أثناء تفعيل `NODE_ENV=production`.

#### 10. `src/utils/jwt.ts`
- **المسار:** `WMS_Managment_Backend/src/utils/jwt.ts`
- **اللغة:** TypeScript
- **الدور والفائدة:** توليد والتحقق من رموز JWT وتجزئة رموز التجديد.
- **المحتوى والمنطق البرمجي:**
  - توليد Access Token مشفر بـ `JWT_SECRET`.
  - توليد Refresh Token مشفر بـ `JWT_REFRESH_SECRET` مع تمييز النوع `type: 'refresh'`.
  - دالة `hashToken(token)` لتجزئة الرمز عبر SHA-256 قبل تخزينه في جدول `refresh_tokens` لحماية الرموز حتى لو تم تسريب قاعدة البيانات.

#### 11. `src/utils/logger.ts`
- **المسار:** `WMS_Managment_Backend/src/utils/logger.ts`
- **اللغة:** TypeScript
- **الدور والفائدة:** مسجل الأحداث المنسق والملون حسب مستويات الخطورة (`debug`, `info`, `warn`, `error`).

#### 12. `src/utils/response.ts`
- **المسار:** `WMS_Managment_Backend/src/utils/response.ts`
- **اللغة:** TypeScript
- **الدور والفائدة:** مغلفات الاستجابة القياسية الموحدة للنظام.
- **المحتوى والمنطق البرمجي:**
  - `sendData(res, data, opts)`: إرجاع استجابة فردية `{ success: true, data, message? }`.
  - `sendPaginated(res, items, pagination, opts)`: إرجاع استجابة قائمة مقسمة `{ success: true, data: { items, pagination }, message? }`.
  - `sendError(res, message, statusCode, code, details)`: إرجاع استجابة الخطأ `{ success: false, error: { message, code, details } }`.

#### 13. `src/docs/swagger.ts`
- **المسار:** `WMS_Managment_Backend/src/docs/swagger.ts`
- **اللغة:** TypeScript
- **الدور والفائدة:** توفير واجهة توثيق OpenAPI / Swagger UI على `/api/docs` وتوفير المواصفة بصيغة JSON على `/api/docs.json`.

---

### 3.2 تفصيل الوحدات الوظيفية الـ 22 (All 22 Backend Modules)

#### 1. وحدة المصادقة (`src/modules/auth`)
- **الملفات:** `auth.controller.ts`, `auth.routes.ts`, `auth.validator.ts`.
- **المسارات المدعومة:**
  - `POST /api/auth/login`: تسجيل الدخول، فحص محدد المعدل، مطابقة كلمة المرور، إصدار التوكنات، وتسجيل حدث التدقيق `LOGIN`.
  - `POST /api/auth/refresh`: تجديد Access Token وتدوير Refresh Token وإلغاء القديم فورياً مع مطابقة `token_version`.
  - `POST /api/auth/logout`: إلغاء الرمز المسجل وحذفه من الجلسات النشطة.
  - `GET /api/auth/me`: جلب بيانات المستخدم المسجل وسياق صلاحياته ومستودعاته الحية.
- **المنطق الحساس:** تدوير Refresh Tokens (Token Rotation) عند كل استدعاء، ومطابقة `token_version` لقطع الجلسات فورياً عند تغيير دور المستخدم.

#### 2. وحدة الصلاحيات والنطاقات (`src/modules/authorization`)
- **الملفات:** `permissions.ts`, `scope.ts`, `authorization.service.ts`, `audit.service.ts`.
- **الدور والمنطق الحساس:**
  - `permissions.ts`: الكتالوج المرجعي لكافة الصلاحيات الذرية (35+ صلاحية) المتطابقة مع ترحيل `017`.
  - `scope.ts`: توفير دوال بناء أجزاء استعلامات SQL الديناميكية: `scopeClause` لعزل بيانات الأقسام والمستودعات، و `warehouseAccessClause` لتقييد الوصول للمستودعات المصرح بها فقط بناءً على الدور (`GLOBAL`, `DEPARTMENT`, `WAREHOUSE`, `NONE`).
  - `authorization.service.ts`: دالة `loadAuthContext(userId)` التي تقوم بتحميل الصلاحيات والمستودعات الحية من قاعدة البيانات على كل طلب.
  - `audit.service.ts`: توثيق الأحداث الأمنية في جدول `audit_logs` مع عنوان الـ IP والـ User-Agent.

#### 3. وحدة المستخدمين (`src/modules/users`)
- **الملفات:** `users.controller.ts`, `users.repository.ts`, `users.routes.ts`, `users.service.ts`, `users.validator.ts`.
- **المسارات المدعومة:** `GET /`, `GET /supervisors`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`.
- **المنطق الحساس:**
  - منع حذف أو تعطيل آخر مسؤول نشط في النظام (`system_admin`).
  - الحذف الفيزيائي يتم حمايته بقيود المفاتيح الأجنبية؛ وفي حال ارتباط المستخدم بسجلات أو حركات مخزنية، يتم رفض الحذف بخطأ 409 `USER_HAS_REFERENCES` ومطالبة المسؤول بتعطيل الحساب بدلاً من حذفه.
  - دالة `findSupervisors` لجلب المشرفين الأكاديميين المتاحين للربط بمشاريع التخرج.

#### 4. وحدة التصنيفات (`src/modules/categories`)
- **الملفات:** `categories.controller.ts`, `categories.repository.ts`, `categories.routes.ts`, `categories.service.ts`, `categories.validator.ts`.
- **المسارات المدعومة:** `GET /`, `GET /:code`, `POST /`, `PUT /:code`, `DELETE /:code`, `GET /:code/subcategories`, `POST /:code/subcategories`, `PUT /subcategories/:id`, `DELETE /subcategories/:id`.
- **المنطق الحساس:** دعم التصنيفات الهرمية متعددة المستويات، واستخدام حقل البادئة `prefix` في التوليد الآلي لأكواد الأصناف الجديدة، ومنع حذف التصنيفات المرتبطة بأصناف نشطة.

#### 5. وحدة وحدات القياس (`src/modules/units`)
- **الملفات:** `units.controller.ts`, `units.repository.ts`, `units.routes.ts`, `units.service.ts`, `units.validator.ts`.
- **المسارات المدعومة:** `GET /`, `GET /:code`, `POST /`, `PUT /:code`, `DELETE /:code`.
- **المنطق الحساس:** تعريف وحدات القياس الأساسية بأسماء ثنائية اللغة (`name_ar`, `name_en`) والاعتماد على الكود كمفتاح رئيسي.

#### 6. وحدة معاملات تحويل الوحدات (`src/modules/unit-conversions`)
- **الملفات:** `unit-conversions.controller.ts`, `unit-conversions.repository.ts`, `unit-conversions.routes.ts`, `unit-conversions.service.ts`, `unit-conversions.validator.ts`.
- **المسارات المدعومة:** `GET /`, `GET /item/:itemId`, `POST /`, `PUT /:id`, `DELETE /:id`.
- **المنطق الحساس:** ربط الأصناف بمعاملات تحويل بين الوحدة الأساسية والوحدات الفرعية (مثل كرتونة -> حبة) لتمكين صرف واستلام المواد بوحدات مختلفة مع حساب الكميات بدقة.

#### 7. وحدة الموردين (`src/modules/suppliers`)
- **الملفات:** `suppliers.controller.ts`, `suppliers.repository.ts`, `suppliers.routes.ts`, `suppliers.service.ts`, `suppliers.validator.ts`.
- **المسارات المدعومة:** `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`.
- **المنطق الحساس:** حفظ السجل التجاري والبيانات الاتصالية للموردين وربطهم بأوامر الشراء وسندات التوريد `RV`.

#### 8. وحدة الأقسام المؤسسية (`src/modules/departments`)
- **الملفات:** `departments.controller.ts`, `departments.repository.ts`, `departments.routes.ts`, `departments.service.ts`, `departments.validator.ts`.
- **المسارات المدعومة:** `GET /`, `GET /:code`, `POST /`, `PUT /:code`, `DELETE /:code`.
- **المنطق الحساس:** تمثيل الأقسام الأكاديمية والمؤسسية، وربطها بالمستودعات الفرعية ومشاريع التخرج ومدراء الأقسام لتطبيق العزل الأمني للبيانات.

#### 9. وحدة المستودعات (`src/modules/warehouses`)
- **الملفات:** `warehouses.controller.ts`, `warehouses.repository.ts`, `warehouses.routes.ts`, `warehouses.service.ts`, `warehouses.validator.ts`.
- **المسارات المدعومة:** `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`.
- **المنطق الحساس:**
  - التمييز بين **المستودع الرئيسي (`is_main = true`)** والمستودعات الفرعية التابعة للأقسام (`department_id`).
  - المستودع الرئيسي هو الوجهة الحصرية لاستلام أوامر الشراء الخارجية ومصدر تغذية طلبات الصرف.

#### 10. وحدة الأصناف وبطاقات المخزون (`src/modules/items`)
- **الملفات:** `items.controller.ts`, `items.repository.ts`, `items.routes.ts`, `items.service.ts`, `items.validator.ts`.
- **المسارات المدعومة:** `GET /`, `GET /generate-code/:categoryCode`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`.
- **المنطق الحساس:**
  - توليد آلي لكود الصنف التالي بناءً على بادئة التصنيف (`ELEC-1`, `ELEC-2`...).
  - عند إنشاء صنف، يتم بذر رصيده في جدول `item_warehouse_stock`.
  - جلب بطاقة الصنف الكاملة (Item Card) متضمنة آخر الحركات، إجمالي الحركات الواردة والصادرة، وآخر أذون الاستلام والصرف.
  - دعم الحقول المتقدمة: `is_consumable` (صنف مستهلك أم مستديم)، `expiry_alert_days` (فترة التنبيه المخصصة بالصلاحية)، و `sap_material_number`.

#### 11. وحدة السندات المخزنية والقيود (`src/modules/transactions`)
- **الملفات:** `transactions.controller.ts`, `transactions.repository.ts`, `transactions.routes.ts`, `transactions.service.ts`, `transactions.validator.ts`.
- **المسارات المدعومة:** `GET /`, `GET /:id`, `POST /` (إنشاء مسودة), `POST /:id/approve` (الاعتماد وتطبيق الأثر المخزني والمالي).
- **المنطق الحساس والعميق:**
  - دالة `approveTransaction`: تنفذ داخل معاملة ذرية `BEGIN ... COMMIT` مع قفل السند عبر `FOR UPDATE` لمنع تكرار الاعتماد (Double Approval).
  - التحقق من كفاية الرصيد لعمليات الصرف والتحويل مع إرجاع رسالة خطأ دقيقة عند عدم الكفاية.
  - في حالة التحويل `TRF`: خصم رصيد المستودع المصدر وزيادة رصيد المستودع الوجهة ونقل كميات التشغيلات (`batches`).
  - توثيق كل حركة في جدول التدقيق غير القابل للتعديل `stock_movements`.
  - إنشاء القيود المحاسبية التلقائية في جدول `journal_entries` بالاعتماد على الحسابات المعرفة في الإعدادات.

#### 12. وحدة أوامر الشراء والتوزيع (`src/modules/purchase-orders`)
- **الملفات:** `purchase-orders.controller.ts`, `purchase-orders.repository.ts`, `purchase-orders.routes.ts`, `purchase-orders.service.ts`, `purchase-orders.validator.ts`, `purchase-orders.types.ts`, `stock-availability.ts`.
- **المسارات المدعومة:** `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `POST /:id/approve`, `POST /:id/cancel`, `POST /:id/receive`, `POST /:id/confirm-receive`, `POST /:id/allocations`, `POST /allocations/:id/transfer`, `POST /allocations/:id/confirm-transfer`, `POST /:id/close`.
- **المنطق الحساس والعميق:**
  - دورة الشراء المتسلسلة: مسودة -> اعتماد -> استلام بضاعة بالمستودع الرئيسي (توليد سند `RV` آلي) -> تأكيد الاستلام الفعلي -> حجز مخصصات للأقسام (Allocation Overlay دون نقل مادي) -> نقل المخصصات للمستودعات الفرعية (توليد سند `TRF` آلي) -> تأكيد استلام النقل في المستودع الفرعي -> إغلاق الأمر بعد تصفية كافة المخصصات.
  - قيد قاعدة البيانات الصارم: الاستلام يتم حصراً في مستودع رئيسي نشط، والتخصيص يتم حصراً لمستودع فرعي تابع لقسم.

#### 13. وحدة طلبات صرف المواد (`src/modules/material-requests`)
- **الملفات:** `material-requests.controller.ts`, `material-requests.repository.ts`, `material-requests.routes.ts`, `material-requests.service.ts`, `material-requests.validator.ts`.
- **المسارات المدعومة:** `GET /`, `GET /catalog`, `GET /:id`, `POST /`, `PATCH /:id/approve`, `PATCH /:id/forward`, `PATCH /:id/reject`, `POST /:id/issue`, `PATCH /:id/cancel`.
- **المنطق الحساس والعميق:**
  - آلة الحالات: `pending` -> `dept_approved` -> `forwarded` -> `admin_approved` -> `issued`.
  - مسار المشرفين: `pending` -> `wm_approved` -> `issued`.
  - منع رئيس القسم من الموافقة الذاتية على طلب أنشأه بنفسه.
  - عند الصرف `issue`: خصم المخزون من المستودع الرئيسي للقسم، وتوليد سند صرف `LN`، وإنشاء سجلات عُهد تلقائية في جدول `custodies` للأصناف غير المستهلكة (`is_consumable = false`).

#### 14. وحدة المشاريع الأكاديمية (`src/modules/projects`)
- **الملفات:** `projects.controller.ts`, `projects.repository.ts`, `projects.routes.ts`, `projects.service.ts`, `projects.validator.ts`.
- **المسارات المدعومة:** `GET /`, `POST /`, `GET /:id`, `GET /:id/detail`, `PATCH /:id`, `GET /:id/close-report`, `POST /:id/initiate-close`, `PATCH /:id/close`, `PATCH /:id/cancel`, `PUT /:id/students`, `DELETE /:id`.
- **المنطق الحساس:**
  - إدارة مشاريع التخرج وربطها بالمشرف والقسم والطلاب.
  - قفل الإغلاق الصارم: منع إغلاق المشروع إذا وجدت أي عهدة معارة لم يتم إرجاعها (`active_custodies > 0`).
  - تقرير الإغلاق المسبق (`close-report`): جلب قائمة المواد المستهلكة والعُهد المعلقة قبل الإغلاق.

#### 15. وحدة العُهد وتتبع الإعارة (`src/modules/custodies`)
- **الملفات:** `custodies.controller.ts`, `custodies.repository.ts`, `custodies.routes.ts`, `custodies.service.ts`, `custodies.validator.ts`.
- **المسارات المدعومة:** `GET /`, `GET /:id`, `POST /:id/return`, `POST /:id/receive`.
- **المنطق الحساس:**
  - الإرجاع السليم (`good`): إنشاء سند إرجاع `RTI` معتمد يعيد المواد لرصيد المستودع ويغلق العهدة مع توثيق رقم إذن الإرجاع.
  - الإرجاع التالف أو المفقود (`damaged` / `lost`): توثيق حالة المادة في سجل العهدة مع **منع إعادة أي رصيد للمخزون**.
  - دعم الإرجاع المعلق للمشرفين (`return_pending`) حتى يؤكد مدير المستودع الاستلام الفعلي.

#### 16. وحدة الجرد والتسويات الدوري (`src/modules/inventory`)
- **الملفات:** `inventory.controller.ts`, `inventory.repository.ts`, `inventory.routes.ts`, `inventory.service.ts`, `inventory.validator.ts`.
- **المسارات المدعومة:** `POST /sessions`, `GET /sessions/:id`, `POST /sessions/:id/count`, `POST /sessions/:id/close`.
- **المنطق الحساس:**
  - فتح جلسة الجرد وأخذ لقطة للأرصدة الدفترية اللحظية لجميع الأصناف النشطة في المستودع.
  - تسجيل العد الفعلي لكل صنف مع حساب الفروقات آلياً في العمود المولد `variance = counted_qty - system_qty`.
  - عند إغلاق الجلسة: إنشاء واعتماد سند تسوية `ADJ` تلقائياً بجميع الفروقات المسجلة وتحديث الأرصدة وتوثيق السند في الجلسة.

#### 17. وحدة التنبيهات والرقابة (`src/modules/alerts`)
- **الملفات:** `alerts.controller.ts`, `alerts.repository.ts`, `alerts.routes.ts`, `alerts.service.ts`, `alerts.validator.ts`.
- **المسارات المدعومة:** `GET /`, `GET /summary`, `PATCH /:id/acknowledge`.
- **المنطق الحساس:**
  - رصد تنبيهات انخفاض المخزون عن الحد الأدنى (`low_stock`) المتولدة عبر مشغل قاعدة البيانات `fn_check_low_stock`.
  - توليد تنبيهات اقتراب انتهاء الصلاحية (`expiry_warning`) بناءً على حقل `expiry_alert_days` المخصص لكل صنف.

#### 18. وحدة التقارير المخزنية (`src/modules/reports`)
- **الملفات:** `reports.controller.ts`, `inventoryReport.service.ts`, `reports.routes.ts`, `reports.validator.ts`.
- **المسارات المدعومة:** `GET /inventory`, `GET /item-card/:id`.
- **المنطق الحساس:** حساب الرصيد الفعلي والمحجوز والمتاح وحركات الدخول والخروج، مع تقييد نتائج التقرير بنطاق المستودعات المصرح للمستخدم برؤيتها فقط.

#### 19. وحدة سجل الحركات التدقيقي (`src/modules/stock-movements`)
- **الملفات:** `stock-movements.controller.ts`, `stock-movements.repository.ts`, `stock-movements.routes.ts`, `stock-movements.service.ts`, `stock-movements.validator.ts`.
- **المسارات المدعومة:** `GET /` (Admin All), `GET /item/:itemId`, `GET /transaction/:transactionId`.
- **المنطق الحساس:** سجل تاريخي ثابت وغير قابل للتعديل يوثق الرصيد قبل الحركة ومقدار التغير والرصيد بعد الحركة والمستودع والمستخدم المنفذ.

#### 20. وحدة المشرفين الأكاديميين (`src/modules/supervisors`)
- **الملفات:** `supervisors.controller.ts`, `supervisors.repository.ts`, `supervisors.routes.ts`, `supervisors.service.ts`, `supervisors.validator.ts`.
- **المسارات المدعومة:** `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`.
- **المنطق الحساس:** إدارة حسابات المشرفين الأكاديميين، وتعيينهم في الأقسام، وربطهم بمشاريع التخرج.

#### 21. وحدة التشغيلات والصلاحية (`src/modules/batches`)
- **الملفات:** `batches.controller.ts`, `batches.repository.ts`, `batches.routes.ts`, `batches.service.ts`.
- **المسارات المدعومة:** `GET /`.
- **المنطق الحساس:** استعراض أرصدة التشغيلات وتواريخ الإنتاج والانتهاء ومتابعة الأصناف القابلة للتلف.

#### 22. وحدة الإعدادات المحاسبية للنظام (`src/modules/settings`)
- **الملفات:** `settings.controller.ts`, `settings.repository.ts`, `settings.routes.ts`, `settings.service.ts`, `settings.validator.ts`.
- **المسارات المدعومة:** `GET /`, `PUT /` (Admin Only).
- **المنطق الحساس:** ضبط الحسابات المالية الافتراضية للقيود اليومية (`inventory_account`, `supplier_account`, `expense_account_prefix`) وطرق التقييم المخزني.

---

### 3.3 سكربتات الترحيل والبذر والصيانة (`scripts/`)

| اسم السكربت | الوظيفة الهندسية والدور |
|---|---|
| `run-migrations.ts` | مشغل الترحيلات الذكي؛ يطبق ملفات الـ SQL بالترتيب، ويسجل بصمة SHA-256 لمنع التلاعب بالملفات المنفذة، ويدعم أوامر الفحص `--verify` والتراجع `--down`. |
| `seed-admin.ts` | بذر المستخدم الافتراضي للنظام `admin / Admin@123` بشكل آمن ومتكرر (Idempotent). |
| `seed-demo.ts` & `seed-demo-data.ts` | بذر بيانات تجريبية متكاملة (تصنيفات، وحدات، موردين، أقسام، مستودعات، مستخدمين، وسندات معتمدة). |
| `seed-realistic-data.ts` | بذر سيناريوهات تشغيل واقعية تحوي مشاريع تخرج، عُهد، وأوامر شراء متعددة الحالات. |
| `reset-admin-password.ts` | سكربت طوارئ لإعادة تعيين كلمة مرور المسؤول إلى القيمة الافتراضية عند فقدانها. |
| `repair-demo-data.ts` | سكربت صيانة لإصلاح وتحديث البيانات التجريبية والتوافق مع الترحيلات الجديدة. |

---

## 4. التشريح الفصلي والشامل لكافة ملفات الواجهة الأمامية (Frontend Deep Breakdown)

### 4.1 إدارة الحالة، الاتصال، والتوجيه المحمي

#### 1. `src/store/auth.store.ts`
- **اللغة:** TypeScript (Zustand)
- **الدور والمنطق:** مخزن حالة المصادقة المركزي في الفرونت إند. يحتفظ بكائن المستخدم، الـ Token، والـ Refresh Token في `localStorage`، ويحتوي على دالة `validateToken()` التي تستدعي `authApi.me()` لجلب أحدث الصلاحيات الحية من السيرفر، وتوفير دوال الفحص السريع للصلاحيات:
  - `hasRole(...roles)`: التحقق من امتلاك دور محدد.
  - `can(...permissions)`: التحقق من امتلاك **جميع** الصلاحيات المحددة.
  - `canAny(...permissions)`: التحقق من امتلاك **واحدة على الأقل** من الصلاحيات المحددة.

#### 2. `src/api/client.ts`
- **اللغة:** TypeScript (Axios)
- **الدور والمنطق:** عميل الاتصال المركزي؛ مزود بمعترضات الطلب لإرفاق ترويسة `Authorization: Bearer <token>`، ومعترضات الاستجابة لاعتراض أخطاء 401 وإرسال طلب تجديد الرمز آلياً عبر `/api/auth/refresh` وإعادة تنفيذ الطلبات العالقة في الطابور (Failed Queue) بسلاسة. كما يقوم بتمرير الأخطاء عبر `getApiErrorMessage(error)` لمنع ظهور أي رسائل تقنية للمستخدم.

#### 3. `src/utils/apiErrors.ts`
- **اللغة:** TypeScript
- **الدور والمنطق:** الطبقة العازلة للأمان في الواجهة الأمامية؛ تترجم رموز الأخطاء الصادرة من السيرفر (مثل `INSUFFICIENT_STOCK`, `RECEIVE_EXCEEDS_ORDERED`, `AUTH_FORBIDDEN`) إلى مفاتيح ترجمة مفهومة ومطعمة بالمتغيرات، مع إرجاع رسالة خطأ عامة وآمنة في حال حدوث خطأ غير معروف.

#### 4. `src/components/layout/ProtectedRoute.tsx`
- **اللغة:** TypeScript (React)
- **الدور والمنطق:** حارس المسارات؛ يفحص حالة تسجيل الدخول وصلاحية الرمز، ويتحقق من مصفوفة الصلاحيات المسموحة للمسار `allowedPermissions` عبر `canAny()`. في حال عدم امتلاك الصلاحية، يعيد التوجيه تلقائياً إلى لوحة التحكم أو صفحة تسجيل الدخول.

#### 5. `src/components/layout/Sidebar.tsx`
- **اللغة:** TypeScript (React + Tailwind)
- **الدور والمنطق:** القائمة الجانبية للتطبيق؛ تقوم بفلترة بنود التنقل ديناميكياً بناءً على الصلاحيات الحية للمستخدم، وتدعم الفتح والإغلاق على الأجهزة المحمولة، وتسجيل الخروج الآمن.

---

### 4.2 الـ Hooks المخصصة الـ 17 (`src/hooks/`)
جميع الـ Hooks تعتمد على `@tanstack/react-query` مع توفير استعلامات القراءة (`useQuery`) وعمليات التعديل (`useMutation`) وإبطال الكاش التلقائي (`queryClient.invalidateQueries`):
1. `useCategories.ts`: جلب وإنشاء وتعديل وحذف التصنيفات والتصنيفات الفرعية.
2. `useUnits.ts`: إدارة وحدات القياس.
3. `useUnitConversions.ts`: إدارة معاملات تحويل الوحدات للصنف.
4. `useSuppliers.ts`: إدارة الموردين.
5. `useDepartments.ts`: إدارة الأقسام.
6. `useWarehouses.ts`: إدارة المستودعات الرئيسية والفرعية.
7. `useUsers.ts`: إدارة المستخدمين وتعيين الأدوار.
8. `useSupervisors.ts`: إدارة المشرفين الأكاديميين.
9. `useItems.ts`: إدارة الأصناف، جلب الأكواد الآلية، واستعراض الأرصدة.
10. `useTransactions.ts`: استعراض السندات المخزنية واعتمادها.
11. `useStockMovements.ts`: استعراض سجل تدقيق حركات المخزون.
12. `usePurchaseOrders.ts`: إدارة دورة أوامر الشراء، الاستلام، التخصيص، والتحويل والتأكيدات.
13. `useMaterialRequests.ts`: إدارة دورة طلبات صرف المواد والاعتماد والصرف.
14. `useProjects.ts`: إدارة مشاريع التخرج والطلاب وإجراءات الإغلاق.
15. `useCustodies.ts`: استعراض العُهد، طلبات الإرجاع، وتأكيد الاستلام.
16. `useReports.ts`: استعراض تقرير الجرد التفصيلي وبطاقات الأصناف.
17. `useSettings.ts`: إدارة وتعديل الإعدادات المحاسبية للنظام.

---

### 4.3 صفحات التطبيق الـ 19 (`src/pages/`)
1. `auth/LoginPage.tsx`: صفحة الدخول، تدعم التحقق من المدخلات عبر Zod ورسائل الخطأ المترجمة.
2. `dashboard/DashboardPage.tsx`: لوحة التحكم والإحصائيات السريعة والتنبيهات النشطة.
3. `categories/CategoriesPage.tsx`: إدارة التصنيفات والتصنيفات الفرعية في جداول تفاعلية مع نوافذ منبثقة.
4. `units/UnitsPage.tsx`: استعراض وإضافة وتعديل وحدات القياس.
5. `suppliers/SuppliersPage.tsx`: استعراض وإدارة بيانات الموردين.
6. `departments/DepartmentsPage.tsx`: استعراض وإدارة الأقسام.
7. `warehouses/WarehousesPage.tsx`: استعراض وإدارة المستودعات الرئيسية والفرعية.
8. `items/ItemsPage.tsx`: استعراض الأصناف، الفلترة حسب المستودع والتصنيف، ونموذج إنشاء الصنف مع الحقول المتقدمة.
9. `items/ItemCardPage.tsx`: بطاقة الصنف الشاملة وسجل حركاته وأرصدة المستودعات.
10. `unit-conversions/UnitConversionsPage.tsx`: إدارة معاملات التحويل لكل صنف.
11. `transactions/TransactionsListPage.tsx`: قائمة السندات المخزنية مع الفلترة حسب النوع والحالة.
12. `transactions/CreateTransactionPage.tsx`: إنشاء مسودات السندات المخزنية.
13. `transactions/TransactionDetailPage.tsx`: عرض تفاصيل السند وبنوده واعتماده.
14. `stock-movements/StockMovementsPage.tsx`: سجل الحركات التدقيقي الشامل للمسؤول.
15. `purchase-orders/PurchaseOrdersListPage.tsx`: استعراض أوامر الشراء وحالاتها ونسب الاستلام والتخصيص.
16. `purchase-orders/CreatePurchaseOrderPage.tsx`: إنشاء مسودة أمر شراء جديد.
17. `purchase-orders/PurchaseOrderDetailPage.tsx`: تفاصيل أمر الشراء، الاستلام الفعلي، حجز المخصصات، والتحويل للمستودعات الفرعية.
18. `material-requests/MaterialRequestsListPage.tsx`: استعراض طلبات الصرف ومتابعة مسار الاعتماد.
19. `material-requests/CreateMaterialRequestPage.tsx`: إنشاء طلب صرف مواد جديد بناءً على كتالوج القسم.
20. `material-requests/MaterialRequestDetailPage.tsx`: تفاصيل طلب الصرف، الاعتماد، التحويل، والصرف وتوليد العُهد.
21. `projects/ProjectsPage.tsx`: استعراض مشاريع التخرج، الحالات، والعُهد المعلقة ونموذج الإنشاء.
22. `projects/ProjectDetailPage.tsx`: تفاصيل المشروع، قائمة الطلاب، المواد المعارة، وتقرير الإغلاق.
23. `custodies/CustodiesPage.tsx`: استعراض العُهد المسندة، إرجاع المواد بسندات RTI، وتحديد حالة المادة المسترجعة.
24. `custodies/MyCustodyPage.tsx`: شاشة مخصصة للمشرف أو الموظف لاستعراض عُهده الشخصية وطلب تسليمها.
25. `reports/ReportsPage.tsx`: تقارير الجرد التفصيلية والمخزون المتاح والمحجوز.
26. `settings/SettingsPage.tsx`: شاشة إعدادات الحسابات المحاسبية وطرق التقييم للمسؤول.
27. `users/UsersPage.tsx`: إدارة حسابات المستخدمين وأدوارهم وحالات التفعيل.
28. `supervisors/SupervisorsPage.tsx`: إدارة المشرفين الأكاديميين وإسنادهم للأقسام.

---

## 5. دليل التشغيل، النشر، والأمان الشامل

### 5.1 التشغيل المحلي السريع للمطور (Quick Local Setup)
```bash
# 1. إعداد الواجهة الخلفية (Backend)
cd WMS_Managment_Backend
npm install
cp .env.example .env
# عدل بيانات الاتصال والمفاتيح في .env
npm run migrate           # بناء وتحديث الجداول
npm run seed:demo:full    # بذر الحسابات التجريبية (admin / Admin@123)
npm run dev               # تشغيل السيرفر على المنفذ 5000

# 2. إعداد الواجهة الأمامية (Frontend)
cd ../WMS_Frontend
npm install
npm run dev               # تشغيل الواجهة على المنفذ 5173
```

### 5.2 النشر باستخدام Docker & Docker Compose
```bash
cd WMS_Managment_Backend
docker compose up --build -d
```

### 5.3 خلاصة تدقيق الأمان والجاهزية (ABM Security & Compliance Summary)
- ✅ **حماية ضد SQL Injection:** جميع الاستعلامات Parameterized بالكامل.
- ✅ **حماية التنافسية وتضارب المخزون:** تطبيق `FOR UPDATE` في كافة السندات وأوامر الصرف.
- ✅ **حماية الجلسات:** JWT مزدوج مع تدوير الرموز، وإلغاء فوري عبر `token_version`.
- ✅ **أمان الحاويات:** تشغيل التطبيق بحساب مستخدم غير جذري محدود الصلاحيات (`wms:1001`).
- ✅ **اكتمال الاختبارات:** 152 اختبار آلي ناجح يغطي كافة المسارات الحساسة وقواعد العمل.

---
**تم إعداد واعتماد هذا التقرير الفني الشامل ليكون المرجع الهندسي النهائي لتسليم النظام لأي مهندس برمجيات جديد.**
