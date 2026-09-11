export type UserRole =
  | 'admin'
  | 'sub_warehouse_manager'
  | 'department_manager'
  | 'supervisor';

/**
 * Canonical permission codes. Mirrors the backend catalog
 * (backend: src/modules/authorization/permissions.ts) and the
 * `permissions.code` values seeded by migration 017.
 */
export type Permission =
  | 'dashboard:view'
  | 'categories:view' | 'categories:create' | 'categories:update' | 'categories:delete'
  | 'units:view' | 'units:create' | 'units:update' | 'units:delete'
  | 'suppliers:view' | 'suppliers:create' | 'suppliers:update' | 'suppliers:delete'
  | 'departments:view' | 'departments:create' | 'departments:update' | 'departments:delete'
  | 'warehouses:view' | 'warehouses:create' | 'warehouses:update' | 'warehouses:delete'
  | 'users:view' | 'users:create' | 'users:update' | 'users:delete'
  | 'supervisors:view' | 'supervisors:create' | 'supervisors:update' | 'supervisors:delete'
  | 'items:view' | 'items:create' | 'items:update' | 'items:delete'
  | 'unit-conversions:view' | 'unit-conversions:create' | 'unit-conversions:update' | 'unit-conversions:delete'
  | 'transactions:view' | 'transactions:create' | 'transactions:approve'
  | 'stock-movements:view' | 'stock-movements:view-all'
  | 'reports:view'
  | 'settings:view' | 'settings:update'
  | 'requests:view' | 'requests:view_own' | 'requests:create' | 'requests:approve' | 'requests:reject' | 'requests:issue' | 'requests:cancel' | 'requests:forward'
  | 'alerts:view' | 'alerts:acknowledge'
  | 'inventory:session:open' | 'inventory:session:view' | 'inventory:count:record' | 'inventory:session:close'
  | 'batches:view'
  | 'projects:view' | 'projects:create' | 'projects:update' | 'projects:close' | 'projects:delete' | 'projects:supervisors'
  | 'custodies:view' | 'custodies:view_own' | 'custodies:return'
  | 'purchase-orders:view' | 'purchase-orders:create' | 'purchase-orders:update' | 'purchase-orders:approve' | 'purchase-orders:cancel' | 'purchase-orders:receive' | 'purchase-orders:allocate' | 'purchase-orders:transfer';

export type PurchaseOrderStatus = 'draft' | 'approved' | 'partially_received' | 'received' | 'closed' | 'cancelled';
export type AllocationStatus = 'allocated' | 'partially_transferred' | 'transferred' | 'cancelled';

export interface PurchaseOrderLine {
  id: number;
  po_id: number;
  item_id: number;
  item_code?: string;
  item_name_ar?: string;
  item_name_en?: string;
  quantity_ordered: number | string;
  quantity_received: number | string;
  quantity_allocated: number | string;
  quantity_transferred: number | string;
  unit_code: string;
  unit_name_ar?: string;
  unit_name_en?: string;
  unit_price?: number | string;
  notes?: string | null;
}

export interface PurchaseOrderAllocation {
  id: number;
  po_detail_id: number;
  po_id: number;
  source_warehouse_id: number;
  dest_warehouse_id: number;
  dest_warehouse_code?: string;
  dest_warehouse_name_ar?: string;
  dest_warehouse_name_en?: string;
  item_id?: number;
  item_code?: string;
  item_name_ar?: string;
  item_name_en?: string;
  quantity_allocated: number | string;
  quantity_transferred: number | string;
  status: AllocationStatus;
  allocated_by_name?: string | null;
  transferred_by_name?: string | null;
  transfer_transaction_no?: string | null;
  created_at?: string;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  supplier_id?: number | null;
  supplier_name_ar?: string | null;
  supplier_name_en?: string | null;
  warehouse_id: number;
  warehouse_code?: string;
  warehouse_name_ar?: string;
  warehouse_name_en?: string;
  department_id?: number | null;
  department_name_ar?: string | null;
  department_name_en?: string | null;
  status: PurchaseOrderStatus;
  order_date?: string;
  expected_date?: string | null;
  notes?: string | null;
  created_by?: number;
  created_by_name?: string | null;
  approved_by_name?: string | null;
  cancelled_by_name?: string | null;
  approved_at?: string | null;
  received_at?: string | null;
  lines_count?: number;
  quantity_ordered?: number | string;
  quantity_received?: number | string;
  quantity_allocated?: number | string;
  quantity_transferred?: number | string;
  details?: PurchaseOrderLine[];
  allocations?: PurchaseOrderAllocation[];
  created_at?: string;
}

export type TransactionType = 'RV' | 'LN' | 'RTV' | 'RTI' | 'ADJ' | 'TRF';
export type TransactionStatus = 'draft' | 'approved';
export type MovementType = 'IN' | 'OUT';

