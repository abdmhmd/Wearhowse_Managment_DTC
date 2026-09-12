import type { PurchaseRequest, PurchaseRequestStatus } from '@/types';

export const makeRequest = (overrides: Partial<PurchaseRequest> = {}): PurchaseRequest => ({
  id: 1,
  request_no: 'PR-2026-000001',
  department_id: 1,
  department_code: 'DEPT-1',
  department_name_ar: 'قسم الكيمياء',
  department_name_en: 'Chemistry',
  warehouse_id: 11,
  warehouse_code: 'DWH-1',
  warehouse_name_ar: 'المخزن الرئيسي للكيمياء',
  warehouse_name_en: 'Chemistry Main Warehouse',
  warehouse_is_main: true,
  created_by: 7,
  created_by_username: 'chem_admin',
  created_by_name: 'Chemistry Admin',
  status: 'pending' as PurchaseRequestStatus,
  notes: null,
  dept_approved_by: null,
  dept_approved_by_name: null,
  dept_approved_at: null,
  admin_approved_by: null,
  admin_approved_by_name: null,
  admin_approved_at: null,
  rejected_by: null,
  rejected_by_name: null,
  rejection_reason: null,
  rejected_at: null,
  cancelled_by: null,
  cancelled_by_name: null,
  cancelled_at: null,
  purchase_order_id: null,
  po_number: null,
  items_count: 2,
  quantity_total: 150,
  created_at: '2026-09-01T08:00:00.000Z',
  updated_at: '2026-09-01T08:00:00.000Z',
  items: [
    {
      id: 101,
      purchase_request_id: 1,
      item_id: 10,
      item_code: 'IT-100',
      item_name_ar: 'حمض الهيدروكلوريك',
      item_name_en: 'Hydrochloric Acid',
      quantity: 100,
      unit_code: 'EA',
      notes: null,
    },
    {
      id: 102,
      purchase_request_id: 1,
      item_id: 11,
      item_code: 'IT-200',
      item_name_ar: 'قفازات',
      item_name_en: 'Gloves',
      quantity: 50,
      unit_code: 'BOX',
      notes: 'Large size',
    },
  ],
  ...overrides,
});

export const makeDeptApproved = () =>
  makeRequest({
    status: 'dept_approved',
    dept_approved_by: 3,
    dept_approved_by_name: 'Dept Manager',
    dept_approved_at: '2026-09-02T09:00:00.000Z',
  });

export const makeAdminApproved = () =>
  makeRequest({
    status: 'admin_approved',
    dept_approved_by: 3,
    dept_approved_by_name: 'Dept Manager',
    dept_approved_at: '2026-09-02T09:00:00.000Z',
    admin_approved_by: 1,
    admin_approved_by_name: 'Administrator',
    admin_approved_at: '2026-09-03T10:00:00.000Z',
    purchase_order_id: 50,
    po_number: 'PO-2026-000077',
  });

export const makeRejected = () =>
  makeRequest({
    status: 'rejected',
    dept_approved_by: 3,
    dept_approved_by_name: 'Dept Manager',
    dept_approved_at: '2026-09-02T09:00:00.000Z',
    rejected_by: 1,
    rejected_by_name: 'Administrator',
    rejection_reason: 'Budget not approved this quarter.',
    rejected_at: '2026-09-04T11:00:00.000Z',
  });

export const makeCancelled = () =>
  makeRequest({
    status: 'cancelled',
    cancelled_by: 7,
    cancelled_by_name: 'Chemistry Admin',
    cancelled_at: '2026-09-02T10:30:00.000Z',
  });