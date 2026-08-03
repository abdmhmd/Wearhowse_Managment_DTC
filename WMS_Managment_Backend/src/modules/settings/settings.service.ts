import { settingsRepository } from './settings.repository';

export class SettingsService {
  async getAll() {
    const rows = await settingsRepository.findAll();
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  async update(data: Record<string, string>) {
    for (const [key, value] of Object.entries(data)) {
      await settingsRepository.upsert(key, value);
    }
    return this.getAll();
  }
}
export const settingsService = new SettingsService();