export type RequestType = 'experiment' | 'semester' | 'project';
export type RequestPriority = 'low' | 'normal' | 'high' | 'urgent';
export type RequestStatus = 'pending' | 'dept_approved' | 'wm_approved' | 'forwarded' | 'admin_approved' | 'admin_rejected' | 'issued' | 'cancelled';
export type ProjectStatus = 'open' | 'closed' | 'cancelled' | 'pending_closure';
export type CustodyStatus = 'active' | 'returned' | 'damaged' | 'lost' | 'return_pending';
export type CustodyCondition = 'good' | 'damaged' | 'lost';

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  department_id?: number | null;
  department_name_ar?: string | null;
  department_name_en?: string | null;
  warehouse_ids?: number[];
  created_at: string;
  updated_at: string;
}

/** A supervisor is a user with role `department_manager` (management page shape). */
export interface Supervisor {
  id: number;
  username: string;
  full_name: string;
  role: 'department_manager';
  department_id: number | null;
  department_name_ar: string | null;
  department_name_en: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  code: string;
  name_ar: string;
  name_en?: string;
  prefix?: string;
  parent_code?: string | null;
  description: string | null;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subcategory {
  id: number;
  category_code: string;
  code: string;
  name_ar: string;
  name_en?: string;
  description?: string | null;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Unit {
  code: string;
  name_ar: string;
  name_en: string;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: number;
  name_ar: string;
  name_en?: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id?: number;
  code: string;
  name_ar: string;
  name_en?: string;
  created_at: string;
  updated_at: string;
}

export interface Warehouse {
  id: number;
  code: string;
  name_ar: string;
  name_en?: string;
  location: string | null;
  is_main?: boolean;
  department_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: number;
  item_code: string;
  name_ar: string;
  name_en?: string;
  description: string | null;
  category_code: string;
  subcategory_id?: number | null;
  unit_code: string;
  warehouse_id: number;
  min_stock_level: number;
  max_stock_level: number;
  current_balance: number;
  last_purchase_price?: number;
  opening_price?: number;
  location: string | null;
  is_active: boolean;
  is_consumable: boolean;
  expiry_alert_days: number;
  sap_material_number?: string | null;
  gl_account?: string | null;
  created_at: string;
  updated_at: string;
  category_name_ar?: string;
  category_name_en?: string;
  subcategory_name_ar?: string;
  subcategory_name_en?: string;
  unit_name_ar?: string;
  unit_name_en?: string;
  warehouse_name_ar?: string;
  warehouse_name_en?: string;
}

export interface UnitConversion {
  id: number;
  item_id: number;
  from_unit_code: string;
  to_unit_code: string;
  factor: number;
}

export interface TransactionHeader {
  id: number;
  transaction_no: string;
  type: TransactionType;
  status: TransactionStatus;
  transaction_date: string;
  supplier_id: number | null;
  department_id: number | null;
  warehouse_id: number;
  to_warehouse_id: number | null;
  created_by: number;
  approved_by: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  warehouse_code?: string;
  warehouse_name_ar?: string;
  warehouse_name_en?: string;
  to_warehouse_code?: string;
  to_warehouse_name_ar?: string;
  to_warehouse_name_en?: string;
  department_name_ar?: string;
  department_name_en?: string;
  supplier_name_ar?: string;
  supplier_name_en?: string;
  created_by_username?: string;
  created_by_name?: string;
  approved_by_username?: string;
  approved_by_name?: string;
}

export interface TransactionDetail {
  id: number;
  transaction_id: number;
  item_id: number;
  quantity: number;
  unit_code: string;
  unit_price?: number;
  total_price?: number;
  unit_cost?: number;
  total_value?: number;
  batch_number?: string | null;
  expiry_tracking_enabled?: boolean;
  production_date?: string | null;
  expiry_date?: string | null;
  item_code?: string;
  item_name_ar?: string;
  item_name_en?: string;
}

export interface Transaction extends TransactionHeader {
  details?: TransactionDetail[];
}

export interface StockMovement {
  id: number;
  item_id: number;
  transaction_id: number;
  movement_type: MovementType;
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  movement_date: string;
  user_id: number;
  transaction_no?: string;
  transaction_type?: TransactionType;
  item_code?: string;
  item_name?: string;
  unit_cost?: number;
  total_value?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: ApiError;
}

export interface PaginatedData<T> {
  items: T[];
  pagination: PaginationMeta;
}

export type PaginatedResponse<T> = ApiResponse<PaginatedData<T>>;

export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: {
    id: number;
    username: string;
    full_name: string;
    role: UserRole;
    department_id: number | null;
    permissions?: Permission[];
    warehouse_ids?: number[];
  };
}

export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  department_id: number | null;
  department_name_ar?: string | null;
  department_name_en?: string | null;
  permissions: Permission[];
  warehouses: Warehouse[];
  warehouse_ids: number[];
}

export interface MeResponse {
  user: AuthUser;
}

export interface ItemCard {
  item: Item;
  recent_movements: StockMovement[];
  summary: {
    total_movements: number;
    total_in: number;
    total_out: number;
  };
  last_receiving_voucher: Transaction | null;
  last_issuing_voucher: Transaction | null;
}

