import { pool, runInTransaction } from '../../config/database';
import { PoolClient } from 'pg';
import { scopeClause } from '../authorization/scope';
import type { AuthUserContext } from '../authorization/authorization.service';

export type RequestStatus =
  | 'pending'          // created, awaiting department approval
  | 'dept_approved'    // approved by the department manager
  | 'wm_approved'      // approved by the warehouse manager (supervisor requests)
  | 'forwarded'        // forwarded by the department manager to the warehouse admin
  | 'admin_approved'   // approved by the warehouse admin
  | 'admin_rejected'   // rejected by the warehouse admin
  | 'wm_rejected'      // rejected by the sub-warehouse manager BEFORE approval (Phase 2 / D13)
  | 'issued'           // stock issued (transaction completed)
  | 'cancelled';       // cancelled by the creator or an admin
export type RequestPriority = 'low' | 'normal' | 'high' | 'urgent';
export type RequestType = 'experiment' | 'semester' | 'project';

export interface MaterialRequestHeader {
  id: number;
  request_no: string;
  department_id: number;
  warehouse_id: number;
  requested_by: number;
  status: RequestStatus;
  priority: RequestPriority;
  request_type: RequestType;
  project_id?: number | null;
  needed_by?: Date | null;
  notes?: string | null;
  rejection_reason?: string | null;
  approved_by?: number | null;
  approved_at?: Date | null;
  dept_approved_by?: number | null;
  dept_approved_at?: Date | null;
  forwarded_by?: number | null;
  forwarded_at?: Date | null;
  rejected_by?: number | null;
  issued_by?: number | null;
  issued_at?: Date | null;
  transaction_id?: number | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface MaterialRequestDetail {
  id?: number;
  request_id: number;
  item_id: number;
  quantity: number;
  unit_code: string;
  notes?: string | null;
}

export class MaterialRequestsRepository {
  async generateRequestNo(): Promise<string> {
    const res = await pool.query("SELECT nextval('request_no_seq') AS seq");
    const seq = res.rows[0].seq;
    const year = new Date().getFullYear();
    return `REQ-${year}-${String(seq).padStart(5, '0')}`;
  }

