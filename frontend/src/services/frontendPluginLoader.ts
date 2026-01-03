interface FrontendPlugin {
  id: string;
  name: string;
  version: string;
  initialize: () => Promise<void>;
  cleanup: () => Promise<void>;
}

class FrontendPluginLoader {
  private plugins: Map<string, FrontendPlugin> = new Map();
  private pluginModules: Map<string, any> = new Map();
  private isLoaded = false;

  async loadPlugins(apiService?: any): Promise<void> {
    if (this.isLoaded) {
      return;
    }

    try {
      let pluginContext: any;
      let pluginPaths: string[] = [];

      // Try to load plugins context - fail gracefully if plugins directory doesn't exist
      try {
        // Look for both TypeScript (.ts) and compiled JavaScript (.js) plugins
        pluginContext = (require as any).context('../plugins', true, /index\.(ts|js)$/);
        pluginPaths = pluginContext.keys();
      } catch (contextError: any) {
        // Plugins directory doesn't exist or no plugins found - this is normal for base installation
        if (contextError.code === 'MODULE_NOT_FOUND' || contextError.message.includes('Cannot resolve')) {
          this.isLoaded = true;
          return;
        }
        throw contextError; // Re-throw if it's a different error
      }

      // If no plugins found, just return
      if (pluginPaths.length === 0) {
        this.isLoaded = true;
        return;
      }

      // Fetch enabled plugins from backend first
      let enabledPluginIds = new Set<string>();
      if (apiService) {
        try {
          const response = await apiService.request('GET', '/plugins') as any;
          if (response.success && response.data && response.data.plugins) {
            enabledPluginIds = new Set(
              response.data.plugins
                .filter((p: any) => p.enabled)
                .map((p: any) => p.plugin_id)
            );
          }
        } catch (error) {
          console.warn('[FrontendPluginLoader] Could not fetch enabled plugins from backend');
        }
      }

      for (const path of pluginPaths) {
        try {
          const module = pluginContext(path);
          const plugin = module.default;

          if (!plugin) {
            continue;
          }

          if (!plugin.id || !plugin.initialize || !plugin.cleanup) {
            continue;
          }

          // Store the module for reloading later
          this.pluginModules.set(plugin.id, { module, path });

          // Only load enabled plugins
          if (enabledPluginIds.size > 0 && !enabledPluginIds.has(plugin.id)) {
            continue;
          }

          await plugin.initialize();
          this.plugins.set(plugin.id, plugin);
        } catch (error) {
          console.error(`[FrontendPluginLoader] Error loading plugin from ${path}:`, error);
        }
      }

      this.isLoaded = true;
    } catch (error) {
      console.error('[FrontendPluginLoader] Error loading plugins:', error);
      this.isLoaded = true;
    }
  }

  async cleanupAll(): Promise<void> {
    const cleanupPromises = Array.from(this.plugins.values()).map(async (plugin) => {
      try {
        await plugin.cleanup();
      } catch (error) {
        console.error(`[FrontendPluginLoader] Error cleaning up ${plugin.id}:`, error);
      }
    });

    await Promise.all(cleanupPromises);
    this.plugins.clear();
    this.isLoaded = false;
  }

  getPlugins(): FrontendPlugin[] {
    return Array.from(this.plugins.values());
  }

  getPlugin(id: string): FrontendPlugin | undefined {
    return this.plugins.get(id);
  }

  async syncWithBackend(apiService: any): Promise<void> {
    try {
      // Fetch enabled plugins from backend
      const response = await apiService.request('GET', '/plugins') as any;

      if (!response.success || !response.data || !response.data.plugins) {
        console.error('[FrontendPluginLoader] Invalid response from backend');
        return;
      }

      const enabledPluginIds = new Set(
        response.data.plugins
          .filter((p: any) => p.enabled)
          .map((p: any) => p.plugin_id)
      );

      // Cleanup plugins that should be disabled
      const loadedPlugins = Array.from(this.plugins.entries());
      for (const [pluginId, plugin] of loadedPlugins) {
        if (!enabledPluginIds.has(pluginId)) {
          try {
            await plugin.cleanup();
            this.plugins.delete(pluginId);
          } catch (error) {
            console.error(`[FrontendPluginLoader] Error cleaning up ${pluginId}:`, error);
          }
        }
      }

      // Initialize plugins that should be enabled
      const enabledPluginsArray = Array.from(enabledPluginIds);
      for (const pluginId of enabledPluginsArray) {
        if (!this.plugins.has(pluginId as string)) {
          const pluginModule = this.pluginModules.get(pluginId as string);
          if (!pluginModule) {
            continue;
          }

          try {
            await pluginModule.module.default.initialize();
            this.plugins.set(pluginId as string, pluginModule.module.default);
          } catch (error) {
            console.error(`[FrontendPluginLoader] Error initializing ${pluginId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('[FrontendPluginLoader] Error syncing plugins:', error);
    }
  }
}

export const frontendPluginLoader = new FrontendPluginLoader();
