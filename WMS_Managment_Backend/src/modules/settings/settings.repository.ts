import { pool } from '../../config/database';

export class SettingsRepository {
  async findAll(): Promise<{ key: string; value: string }[]> {
    const res = await pool.query('SELECT key, value FROM system_settings ORDER BY key');
    return res.rows;
  }

  async upsert(key: string, value: string): Promise<void> {
    await pool.query(
      `INSERT INTO system_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
      [key, value]
    );
  }
}
export const settingsRepository = new SettingsRepository();
