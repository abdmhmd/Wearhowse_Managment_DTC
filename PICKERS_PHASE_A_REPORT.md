---
title: Pickers Phase A — SearchableSelect + ItemPickerModal Integration Report
type: ui-integration
module: purchase-requests
backend_changes: true
migration_needed: false
status: complete
created: 2026-09-13
---

# Pickers Phase A — SearchableSelect + ItemPickerModal Integration Report

## 1. What Was Missing

The item selection on the "New Purchase Request" form was a plain native
`<select>` fed by a 500-row client-side dump of every item (`useItems(1, 500)`):

| Screenshot observation | Description |
|---|---|
| Create Purchase Request — item row | The item field was a `<select>` with one `<option>` **per item**. With a catalog of hundreds of items the dropdown became unmanageable, the initial page payload was bloated, and nothing updated when the target warehouse changed. |
| Any picker usage | No reusable searchable-picker primitive existed in `src/components/ui`, so every future picker (item, warehouse, unit, user, project) would have to re-implement the same search/popover/keyboard logic. |

Consequences:
- Widget-scaling dropdowns for data that grows unbounded (items).
- No server-side search — the entire catalog was loaded to render options.
- No keyboard-first "command palette" interaction (typing to filter, arrow
  navigation, enter to confirm).
- No reusable building block for the `ItemPickerModal` planned for Phase A.

## 2. What Was Added

| File | Change |
|---|---|
| `WMS_Frontend/package.json` | New runtime deps: `cmdk ^1.1.1` (headless command menu) and `@radix-ui/react-popover ^1.1.23` (portal + focus trap). No peer conflicts (`npm ls` clean). |
| `WMS_Frontend/src/components/ui/SearchableSelect.tsx` | New reusable searchable-select primitive (cmdk + Radix Popover). See §3. |
| `WMS_Frontend/src/components/ui/index.ts` | Re-export `SearchableSelect` from the UI barrel. |
| `WMS_Frontend/src/components/pickers/ItemPickerModal.tsx` | New picker modal (search + paginated grid, single/multi, warehouse filter, excludes previously-picked items). See §3. |
| `WMS_Frontend/src/pages/purchase-requests/CreatePurchaseRequestPage.tsx` | Item `<select>` (with 500-row dump) replaced by a trigger button + `ItemPickerModal` (single mode). The 500-row `useItems` fetch and the `itemOptions` map were removed; `warehouse_id` is now cascaded into the picker request. |
| `WMS_Frontend/src/test/purchase-requestCreateForm.test.tsx` | Updated to drive the picker (click trigger → pick item in modal) instead of `selectOptions` on the item `<select>`; payload assertion unchanged. |
| `WMS_Frontend/src/__tests__/SearchableSelect.test.tsx` | New 12-case suite (happy-dom). |
| `WMS_Frontend/src/__tests__/ItemPickerModal.test.tsx` | New 7-case suite (mocks `useItems`, happy-dom). |
| `WMS_Frontend/src/test/setup.ts` | Unit-test stubs for `ResizeObserver`, `Element.prototype.scrollIntoView`, `window.matchMedia` (used by cmdk/Radix in jsdom). |
| `WMS_Frontend/src/locales/en/translation.json` | `components.searchableSelect.*` (5 keys), `components.itemPicker.*` (8 keys), `common.prev/next/empty` (3 keys). |
| `WMS_Frontend/src/locales/ar/translation.json` | Same 16 keys in Arabic (parity, see §6). |
| `WMS_Managment_Backend/tests/material-requests/repro-wm-project.test.ts` | Timezone-robustness fix for a pre-existing flaky assertion (unrelated to Phase A; see §9). |

## 3. Component Design

### 3.1 `SearchableSelect` — `src/components/ui/SearchableSelect.tsx`

```
┌─ trigger (Popover.Trigger asChild) ─────────────────────────────┐
│  <button aria-haspopup="listbox" aria-expanded={open}             │
│          aria-label={ariaLabel ?? t('components.searchableSelect.select')}> │
│    selected label + sublabel   OR   placeholder                   │
│    [ ✕ clear ] (selected && !disabled)            [ ▾ chevron ]   │
└──────────────────────────────────────────────────────────────────┘
        └─ opens ─┐
┌─ Popover.Portal → Popover.Content (align="start", sideOffset=4) ─┐
│  <Command shouldFilter={!onSearch} loop data-lang-dir=rtl|ltr>    │
│  ├─ Command.Input  role="combobox" aria-autocomplete="list"      │
│  ├─ Command.List   role="listbox"  max-h-60 overflow-y-auto      │
│  │   ├─ isLoading ? role="status" spinner + loadingMessage        │
│  │   ├─ <Empty> emptyMessage ?? t('...noResults')                 │
│  │   └─ Command.Item per option (✓ check on selected)             │
└──────────────────────────────────────────────────────────────────┘
```

Props (`SearchableSelectOption = { value, label, sublabel?, disabled? }`):