export interface MaterialRequest {
  id: number;
  request_no: string;
  department_id: number;
  warehouse_id: number;
  requested_by: number;
  status: RequestStatus;
  priority: RequestPriority;
  request_type: RequestType;
  project_id: number | null;
  needed_by: string | null;
  notes: string | null;
  rejection_reason: string | null;
  approved_by: number | null;
  approved_at: string | null;
  dept_approved_by: number | null;
  dept_approved_at: string | null;
  forwarded_by: number | null;
  forwarded_at: string | null;
  rejected_by: number | null;
  issued_by: number | null;
  issued_at: string | null;
  transaction_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  department_name_ar?: string;
  department_name_en?: string;
  warehouse_name_ar?: string;
  warehouse_name_en?: string;
  requested_by_name?: string;
  approved_by_name?: string;
  dept_approved_by_name?: string;
  forwarded_by_name?: string;
  rejected_by_name?: string;
  issued_by_name?: string;
  project_no?: string | null;
  project_name?: string | null;
  details?: MaterialRequestDetail[];
}

export interface MaterialRequestDetail {
  id: number;
  request_id: number;
  item_id: number;
  quantity: number;
  unit_code: string;
  notes: string | null;
  item_code?: string;
  item_name_ar?: string;
  item_name_en?: string;
  unit_name_ar?: string;
  unit_name_en?: string;
}

export interface Project {
  id: number;
  project_no: string;
  name: string;
  department_id: number;
  warehouse_id: number;
  supervisor_id: number;
  status: ProjectStatus;
  academic_year: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  expected_completion_date: string | null;
  notes: string | null;
  closed_by: number | null;
  closed_at: string | null;
  created_by: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  department_name_ar?: string;
  department_name_en?: string;
  warehouse_name_ar?: string;
  warehouse_name_en?: string;
  supervisor_name?: string;
  created_by_name?: string;
  closed_by_name?: string;
  request_count?: number;
  active_custodies?: number;
  students_count?: number;
  borrowed_count?: number;
  students?: ProjectStudent[];
  materials?: Custody[];
}

export interface ProjectStudent {
  id?: number;
  full_name: string;
  student_id?: string | null;
  role?: string | null;
}

export interface Custody {
  id: number;
  item_id: number;
  warehouse_id: number;
  assigned_to: number;
  quantity: number;
  unit_code: string;
  issued_transaction_id: number;
  return_transaction_id: number | null;
  request_id: number | null;
  project_id: number | null;
  status: CustodyStatus;
  condition?: CustodyCondition | null;
  expected_return_at?: string | null;
  returned_quantity?: number | null;
  pending_return_quantity?: number | null;
  return_notes?: string | null;
  notes: string | null;
  returned_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  item_code?: string;
  item_name_ar?: string;
  item_name_en?: string;
  assigned_to_name?: string;
  warehouse_name_ar?: string;
  warehouse_name_en?: string;
  project_no?: string | null;
  project_name?: string | null;
  issued_transaction_no?: string;
  return_transaction_no?: string;
}

export interface InventoryReportItem {
  id: number;
  item_code: string;
  name_ar: string;
  name_en?: string;
  description: string | null;
  current_balance: number;
  min_stock_level: number;
  max_stock_level: number;
  last_purchase_price?: number;
  location: string | null;
  is_active: boolean;
  category_name_ar?: string;
  category_name_en?: string;
  unit_name_ar?: string;
  unit_name_en?: string;
  warehouse_name_ar?: string;
  warehouse_name_en?: string;
  category_name?: string;
  unit_name?: string;
  warehouse_name?: string;
  warehouse_code: string;
  stock_summary: {
    total_movements: number;
    total_in: number;
    total_out: number;
  };
}

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  RV: 'Receiving Voucher',
  LN: 'Issuing / Lending',
  RTV: 'Return to Vendor',
  RTI: 'Return from Issue',
  ADJ: 'Adjustment',
  TRF: 'Transfer',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'System Admin',
  sub_warehouse_manager: 'Warehouse Manager',
  department_manager: 'Department Manager',
  supervisor: 'Supervisor',
};

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  experiment: 'Experiment',
  semester: 'Semester',
  project: 'Project',
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: 'Pending',
  dept_approved: 'Dept Approved',
  wm_approved: 'WM Approved',
  forwarded: 'Forwarded',
  admin_approved: 'Admin Approved',
  admin_rejected: 'Admin Rejected',
  issued: 'Issued',
  cancelled: 'Cancelled',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  open: 'Open',
  pending_closure: 'Pending Closure',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export const CUSTODY_STATUS_LABELS: Record<CustodyStatus, string> = {
  active: 'Active',
  returned: 'Returned',
  return_pending: 'Return Pending',
  damaged: 'Damaged',
  lost: 'Lost',
};

export const CUSTODY_CONDITION_LABELS: Record<CustodyCondition, string> = {
  good: 'Good',
  damaged: 'Damaged',
  lost: 'Lost',
};

export const ITEM_TYPE_LABELS: Record<'consumable' | 'durable', string> = {
  consumable: 'Consumable',
  durable: 'Durable',
};
