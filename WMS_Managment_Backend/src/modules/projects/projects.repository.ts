import { pool } from '../../config/database';
import { PoolClient } from 'pg';
import { scopeForUser } from '../authorization/scope';
import type { AuthUserContext } from '../authorization/authorization.service';

export type ProjectStatus = 'open' | 'closed' | 'cancelled';

export interface ProjectStudent {
  id?: number;
  full_name: string;
  student_id?: string | null;
  role?: string | null;
}

export interface ProjectFilters {
  status?: ProjectStatus;
  department_id?: number;
  warehouse_id?: number;
  supervisor_id?: number;
  academic_year?: string;
  search?: string;
  limit?: number;
  offset?: number;
  /** Current authenticated user — used to build the authorization scope clause. */
  user?: AuthUserContext;
}

export class ProjectsRepository {
  async generateProjectNo(): Promise<string> {
    const res = await pool.query("SELECT nextval('project_no_seq') AS seq");
    const seq = res.rows[0].seq;
    const year = new Date().getFullYear();
    return `PRJ-${year}-${String(seq).padStart(5, '0')}`;
  }

  async create(
    data: {
      project_no: string;
      name: string;
      department_id: number;
      warehouse_id: number;
      supervisor_id: number;
      created_by: number;
      academic_year?: string | null;
      description?: string | null;
      start_date?: string | Date | null;
      expected_completion_date?: string | Date | null;
      notes?: string | null;
    },
    client?: PoolClient
  ) {
    const q = client ?? pool;
    const res = await q.query(
      `INSERT INTO projects
         (project_no, name, department_id, warehouse_id, supervisor_id, created_by,
          academic_year, description, start_date, expected_completion_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        data.project_no,
        data.name,
        data.department_id,
        data.warehouse_id,
        data.supervisor_id,
        data.created_by,
        data.academic_year ?? null,
        data.description ?? null,
        data.start_date ? new Date(data.start_date) : null,
        data.expected_completion_date ? new Date(data.expected_completion_date) : null,
        data.notes ?? null,
      ]
    );
    return res.rows[0];
  }

  async findAll(filters: ProjectFilters) {
    let where = 'WHERE p.is_active = true';
    const params: any[] = [];
    let i = 1;

    if (filters.status)         { where += ` AND p.status = $${i++}`;         params.push(filters.status); }
    if (filters.department_id)  { where += ` AND p.department_id = $${i++}`;  params.push(filters.department_id); }
    if (filters.warehouse_id)   { where += ` AND p.warehouse_id = $${i++}`;   params.push(filters.warehouse_id); }
    if (filters.supervisor_id)  { where += ` AND p.supervisor_id = $${i++}`;  params.push(filters.supervisor_id); }
    if (filters.academic_year)  { where += ` AND p.academic_year = $${i++}`;  params.push(filters.academic_year); }
    if (filters.search)         { where += ` AND (p.name ILIKE $${i} OR p.project_no ILIKE $${i})`; params.push(`%${filters.search}%`); i++; }
    if (filters.user) {
      // The list must use the EXACT same scope rules as `ProjectsService.inScope`
      // used by getById — otherwise a warehouse_manager who can open a project
      // by id would never see it in the list.
      const scope = scopeForUser(filters.user);
      if (scope === 'GLOBAL') {
        // no restriction
      } else if (scope === 'DEPARTMENT' && filters.user.department_id != null) {
        where += ` AND p.department_id = $${i++}`;
        params.push(filters.user.department_id);
      } else if (scope === 'WAREHOUSE') {
        if (filters.user.warehouse_ids.length === 0) {
          where += ' AND FALSE';
        } else {
          // A warehouse manager sees projects of the departments that own their
          // assigned warehouses (a main warehouse is bound to its department).
          where += ` AND p.department_id IN (SELECT DISTINCT w.department_id FROM warehouses w WHERE w.id = ANY($${i++}) AND w.department_id IS NOT NULL AND w.is_active = true)`;
          params.push(filters.user.warehouse_ids);
        }
      } else {
        where += ' AND FALSE';
      }
    }

    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    const [listRes, countRes] = await Promise.all([
      pool.query(
        `SELECT p.*,
                d.name_ar AS department_name_ar, d.name_en AS department_name_en,
                w.name_ar AS warehouse_name_ar, w.name_en AS warehouse_name_en,
                s.full_name AS supervisor_name,
                c.full_name AS created_by_name,
                cl.full_name AS closed_by_name,
                (SELECT COUNT(*)::int FROM material_requests mr WHERE mr.project_id = p.id AND mr.is_active = true) AS request_count,
                (SELECT COUNT(*)::int FROM custodies c WHERE c.project_id = p.id AND c.status = 'active' AND c.is_active = true) AS active_custodies,
                (SELECT COUNT(*)::int FROM project_students ps WHERE ps.project_id = p.id) AS students_count,
                (SELECT COUNT(*)::int FROM custodies c WHERE c.project_id = p.id AND c.is_active = true) AS borrowed_count
         FROM projects p
         JOIN departments d ON d.id = p.department_id
         LEFT JOIN warehouses w ON w.id = p.warehouse_id
         JOIN users s ON s.id = p.supervisor_id
         JOIN users c ON c.id = p.created_by
         LEFT JOIN users cl ON cl.id = p.closed_by
         ${where}
         ORDER BY p.created_at DESC
         LIMIT $${i++} OFFSET $${i++}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM projects p ${where}`, params),
    ]);

    return { items: listRes.rows, total: countRes.rows[0].total };
  }

  async findById(id: number) {
    const res = await pool.query(
      `SELECT p.*,
              d.name_ar AS department_name_ar, d.name_en AS department_name_en,
              w.name_ar AS warehouse_name_ar, w.name_en AS warehouse_name_en,
              s.full_name AS supervisor_name,
              c.full_name AS created_by_name,
              cl.full_name AS closed_by_name,
              (SELECT COUNT(*)::int FROM material_requests mr WHERE mr.project_id = p.id AND mr.is_active = true) AS request_count,
              (SELECT COUNT(*)::int FROM custodies c WHERE c.project_id = p.id AND c.status = 'active' AND c.is_active = true) AS active_custodies,
              (SELECT COUNT(*)::int FROM project_students ps WHERE ps.project_id = p.id) AS students_count,
              (SELECT COUNT(*)::int FROM custodies c WHERE c.project_id = p.id AND c.is_active = true) AS borrowed_count
       FROM projects p
       JOIN departments d ON d.id = p.department_id
       LEFT JOIN warehouses w ON w.id = p.warehouse_id
       JOIN users s ON s.id = p.supervisor_id
       JOIN users c ON c.id = p.created_by
       LEFT JOIN users cl ON cl.id = p.closed_by
       WHERE p.id = $1 AND p.is_active = true`,
      [id]
    );
    return res.rows[0] || null;
  }

  async update(
    id: number,
    data: {
      name?: string;
      warehouse_id?: number;
      supervisor_id?: number;
      academic_year?: string | null;
      description?: string | null;
      start_date?: string | Date | null;
      expected_completion_date?: string | Date | null;
      notes?: string | null;
    }
  ) {
    const sets: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (data.name !== undefined)                    { sets.push(`name = $${i++}`);                   params.push(data.name); }
    if (data.warehouse_id !== undefined)            { sets.push(`warehouse_id = $${i++}`);           params.push(data.warehouse_id); }
    if (data.supervisor_id !== undefined)           { sets.push(`supervisor_id = $${i++}`);          params.push(data.supervisor_id); }
    if (data.academic_year !== undefined)           { sets.push(`academic_year = $${i++}`);          params.push(data.academic_year); }
    if (data.description !== undefined)             { sets.push(`description = $${i++}`);            params.push(data.description); }
    if (data.start_date !== undefined)              { sets.push(`start_date = $${i++}`);             params.push(data.start_date ? new Date(data.start_date) : null); }
    if (data.expected_completion_date !== undefined){ sets.push(`expected_completion_date = $${i++}`); params.push(data.expected_completion_date ? new Date(data.expected_completion_date) : null); }
    if (data.notes !== undefined)                   { sets.push(`notes = $${i++}`);                  params.push(data.notes); }

    if (sets.length === 0) {
      return this.findById(id);
    }

    params.push(id);
    const res = await pool.query(
      `UPDATE projects SET ${sets.join(', ')} WHERE id = $${i} AND is_active = true RETURNING *`,
      params
    );
    return res.rows[0] || null;
  }

  async close(id: number, closedBy: number, client?: PoolClient) {
    const q = client ?? pool;
    const res = await q.query(
      `UPDATE projects
       SET status = 'closed', closed_by = $2, closed_at = NOW()
       WHERE id = $1 AND is_active = true
       RETURNING *`,
      [id, closedBy]
    );
    return res.rows[0] || null;
  }

  async cancel(id: number, cancelledBy: number, client?: PoolClient) {
    const q = client ?? pool;
    const res = await q.query(
      `UPDATE projects
       SET status = 'cancelled', closed_by = $2, closed_at = NOW()
       WHERE id = $1 AND is_active = true
       RETURNING *`,
      [id, cancelledBy]
    );
    return res.rows[0] || null;
  }

  async deactivate(id: number) {
    const res = await pool.query(
      `UPDATE projects SET is_active = false WHERE id = $1 RETURNING *`,
      [id]
    );
    return res.rows[0] || null;
  }

  // ── Students ───────────────────────────────────────────────────────────────
  /** Replaces the project's student roster (delete-all + insert). */
  async setStudents(client: PoolClient, projectId: number, students: ProjectStudent[]) {
    await client.query('DELETE FROM project_students WHERE project_id = $1', [projectId]);
    for (const s of students) {
      await client.query(
        `INSERT INTO project_students (project_id, full_name, student_id, role)
         VALUES ($1, $2, $3, $4)`,
        [projectId, s.full_name, s.student_id ?? null, s.role ?? null]
      );
    }
  }

  async findStudents(projectId: number): Promise<ProjectStudent[]> {
    const res = await pool.query(
      `SELECT id, full_name, student_id, role
       FROM project_students
       WHERE project_id = $1
       ORDER BY id`,
      [projectId]
    );
    return res.rows;
  }

  // ── Project materials (custodies) ──────────────────────────────────────────
  /** Borrowed / returned materials linked to a project. */
  async findProjectMaterials(projectId: number) {
    const res = await pool.query(
      `SELECT c.*,
              i.item_code, i.name_ar AS item_name_ar, i.name_en AS item_name_en,
              u.full_name AS assigned_to_name,
              w.name_ar AS warehouse_name_ar, w.name_en AS warehouse_name_en,
              it.transaction_no AS issued_transaction_no,
              rt.transaction_no AS return_transaction_no
       FROM custodies c
       JOIN items i ON i.id = c.item_id
       JOIN users u ON u.id = c.assigned_to
       JOIN warehouses w ON w.id = c.warehouse_id
       LEFT JOIN transactions it ON it.id = c.issued_transaction_id
       LEFT JOIN transactions rt ON rt.id = c.return_transaction_id
       WHERE c.project_id = $1 AND c.is_active = true
       ORDER BY c.created_at DESC`,
      [projectId]
    );
    return res.rows;
  }
}

export const projectsRepository = new ProjectsRepository();