| Prop | Type | Notes |
|---|---|---|
| `options` | `SearchableSelectOption[]` | Items for client filtering (ignored when `onSearch` is provided). |
| `value` | `string \| number \| null` | Controlled selected value. |
| `onChange` | `(value: string \| number \| null) => void` | Called on select and on clear (`null`). |
| `onSearch` | `(query: string) => void` | Server mode; cmdk `shouldFilter` disabled; calls debounced 300ms. |
| `isLoading` | `boolean` | Shows `role="status"` spinner instead of the list. |
| `disabled` | `boolean` | Blocks open + clear. |
| `renderOption` | `(opt) => ReactNode` | Custom option content. |
| `placeholder / searchPlaceholder / emptyMessage / loadingMessage / clearLabel` | `string` | i18n-backed defaults. |
| `id / name / aria-label` | strings | Form/accessibility wiring. |

Behavior notes:
- Fully controlled popover (`open` state); opening sets focus guard via
  `onOpenAutoFocus` preventDefault + cmdk input autofocus.
- Client filtering matches **label + sublabel** (passed as `keywords`) so a
  search by product name works even though item `value` is a numeric id.
- Close auto-focus returns to the trigger; the search query is reset on close so
  reopening is clean.
- RTL: `dir` taken from `document.documentElement.dir`, applied to both the
  popover content and the cmdk root (`rtl-mode` class on content).

### 3.2 `ItemPickerModal` — `src/components/pickers/ItemPickerModal.tsx`

```
┌─ Modal (size="xl") ─────────────────────────────────────────────┐
│  Title: "Select Items"                             [ ✕ close ]   │
│  [ Search by name or code...                        ]            │
│  ┌──────────────────────┬──────────────────────────┐             │
│  │ Laptop               │ Keyboard                 │  ← grid     │
│  │ ELEC-001 — EA · 5    │ ELEC-002 — EA · 12       │   (2 cols)  │
│  ├──────────────────────┴──────────────────────────┤             │
│  │ (pagination footer) "Page 1 of 3" [◀] [▶]        │             │
│  │ 3 selected   [Cancel] [Add Selected (multi only)]│             │
└──────────────────────────────────────────────────────────────────┘
```

Props: `isOpen`, `onClose`, `onSelect(items)`, `mode: 'single'|'multi'`
(default `single`), `title`, `warehouseId`, `excludeIds`, `disabled`.

Behavior:
- Data is **server-fetched** via `useItems(page, 50, { search, warehouse_id })`
  — no full-catalog client dump. Search is debounced 300ms server-side.
- `warehouseId` cascades from the selected warehouse on the form; `excludeIds`
  hides items already added to other lines (they no longer survive in the modal).
- `single`: clicking an item commits and closes. `multi`: toggles a selection
  set; "Add Selected" commits all; count shown in the footer.
- Empty / error / loading states are localized. Pagination is footer-based.

### 3.3 Create Purchase Request page integration

```
line row (before)                    line row (after)
┌────────────────────────┐          ┌────────────────────────┐
│ Item [ select ▾ 500    ]│          │ Item              [x] │  ← trigger button
│ rows of <option>       │          │  ELEC-001 — Laptop     │     opens modal
└────────────────────────┘          └────────────────────────┘
                                        └─ ItemPickerModal (single, warehouse-scoped)
                                           onSelect → line.item_id + unit_code
```

The form no longer loads every item up-front; item rows show the picked label
(`code — localized name`), and the unit field still auto-fills from the picked
item. `linesValid` logic and the submit payload shape are unchanged.

## 4. UI Screenshots (ASCII)

