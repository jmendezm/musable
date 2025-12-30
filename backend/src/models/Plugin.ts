import Database from '../config/database';

export interface Plugin {
  id?: number;
  plugin_id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  enabled: boolean;
  installed_at?: string;
  updated_at?: string;
}

export interface PluginSetting {
  id?: number;
  plugin_id: string;
  setting_key: string;
  setting_value: string;
  updated_at?: string;
}

class PluginModel {
  private db = Database;

  async getAll(): Promise<Plugin[]> {
    const plugins = await this.db.query<Plugin>(`
      SELECT * FROM plugins
      ORDER BY name ASC
    `);
    return plugins || [];
  }

  async getById(id: number): Promise<Plugin | null> {
    const plugin = await this.db.get<Plugin>(
      'SELECT * FROM plugins WHERE id = ?',
      [id]
    );
    return plugin || null;
  }

  async getByPluginId(pluginId: string): Promise<Plugin | null> {
    const plugin = await this.db.get<Plugin>(
      'SELECT * FROM plugins WHERE plugin_id = ?',
      [pluginId]
    );
    return plugin || null;
  }

  async create(plugin: Omit<Plugin, 'id' | 'installed_at' | 'updated_at'>): Promise<Plugin> {
    const result = await this.db.run(
      `INSERT INTO plugins (plugin_id, name, version, description, author, enabled, installed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [plugin.plugin_id, plugin.name, plugin.version, plugin.description || null, plugin.author || null, plugin.enabled ? 1 : 0]
    );

    const newPlugin = await this.db.get<Plugin>(
      'SELECT * FROM plugins WHERE id = ?',
      [result.lastID]
    );

    if (!newPlugin) {
      throw new Error('Failed to create plugin');
    }

    return newPlugin;
  }

  async update(id: number, updates: Partial<Plugin>): Promise<Plugin> {
    const updateFields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      updateFields.push('name = ?');
      values.push(updates.name);
    }

    if (updates.version !== undefined) {
      updateFields.push('version = ?');
      values.push(updates.version);
    }

    if (updates.description !== undefined) {
      updateFields.push('description = ?');
      values.push(updates.description);
    }

    if (updates.author !== undefined) {
      updateFields.push('author = ?');
      values.push(updates.author);
    }

    if (updates.enabled !== undefined) {
      updateFields.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }

    updateFields.push('updated_at = datetime(\'now\')');
    values.push(id);

    await this.db.run(
      `UPDATE plugins SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );

    const updatedPlugin = await this.db.get<Plugin>(
      'SELECT * FROM plugins WHERE id = ?',
      [id]
    );

    if (!updatedPlugin) {
      throw new Error('Plugin not found');
    }

    return updatedPlugin;
  }

  async delete(id: number): Promise<void> {
    // First delete all settings for this plugin
    await this.db.run(
      'DELETE FROM plugin_settings WHERE plugin_id = (SELECT plugin_id FROM plugins WHERE id = ?)',
      [id]
    );

    // Then delete the plugin
    const result = await this.db.run(
      'DELETE FROM plugins WHERE id = ?',
      [id]
    );

    if (result.changes === 0) {
      throw new Error('Plugin not found');
    }
  }

  async setEnabled(id: number, enabled: boolean): Promise<Plugin> {
    return this.update(id, { enabled });
  }

  // Plugin settings methods
  async getSettings(pluginId: string): Promise<PluginSetting[]> {
    const settings = await this.db.query<PluginSetting>(
      'SELECT * FROM plugin_settings WHERE plugin_id = ?',
      [pluginId]
    );
    return settings || [];
  }

  async getSetting(pluginId: string, key: string): Promise<string | null> {
    const setting = await this.db.get<PluginSetting>(
      'SELECT setting_value FROM plugin_settings WHERE plugin_id = ? AND setting_key = ?',
      [pluginId, key]
    );
    return setting?.setting_value || null;
  }

  async setSetting(pluginId: string, key: string, value: string): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO plugin_settings (plugin_id, setting_key, setting_value, updated_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [pluginId, key, value]
    );
  }

  async deleteSetting(pluginId: string, key: string): Promise<void> {
    await this.db.run(
      'DELETE FROM plugin_settings WHERE plugin_id = ? AND setting_key = ?',
      [pluginId, key]
    );
  }

  async getAllSettings(): Promise<Record<string, Record<string, string>>> {
    const settings = await this.db.query<PluginSetting>(
      'SELECT * FROM plugin_settings'
    );

    const result: Record<string, Record<string, string>> = {};

    for (const setting of settings || []) {
      if (!result[setting.plugin_id]) {
        result[setting.plugin_id] = {};
      }
      result[setting.plugin_id][setting.setting_key] = setting.setting_value;
    }

    return result;
  }

  // Static convenience methods
  static async getAll(): Promise<Plugin[]> {
    return pluginInstance.getAll();
  }

  static async getByPluginId(pluginId: string): Promise<Plugin | null> {
    return pluginInstance.getByPluginId(pluginId);
  }

  static async getSetting(pluginId: string, key: string): Promise<string | null> {
    return pluginInstance.getSetting(pluginId, key);
  }

  static async setSetting(pluginId: string, key: string, value: string): Promise<void> {
    return pluginInstance.setSetting(pluginId, key, value);
  }
}

const pluginInstance = new PluginModel();

export default pluginInstance;