  async create(
    client: PoolClient,
    header: Omit<MaterialRequestHeader, 'id' | 'created_at' | 'updated_at' | 'is_active'>
  ): Promise<MaterialRequestHeader> {
    const res = await client.query(
      `INSERT INTO material_requests
         (request_no, department_id, warehouse_id, requested_by, status, priority, request_type, project_id, needed_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        header.request_no,
        header.department_id,
        header.warehouse_id,
        header.requested_by,
        header.status ?? 'pending',
        header.priority ?? 'normal',
        header.request_type ?? 'experiment',
        header.project_id ?? null,
        header.needed_by ?? null,
        header.notes ?? null,
      ]
    );
    return res.rows[0];
  }

  async createDetail(client: PoolClient, detail: MaterialRequestDetail): Promise<MaterialRequestDetail & { id: number }> {
    const res = await client.query(
      `INSERT INTO material_request_details (request_id, item_id, quantity, unit_code, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [detail.request_id, detail.item_id, detail.quantity, detail.unit_code, detail.notes ?? null]
    );
    return res.rows[0];
  }

  async findById(id: number) {
    const res = await pool.query(
      `SELECT mr.*,
              d.name_ar AS department_name_ar, d.name_en AS department_name_en,
              w.name_ar AS warehouse_name_ar, w.name_en AS warehouse_name_en,
              u.full_name AS requested_by_name,
              dau.full_name AS dept_approved_by_name,
              fu.full_name AS forwarded_by_name,
              au.full_name AS approved_by_name,
              ru.full_name AS rejected_by_name,
              iu.full_name AS issued_by_name,
              p.project_no, p.name AS project_name
       FROM material_requests mr
       JOIN departments d ON d.id = mr.department_id
       JOIN warehouses w ON w.id = mr.warehouse_id
       JOIN users u ON u.id = mr.requested_by
       LEFT JOIN users dau ON dau.id = mr.dept_approved_by
       LEFT JOIN users fu ON fu.id = mr.forwarded_by
       LEFT JOIN users au ON au.id = mr.approved_by
       LEFT JOIN users ru ON ru.id = mr.rejected_by
       LEFT JOIN users iu ON iu.id = mr.issued_by
       LEFT JOIN projects p ON p.id = mr.project_id
       WHERE mr.id = $1 AND mr.is_active = true`,
      [id]
    );
    return res.rows[0] || null;
  }

  /**
   * Locks the material request row for the duration of the caller's
   * transaction (SELECT ... FOR UPDATE). Used by state-transition methods so
   * concurrent state changes — e.g. a double issue — are serialized: the second
   * transaction blocks until the first commits, then observes the new status.
   */
  async findByIdForUpdate(client: PoolClient, id: number) {
    const res = await client.query(
      `SELECT mr.*,
              d.name_ar AS department_name_ar, d.name_en AS department_name_en,
              w.name_ar AS warehouse_name_ar, w.name_en AS warehouse_name_en,
              u.full_name AS requested_by_name,
              dau.full_name AS dept_approved_by_name,
              fu.full_name AS forwarded_by_name,
              au.full_name AS approved_by_name,
              ru.full_name AS rejected_by_name,
              iu.full_name AS issued_by_name,
              p.project_no, p.name AS project_name
       FROM material_requests mr
       JOIN departments d ON d.id = mr.department_id
       JOIN warehouses w ON w.id = mr.warehouse_id
       JOIN users u ON u.id = mr.requested_by
       LEFT JOIN users dau ON dau.id = mr.dept_approved_by
       LEFT JOIN users fu ON fu.id = mr.forwarded_by
       LEFT JOIN users au ON au.id = mr.approved_by
       LEFT JOIN users ru ON ru.id = mr.rejected_by
       LEFT JOIN users iu ON iu.id = mr.issued_by
       LEFT JOIN projects p ON p.id = mr.project_id
       WHERE mr.id = $1 AND mr.is_active = true
       FOR UPDATE OF mr`,
      [id]
    );
    return res.rows[0] || null;
  }

  async findDetailsByRequestId(requestId: number, client?: PoolClient) {
    const q = client ?? pool;
    const res = await (q as any).query(
      `SELECT mrd.*,
              i.item_code, i.name_ar AS item_name_ar, i.name_en AS item_name_en,
              i.current_balance, i.is_consumable,
              u.name_ar AS unit_name_ar, u.name_en AS unit_name_en
       FROM material_request_details mrd
       JOIN items i ON i.id = mrd.item_id
       JOIN units u ON u.code = mrd.unit_code
       WHERE mrd.request_id = $1`,
      [requestId]
    );
    return res.rows;
  }

  async findAll(filters: {
    status?: RequestStatus;
    department_id?: number;
    warehouse_id?: number;
    requested_by?: number;
    request_type?: RequestType;
    limit?: number;
    offset?: number;
    /** Pre-built authorization scope fragment (from scopeClause). */
    scope?: { clause: string; params: any[] };
    /** Current authenticated user — used to build the authorization scope clause. */
    user?: AuthUserContext;
    /** When true, the user's own requests are always included (requests:view_own). */
    includeOwnRequests?: boolean;
  }) {
    let where = 'WHERE mr.is_active = true';
    const params: any[] = [];
    let i = 1;

    if (filters.status)       { where += ` AND mr.status = $${i++}`;       params.push(filters.status); }
    if (filters.department_id) { where += ` AND mr.department_id = $${i++}`; params.push(filters.department_id); }
    if (filters.warehouse_id)  { where += ` AND mr.warehouse_id = $${i++}`;  params.push(filters.warehouse_id); }
    if (filters.requested_by)  { where += ` AND mr.requested_by = $${i++}`;  params.push(filters.requested_by); }
    if (filters.request_type)  { where += ` AND mr.request_type = $${i++}`;  params.push(filters.request_type); }
    if (filters.user) {
      const scope = scopeClause(
        filters.user,
        { departmentCol: 'mr.department_id', warehouseCol: 'mr.warehouse_id' },
        i
      );
      if (filters.includeOwnRequests) {
        where += ` AND (${scope.clause} OR mr.requested_by = $${i + scope.params.length})`;
        params.push(...scope.params, filters.user.id);
      } else {
        where += ` AND (${scope.clause})`;
        params.push(...scope.params);
      }
      i += scope.params.length + (filters.includeOwnRequests ? 1 : 0);
    }

    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    const [listRes, countRes] = await Promise.all([
      pool.query(
        `SELECT mr.id, mr.request_no, mr.status, mr.priority, mr.request_type, mr.project_id,
                p.project_no, p.name AS project_name,
                mr.needed_by, mr.created_at,
                d.name_ar AS department_name_ar, w.name_ar AS warehouse_name_ar, u.full_name AS requested_by_name
         FROM material_requests mr
         JOIN departments d ON d.id = mr.department_id
         JOIN warehouses w ON w.id = mr.warehouse_id
         JOIN users u ON u.id = mr.requested_by
         LEFT JOIN projects p ON p.id = mr.project_id
         ${where} ORDER BY mr.created_at DESC LIMIT $${i++} OFFSET $${i++}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM material_requests mr ${where}`, params),
    ]);

    return { items: listRes.rows, total: countRes.rows[0].total };
  }

  async updateStatus(
    client: PoolClient,
    id: number,
    status: RequestStatus,
    options?: {
      dept_approved_by?: number;
      forwarded_by?: number;
      approved_by?: number;
      rejected_by?: number;
      issued_by?: number;
      rejection_reason?: string;
      transaction_id?: number;
    }
  ) {
    const sets: string[] = ['status = $2'];
    const vals: any[] = [id, status];
    let idx = 3;

    if (status === 'dept_approved')  { sets.push(`dept_approved_by = $${idx++}`, `dept_approved_at = NOW()`); vals.push(options?.dept_approved_by); }
    if (status === 'wm_approved')    { sets.push(`dept_approved_by = $${idx++}`, `dept_approved_at = NOW()`); vals.push(options?.dept_approved_by); }
    if (status === 'forwarded')      { sets.push(`forwarded_by = $${idx++}`, `forwarded_at = NOW()`); vals.push(options?.forwarded_by); }
    if (status === 'admin_approved') { sets.push(`approved_by = $${idx++}`, `approved_at = NOW()`); vals.push(options?.approved_by); }
    if (status === 'admin_rejected') { sets.push(`rejected_by = $${idx++}`, `rejection_reason = $${idx++}`); vals.push(options?.rejected_by, options?.rejection_reason); }
    if (status === 'wm_rejected')    { sets.push(`rejected_by = $${idx++}`, `rejection_reason = $${idx++}`); vals.push(options?.rejected_by, options?.rejection_reason); }
    if (status === 'issued')         { sets.push(`issued_by = $${idx++}`, `issued_at = NOW()`, `transaction_id = $${idx++}`); vals.push(options?.issued_by, options?.transaction_id); }

    const res = await (client as any).query(
      `UPDATE material_requests SET ${sets.join(', ')} WHERE id = $1 AND is_active = true RETURNING *`,
      vals
    );
    return res.rows[0] || null;
  }
}

export const materialRequestsRepository = new MaterialRequestsRepository();
