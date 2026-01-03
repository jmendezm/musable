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
      console.log('[FrontendPluginLoader] Plugins already loaded');
      return;
    }

    console.log('[FrontendPluginLoader] 🔍 Discovering plugins...');

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
          console.log('[FrontendPluginLoader] ℹ️  No plugins directory found (this is normal for base installation)');
          this.isLoaded = true;
          return;
        }
        throw contextError; // Re-throw if it's a different error
      }

      console.log(`[FrontendPluginLoader] 📦 Found ${pluginPaths.length} plugin modules`);

      // If no plugins found, just return
      if (pluginPaths.length === 0) {
        console.log('[FrontendPluginLoader] ℹ️  No plugins available');
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
            console.log('[FrontendPluginLoader] 📋 Enabled plugins from backend:', Array.from(enabledPluginIds));
          }
        } catch (error) {
          console.warn('[FrontendPluginLoader] ⚠️ Could not fetch enabled plugins from backend, loading all plugins');
        }
      }

      for (const path of pluginPaths) {
        try {
          const module = pluginContext(path);
          const plugin = module.default;

          if (!plugin) {
            console.warn(`[FrontendPluginLoader] ⚠️ No default export from ${path}`);
            continue;
          }

          if (!plugin.id || !plugin.initialize || !plugin.cleanup) {
            console.warn(`[FrontendPluginLoader] ⚠️ Invalid plugin structure from ${path}`);
            continue;
          }

          // Store the module for reloading later
          this.pluginModules.set(plugin.id, { module, path });

          // Only load enabled plugins
          if (enabledPluginIds.size > 0 && !enabledPluginIds.has(plugin.id)) {
            console.log(`[FrontendPluginLoader] ⏭️  Skipping disabled plugin: ${plugin.id}`);
            continue;
          }

          console.log(`[FrontendPluginLoader] 📝 Loading plugin: ${plugin.id} (${plugin.name} v${plugin.version})`);

          await plugin.initialize();
          this.plugins.set(plugin.id, plugin);

          console.log(`[FrontendPluginLoader] ✅ Plugin loaded: ${plugin.id}`);
        } catch (error) {
          console.error(`[FrontendPluginLoader] ❌ Error loading plugin from ${path}:`, error);
        }
      }

      this.isLoaded = true;
      console.log(`[FrontendPluginLoader] ✅ Successfully loaded ${this.plugins.size} plugins`);
    } catch (error) {
      console.error('[FrontendPluginLoader] ❌ Error loading plugins:', error);
      this.isLoaded = true;
    }
  }

  async cleanupAll(): Promise<void> {
    console.log('[FrontendPluginLoader] 🧹 Cleaning up all plugins...');

    const cleanupPromises = Array.from(this.plugins.values()).map(async (plugin) => {
      try {
        await plugin.cleanup();
        console.log(`[FrontendPluginLoader] ✅ Cleaned up: ${plugin.id}`);
      } catch (error) {
        console.error(`[FrontendPluginLoader] ❌ Error cleaning up ${plugin.id}:`, error);
      }
    });

    await Promise.all(cleanupPromises);
    this.plugins.clear();
    this.isLoaded = false;

    console.log('[FrontendPluginLoader] ✅ All plugins cleaned up');
  }

  getPlugins(): FrontendPlugin[] {
    return Array.from(this.plugins.values());
  }

  getPlugin(id: string): FrontendPlugin | undefined {
    return this.plugins.get(id);
  }

  async syncWithBackend(apiService: any): Promise<void> {
    console.log('[FrontendPluginLoader] 🔄 Syncing plugins with backend state...');

    try {
      // Fetch enabled plugins from backend
      const response = await apiService.request('GET', '/plugins') as any;

      if (!response.success || !response.data || !response.data.plugins) {
        console.error('[FrontendPluginLoader] ❌ Invalid response from backend');
        return;
      }

      const enabledPluginIds = new Set(
        response.data.plugins
          .filter((p: any) => p.enabled)
          .map((p: any) => p.plugin_id)
      );

      console.log('[FrontendPluginLoader] 📋 Enabled plugins from backend:', Array.from(enabledPluginIds));

      // Cleanup plugins that should be disabled
      const loadedPlugins = Array.from(this.plugins.entries());
      for (const [pluginId, plugin] of loadedPlugins) {
        if (!enabledPluginIds.has(pluginId)) {
          console.log(`[FrontendPluginLoader] 🧹 Cleaning up disabled plugin: ${pluginId}`);
          try {
            await plugin.cleanup();
            this.plugins.delete(pluginId);
            console.log(`[FrontendPluginLoader] ✅ Cleaned up: ${pluginId}`);
          } catch (error) {
            console.error(`[FrontendPluginLoader] ❌ Error cleaning up ${pluginId}:`, error);
          }
        }
      }

      // Initialize plugins that should be enabled
      const enabledPluginsArray = Array.from(enabledPluginIds);
      for (const pluginId of enabledPluginsArray) {
        if (!this.plugins.has(pluginId as string)) {
          const pluginModule = this.pluginModules.get(pluginId as string);
          if (!pluginModule) {
            console.warn(`[FrontendPluginLoader] ⚠️ Plugin module not found: ${pluginId}`);
            continue;
          }

          console.log(`[FrontendPluginLoader] 📝 Initializing enabled plugin: ${pluginId}`);
          try {
            await pluginModule.module.default.initialize();
            this.plugins.set(pluginId as string, pluginModule.module.default);
            console.log(`[FrontendPluginLoader] ✅ Initialized: ${pluginId}`);
          } catch (error) {
            console.error(`[FrontendPluginLoader] ❌ Error initializing ${pluginId}:`, error);
          }
        }
      }

      console.log('[FrontendPluginLoader] ✅ Plugin sync complete');
    } catch (error) {
      console.error('[FrontendPluginLoader] ❌ Error syncing plugins:', error);
    }
  }
}

export const frontendPluginLoader = new FrontendPluginLoader();
