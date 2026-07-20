export type UserRole = 'system_admin' | 'warehouse_manager' | 'storekeeper' | 'accountant';

export type TransactionType = 'RV' | 'LN' | 'TRF';
export type TransactionStatus = 'draft' | 'approved';
export type MovementType = 'IN' | 'OUT';

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
  location: string | null;
  is_active: boolean;
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

export interface InventoryReportItem {
  id: number;
  item_code: string;
  name_ar: string;
  name_en?: string;
  description: string | null;
  current_balance: number;
  min_stock_level: number;
  max_stock_level: number;
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
  TRF: 'Transfer',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  system_admin: 'System Admin',
  warehouse_manager: 'Warehouse Manager',
  storekeeper: 'Storekeeper',
  accountant: 'Accountant',
};
