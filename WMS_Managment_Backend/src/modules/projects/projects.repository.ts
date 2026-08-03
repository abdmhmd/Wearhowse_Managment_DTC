import { pool } from '../../config/database';
import { PoolClient } from 'pg';

export type ProjectStatus = 'open' | 'closed';

export interface ProjectFilters {
  status?: ProjectStatus;
  department_id?: number;
  supervisor_id?: number;
  limit?: number;
  offset?: number;
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
      supervisor_id: number;
      created_by: number;
      notes?: string | null;
    },
    client?: PoolClient
  ) {
    const q = client ?? pool;
    const res = await q.query(
      `INSERT INTO projects (project_no, name, department_id, supervisor_id, created_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.project_no, data.name, data.department_id, data.supervisor_id, data.created_by, data.notes ?? null]
    );
    return res.rows[0];
  }

  async findAll(filters: ProjectFilters) {
    let where = 'WHERE p.is_active = true';
    const params: any[] = [];
    let i = 1;

    if (filters.status)         { where += ` AND p.status = $${i++}`;         params.push(filters.status); }
    if (filters.department_id)  { where += ` AND p.department_id = $${i++}`;  params.push(filters.department_id); }
    if (filters.supervisor_id)  { where += ` AND p.supervisor_id = $${i++}`;  params.push(filters.supervisor_id); }

    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    const [listRes, countRes] = await Promise.all([
      pool.query(
        `SELECT p.*,
                d.name_ar AS department_name_ar, d.name_en AS department_name_en,
                s.full_name AS supervisor_name,
                c.full_name AS created_by_name,
                cl.full_name AS closed_by_name,
                (SELECT COUNT(*)::int FROM material_requests mr WHERE mr.project_id = p.id AND mr.is_active = true) AS request_count,
                (SELECT COUNT(*)::int FROM custodies c WHERE c.project_id = p.id AND c.status = 'active' AND c.is_active = true) AS active_custodies
         FROM projects p
         JOIN departments d ON d.id = p.department_id
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
              s.full_name AS supervisor_name,
              c.full_name AS created_by_name,
              cl.full_name AS closed_by_name,
              (SELECT COUNT(*)::int FROM material_requests mr WHERE mr.project_id = p.id AND mr.is_active = true) AS request_count,
              (SELECT COUNT(*)::int FROM custodies c WHERE c.project_id = p.id AND c.status = 'active' AND c.is_active = true) AS active_custodies
       FROM projects p
       JOIN departments d ON d.id = p.department_id
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
    data: { name?: string; supervisor_id?: number; notes?: string | null }
  ) {
    const sets: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (data.name !== undefined)          { sets.push(`name = $${i++}`);          params.push(data.name); }
    if (data.supervisor_id !== undefined) { sets.push(`supervisor_id = $${i++}`);  params.push(data.supervisor_id); }
    if (data.notes !== undefined)         { sets.push(`notes = $${i++}`);          params.push(data.notes); }

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

  async deactivate(id: number) {
    const res = await pool.query(
      `UPDATE projects SET is_active = false WHERE id = $1 RETURNING *`,
      [id]
    );
    return res.rows[0] || null;
  }
}

export const projectsRepository = new ProjectsRepository();
