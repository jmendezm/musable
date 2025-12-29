interface FrontendPlugin {
  id: string;
  name: string;
  version: string;
  initialize: () => Promise<void>;
  cleanup: () => Promise<void>;
}

class FrontendPluginLoader {
  private plugins: Map<string, FrontendPlugin> = new Map();
  private isLoaded = false;

  async loadPlugins(): Promise<void> {
    if (this.isLoaded) {
      console.log('[FrontendPluginLoader] Plugins already loaded');
      return;
    }

    console.log('[FrontendPluginLoader] 🔍 Discovering plugins...');

    try {
      const pluginContext = (require as any).context('../plugins', true, /index\.ts$/);
      const pluginPaths = pluginContext.keys();

      console.log(`[FrontendPluginLoader] 📦 Found ${pluginPaths.length} plugin modules`);

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
}

export const frontendPluginLoader = new FrontendPluginLoader();
