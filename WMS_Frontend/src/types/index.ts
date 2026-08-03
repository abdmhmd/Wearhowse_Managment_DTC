export type UserRole =
  | 'system_admin'
  | 'warehouse_manager'
  | 'storekeeper'
  | 'accountant'
  | 'department_manager'
  | 'viewer';

export type TransactionType = 'RV' | 'LN' | 'RTV' | 'RTI' | 'ADJ' | 'TRF';
export type TransactionStatus = 'draft' | 'approved';
export type MovementType = 'IN' | 'OUT';

export type RequestType = 'experiment' | 'semester' | 'project';
export type RequestPriority = 'low' | 'normal' | 'high' | 'urgent';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'issued' | 'cancelled';
export type ProjectStatus = 'open' | 'closed';
export type CustodyStatus = 'active' | 'returned';

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  code: string;
  name_ar: string;
  name_en?: string;
  prefix?: string;
  description: string | null;
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

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  pagination?: PaginationMeta;
  error?: { message: string };
}

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
  };
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
  supervisor_id: number;
  status: ProjectStatus;
  notes: string | null;
  closed_by: number | null;
  closed_at: string | null;
  created_by: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  department_name_ar?: string;
  department_name_en?: string;
  supervisor_name?: string;
  created_by_name?: string;
  closed_by_name?: string;
  request_count?: number;
  active_custodies?: number;
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
  system_admin: 'System Admin',
  warehouse_manager: 'Warehouse Manager',
  storekeeper: 'Storekeeper',
  accountant: 'Accountant',
  department_manager: 'Department Manager',
  viewer: 'Viewer',
};

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  experiment: 'Experiment',
  semester: 'Semester',
  project: 'Project',
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  issued: 'Issued',
  cancelled: 'Cancelled',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  open: 'Open',
  closed: 'Closed',
};

export const CUSTODY_STATUS_LABELS: Record<CustodyStatus, string> = {
  active: 'Active',
  returned: 'Returned',
};

export const ITEM_TYPE_LABELS: Record<'consumable' | 'durable', string> = {
  consumable: 'Consumable',
  durable: 'Durable',
};
