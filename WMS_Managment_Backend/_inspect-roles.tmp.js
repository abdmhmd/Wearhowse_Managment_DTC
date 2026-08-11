const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  try {
    const v = await p.query('SHOW server_version');
    console.log('PG_VERSION: ' + JSON.stringify(v.rows));
    const e = await p.query("SELECT enum_range(NULL::user_role) AS roles");
    console.log('USER_ROLE ENUM: ' + JSON.stringify(e.rows[0].roles));
    const r = await p.query('SELECT code, name_en, is_active FROM roles ORDER BY id');
    console.log('ROLES TABLE: ' + JSON.stringify(r.rows));
    const u = await p.query(
      `SELECT role, COUNT(*)::int AS cnt,
              COUNT(*) FILTER (WHERE department_id IS NULL)::int AS no_dept
         FROM users WHERE is_active = true GROUP BY role ORDER BY role`
    );
    console.log('ACTIVE USERS BY ROLE: ' + JSON.stringify(u.rows));
    const d = await p.query(
      `SELECT u.id, u.username, u.full_name, u.role, u.department_id,
              d.name_en AS dept, u.created_at
         FROM users u LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.role = 'department_manager'
        ORDER BY u.id`
    );
    console.log('DEPARTMENT_MANAGER USERS: ' + JSON.stringify(d.rows));
  } catch (err) {
    console.log('ERR ' + err.message);
  } finally {
    await p.end();
  }
})();