```
┌─ New Purchase Request ──────────────────────────────────────────────┐
│  New Purchase Request                       Create Purchase Request │
│  ┌─ Request information ──────────────────────────────────────────┐ │
│  │ Warehouse [ Main Warehouse 1 ▾ ]   Notes [               ]      │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│  ┌─ Items ────────────────────────────────────────────── [+ Add Item]│
│  │ Item                 Qty    Unit    Notes                     [🗑]│
│  │ [ ELEC-001 — Laptop ▾click]  [ 50 ]  [ EA ]  [          ]      │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

```
┌─ Select Items (modal) ────────────────────────────────────────────┐
│  Select Items                                           [ ✕ ]       │
│  [ Search by name or code...                               ]        │
│  ┌────────────────────────┬─────────────────────────┬─────────────┐ │
│  │ [✓] Laptop             │     Mouse               │   Printer   │ │
│  │     ELEC-001 — EA · 5  │     ELEC-003 — EA · 3    │ ELEC-005…  │ │
│  └────────────────────────┴─────────────────────────┴─────────────┘ │
│  Page 1 of 3         [◀] [▶]                                       │
│  hedge                                                              │
│  2 selected                          [Cancel]  [Add Selected]      │
└─────────────────────────────────────────────────────────────────────┘
```

## 5. Dependency Changes

| Package | Version | Type | Why |
|---|---|---|---|
| `cmdk` | `^1.1.1` | runtime | Headless command-menu primitive (type to filter, arrow/enter select) — used by `SearchableSelect`. |
| `@radix-ui/react-popover` | `^1.1.23` | runtime | Portal + focus trap + DismissableLayer for the popover. |
| `happy-dom` | (installed) | dev | Test environment for the cmdk/Radix suites (`@vitest-environment happy-dom` pragma). |

No migration is needed; no backend module was changed for Phase A.

## 6. i18n Coverage

| Locale | New keys |
|---|---|
| English | `components.searchableSelect.*` (5), `components.itemPicker.*` (8), `common.prev/next/empty` (3) — total **16** |
| Arabic | same **16** keys, parity ✓ |

`components.searchableSelect`: `select`, `searchPlaceholder`, `clearSelection`,
`loading`, `noResults`.
`components.itemPicker`: `title`, `searchPlaceholder`, `loadError`, `empty`,
`resultsLabel`, `selectedCount`, `page`, `confirm`.

## 7. Tests

| Suite | Cases | Status |
|---|---|---|
| `src/__tests__/SearchableSelect.test.tsx` (happy-dom) | Renders placeholder; renders selected; opens + lists all; client filter by name; empty message; `onChange` on click; keyboard arrow+enter; clear button; disabled; loading state; debounced `onSearch`; custom `renderOption` | ✅ 12 |
| `src/__tests__/ItemPickerModal.test.tsx` (happy-dom, mocked `useItems`) | Renders title/search; lists items + honours `excludeIds`; single mode commit+close; multi mode toggle + confirm; empty state; loading state; passes `warehouse_id` filter to the hook | ✅ 7 |
| `src/test/purchase-requestCreateForm.test.tsx` | Disabled-until-valid; per-line validity; remove-lines; payload assertion — all driving the new picker flow | ✅ 4 |
| Backend `tests/material-requests/repro-wm-project.test.ts` | ✓ (timezone robustness fix; unchanged assertions) | ✅ 7 |

## 8. Verification

| Check | Result |
|---|---|
| Backend `npx tsc --noEmit` | ✅ clean |
| Backend `npm test` | ✅ 621 passed (64 suites) |
| Frontend `npx tsc --noEmit` | ✅ clean |
| Frontend `npx vitest run` | ✅ 103 passed (12 files) |
| Frontend `npm run build` | ✅ vite build OK |

## 9. Testing Notes & Residual Items

- **jsdom + cmdk/Radix Popover incompatibility (root cause of the debug detour):**
  `cmdk` renders its items off the main body via Radix `Popover.Portal` and keeps
  internal `ResizeObserver` loops while the menu is open. Under jsdom, opening the
  picker produced an **infinite update loop** that hung every async test
  (`userEvent.click(...)` never resolved; 5s timeouts on `findByRole`).
  Resolution:
  1. Switched the two picker suites to **happy-dom**
     (`// @vitest-environment happy-dom` pragma), which supports the needed
     DOM APIs — hang resolved, no production code touched.
  2. Kept `resizeObserver`/`scrollIntoView`/`matchMedia` stubs in
     `src/test/setup.ts` for the jsdom suites.
  - The full suite stays fast and deterministic: no fake timers are needed for
    the 300ms debounce (a short real `setTimeout` awaits the callback).
- **Accessible-name matching:** cmdk option accessible names include the sublabel
  (e.g. `Monitor ELEC-004`), so tests match with `/Monitor/` regexes rather than
  exact string equality.
- **Backend fix scope:** the `repro-wm-project.test.ts` S5 assertion computed
  "today" via UTC `toISOString` while the validator compares against server-local
  midnight; past the UTC/local date boundary the request was rejected (400). Made
  the fixture build today in server-local time. This was a pre-existing flake,
  unrelated to Phase A.
- **`item_label` denormalized in the line draft:** the page stores a display label
  in the `LineDraft` because items are no longer pre-loaded; only `item_id` /
  `unit_code` / `quantity` / `notes` leave the page in the payload.

## 10. Rollback

- Frontend only, no migration. Revert `CreatePurchaseRequestPage.tsx` to restore
  the previous `<select>`-based item field; the modal, picker and primitive can be
  left in place (unused) or removed with the new commits.
- The two new test files can be dropped without affecting existing suites.
- The i18n keys under `components.*` and `common.prev/next/empty` are additive;
  removing them only affects the picker UI.

## 11. Next Phase Readiness (Phase A follow-ups)

- `SearchableSelect` is the reusable primitive for a future Phase B: warehouse,
  unit, user, project, and supplier pickers share the same prop surface.
- `ItemPickerModal` is already reusable for "pick multiple items" contexts and is
  scoped server-side by `warehouseId`; a `category_code`/`subcategory_id` filter
  can be threaded through `ItemsFilter` without UI work.
- Purchase-order creation page can reuse the same modal via a warehouse cascade
  mirroring the purchase-request form.