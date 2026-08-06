# Demo Data Seed — Answer

## How to run

From `D:\proi\WMS\WMS_Managment_Backend`:

```
npm run seed:demo:full
```

(equivalent: `npx ts-node scripts/seed-demo.ts`)

The script is fully idempotent — safe to run repeatedly. It runs inside a single transaction,
disables the `trg_low_stock_alert` trigger during the run (re-enables it before commit), and
validates that batch quantities always sum exactly to `item_warehouse_stock.current_balance`
before committing.

## What it creates

- 3 departments (Engineering / Processing / Production)
- 3 warehouses (WH-A, WH-B, WH-C)
- 5 units (PCS, KG, MTR, LTR, BOX) + 2 unit conversions
- 3 suppliers (ABC Industries / Global Supply Co. / Local Materials Ltd.)
- 6 categories (RAW, FG + MET, PLS, ELE, PKG)
- 14 items with realistic codes + opening batches (incl. 1 expired `PVC-GRANULES` and 1 expiring
  `LED-BULB-12V` to exercise expiry alerts)
- 6 transactions (3 approved RV, 1 approved LN, 1 approved TRF, 1 draft RV) with 13 stock
  movements, 13 transaction details, 5 journal entries
- 1 custody (Arduino board issued to dept manager, on project PRJ-2)
- 3 projects (PRJ-1/PRJ-2 open, PRJ-3 closed)
- 2 material requests (REQ-1 pending/high, REQ-2 approved/normal)
- 2 inventory sessions (WH-A completed, WH-B in progress)
- 5 alerts (low stock, overstock, 2 expiry warnings, 1 pending request)

Note: the script never touches non-demo rows. It only deletes rows it previously created
(identified by the `[SEED:demo]` marker in notes) and upserts reference data by unique code.

## Credentials

All users use the password `Admin@123`.

| Username      | Role              |
| ------------- | ----------------- |
| admin         | system_admin      |
| wh_manager    | warehouse_manager |
| storekeeper   | storekeeper       |
| accountant    | accountant        |
| dept_manager  | department_manager|
| viewer        | viewer            |

## Verified against the running app

- All 6 users log in successfully with `Admin@123`.
- All list endpoints return the expected counts; batch/stock invariant holds for all 15 stock rows.
- Frontend (http://localhost:5174): 16 list pages + create forms + item card / transaction /
  material-request detail pages all render with seeded data, 0 console errors, 0 failed requests.
- Note: record ids are NOT 1-based (items start at id 43, transactions at 19, requests at 7) because
  PostgreSQL sequences are not reset; the app always links via dynamic ids so this is irrelevant.
