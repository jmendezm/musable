import { Router } from 'express';
import pluginModel from '../models/Plugin';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { pluginManager as globalPluginManager } from '../app';

const router = Router();

// Get all plugins
router.get('/', authenticateToken, requireAdmin, async (req, res): Promise<void> => {
  try {
    const plugins = await pluginModel.getAll();

    // Get settings and schema for each plugin
    const pluginsWithSettings = await Promise.all(
      plugins.map(async (plugin) => {
        const settings = await pluginModel.getSettings(plugin.plugin_id);
        const settingsObject: Record<string, string> = {};
        settings.forEach(s => {
          settingsObject[s.setting_key] = s.setting_value;
        });

        // Try to get settings schema from plugin
        let settingsSchema: any = null;
        if (globalPluginManager) {
          try {
            const loadedPlugin = globalPluginManager.plugins?.get(plugin.plugin_id);
            if (loadedPlugin && loadedPlugin.getSettingsSchema) {
              settingsSchema = loadedPlugin.getSettingsSchema();
            }
          } catch (err) {
            // Plugin might not have getSettingsSchema method
          }
        }

        return {
          ...plugin,
          settings: settingsObject,
          settingsSchema
        };
      })
    );

    res.json({
      success: true,
      data: { plugins: pluginsWithSettings }
    });
  } catch (error) {
    console.error('Error fetching plugins:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch plugins' }
    });
  }
});

// Get a single plugin by ID
router.get('/:id', authenticateToken, requireAdmin, async (req, res): Promise<void> => {
  try {
    const plugin = await pluginModel.getById(parseInt(req.params.id));

    if (!plugin) {
      res.status(404).json({
        success: false,
        error: { message: 'Plugin not found' }
      });
      return;
    }

    // Get settings for this plugin
    const settings = await pluginModel.getSettings(plugin.plugin_id);
    const settingsObject: Record<string, string> = {};
    settings.forEach(s => {
      settingsObject[s.setting_key] = s.setting_value;
    });

    res.json({
      success: true,
      data: { ...plugin, settings: settingsObject }
    });
  } catch (error) {
    console.error('Error fetching plugin:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch plugin' }
    });
  }
});

// Get plugin settings
router.get('/:pluginId/settings', authenticateToken, requireAdmin, async (req, res): Promise<void> => {
  try {
    const settings = await pluginModel.getSettings(req.params.pluginId);
    const settingsObject: Record<string, string> = {};
    settings.forEach(s => {
      settingsObject[s.setting_key] = s.setting_value;
    });

    res.json({
      success: true,
      data: settingsObject
    });
  } catch (error) {
    console.error('Error fetching plugin settings:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch plugin settings' }
    });
  }
});

// Update plugin settings
router.put('/:pluginId/settings', authenticateToken, requireAdmin, async (req, res): Promise<void> => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      res.status(400).json({
        success: false,
        error: { message: 'Settings object is required' }
      });
      return;
    }

    // Update each setting
    for (const [key, value] of Object.entries(settings)) {
      await pluginModel.setSetting(req.params.pluginId, key, String(value));
    }

    res.json({
      success: true,
      data: { message: 'Settings updated successfully' }
    });
  } catch (error) {
    console.error('Error updating plugin settings:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to update plugin settings' }
    });
  }
});

// Enable/disable a plugin
router.put('/:id/toggle', authenticateToken, requireAdmin, async (req, res): Promise<void> => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      res.status(400).json({
        success: false,
        error: { message: 'enabled field must be a boolean' }
      });
      return;
    }

    // First update the database
    const plugin = await pluginModel.setEnabled(parseInt(req.params.id), enabled);

    // Then actually enable/disable the plugin in the PluginManager
    if (globalPluginManager) {
      try {
        if (enabled) {
          // Get the io server instance - we need to pass it to enablePlugin
          // For now, we'll just enable it without WebSocket re-setup
          const io = (req as any).app.get('io');
          await globalPluginManager.enablePlugin(plugin.plugin_id, io);
        } else {
          await globalPluginManager.disablePlugin(plugin.plugin_id);
        }
      } catch (err) {
        console.error('Error toggling plugin in PluginManager:', err);
      }
    }

    res.json({
      success: true,
      data: plugin
    });
  } catch (error) {
    console.error('Error toggling plugin:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to toggle plugin' }
    });
  }
});

// Delete a plugin
router.delete('/:id', authenticateToken, requireAdmin, async (req, res): Promise<void> => {
  try {
    await pluginModel.delete(parseInt(req.params.id));

    res.json({
      success: true,
      data: { message: 'Plugin deleted successfully' }
    });
  } catch (error) {
    console.error('Error deleting plugin:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to delete plugin' }
    });
  }
});

export default router;
