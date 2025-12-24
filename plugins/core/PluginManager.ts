import path from 'path';
import fs from 'fs/promises';
import { Router } from 'express';
import { Server } from 'socket.io';
import {
  Plugin,
  PluginMetadata,
  PluginHealth,
  PluginEvent,
  PluginEventData,
  PluginContext
} from './types';

// Simple logger for plugin system (matches backend format)
const logger = {
  info: (msg: string, ...args: any[]) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] [PluginManager] ${msg}`, ...args);
  },
  error: (msg: string, ...args: any[]) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] [PluginManager] ${msg}`, ...args);
  },
  warn: (msg: string, ...args: any[]) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [WARN] [PluginManager] ${msg}`, ...args);
  }
};

class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private enabledPlugins: Set<string> = new Set();
  private eventListeners: Map<string, Array<(data: any) => void>> = new Map();
  private pluginContext: PluginContext;

  constructor(models: any, appConfig: any) {
    this.pluginContext = {
      models,
      logger,
      config: appConfig,
      emit: this.emit.bind(this),
      on: this.on.bind(this)
    };
  }

  /**
   * Load all plugins from the plugins directory
   */
  async loadPlugins(pluginsDir: string): Promise<void> {
    try {
      const pluginDirs = await fs.readdir(pluginsDir);

      for (const dir of pluginDirs) {
        // Skip the core folder (that's the framework, not a plugin)
        if (dir === 'core' || dir === 'node_modules') {
          continue;
        }

        const pluginPath = path.join(pluginsDir, dir);
        const stat = await fs.stat(pluginPath);

        if (stat.isDirectory()) {
          // Each plugin has a backend/ subdirectory
          const backendPath = path.join(pluginPath, 'backend');

          // Check if backend directory exists
          try {
            await fs.access(backendPath);
            await this.loadPlugin(backendPath);
          } catch (error) {
            logger.warn(`⚠️  No backend directory found for plugin: ${dir}`);
          }
        }
      }

      logger.info(`📦 Loaded ${this.plugins.size} plugins`);
    } catch (error) {
      logger.error('Error loading plugins:', error);
    }
  }

  /**
   * Load a single plugin from directory
   */
  async loadPlugin(pluginPath: string): Promise<void> {
    try {
      // Check for package.json or index.ts
      const packageJsonPath = path.join(pluginPath, 'package.json');
      const indexPath = path.join(pluginPath, 'dist', 'index.js');
      const tsIndexPath = path.join(pluginPath, 'src', 'index.ts');

      let pluginModule: any;
      let metadata: any = {};

      // Read package.json if exists
      if (await this.fileExists(packageJsonPath)) {
        const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
        metadata = JSON.parse(packageContent);
      }

      // Try to load compiled JS first, then TS
      if (await this.fileExists(indexPath)) {
        pluginModule = require(indexPath);
      } else if (await this.fileExists(tsIndexPath)) {
        // For development, load TS directly
        pluginModule = await import(tsIndexPath);
      } else {
        logger.warn(`⚠️  No index file found in ${pluginPath}`);
        return;
      }

      const plugin: Plugin = pluginModule.default || pluginModule.plugin;

      if (!plugin || !plugin.id || !plugin.name) {
        logger.warn(`⚠️  Invalid plugin in ${pluginPath}`);
        return;
      }

      // Check dependencies
      if (plugin.dependencies) {
        const missingDeps = plugin.dependencies.filter(
          dep => !this.plugins.has(dep)
        );

        if (missingDeps.length > 0) {
          logger.warn(
            `⚠️  Plugin ${plugin.id} missing dependencies: ${missingDeps.join(', ')}`
          );
          return;
        }
      }

      // Store plugin
      this.plugins.set(plugin.id, plugin);

      // Set plugin context before initialization
      if (plugin.setContext) {
        plugin.setContext(this.pluginContext);
      }

      // Check if enabled in config
      const appConfig = this.pluginContext.config;
      const enabledPlugins = appConfig.plugins?.enabled || [];
      const disabledPlugins = appConfig.plugins?.disabled || [];

      if (enabledPlugins.includes(plugin.id) ||
          (!disabledPlugins.includes(plugin.id) && metadata.enabledByDefault !== false)) {
        this.enabledPlugins.add(plugin.id);
      }

      // Initialize plugin
      await plugin.initialize();

      this.emit('plugin-loaded', {
        pluginId: plugin.id,
        timestamp: new Date()
      });

      logger.info(`✅ Loaded plugin: ${plugin.name} v${plugin.version}`);
    } catch (error) {
      logger.error(`❌ Error loading plugin from ${pluginPath}:`, error);
    }
  }

  /**
   * Start all enabled plugins
   */
  async startPlugins(io?: Server): Promise<void> {
    logger.info('🚀 Starting plugins...');

    for (const pluginId of this.enabledPlugins) {
      await this.startPlugin(pluginId, io);
    }

    logger.info(`✅ Started ${this.enabledPlugins.size} plugins`);
  }

  /**
   * Start a specific plugin
   */
  async startPlugin(pluginId: string, io?: Server): Promise<void> {
    const plugin = this.plugins.get(pluginId);

    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (!this.enabledPlugins.has(pluginId)) {
      logger.warn(`⚠️  Plugin ${pluginId} is disabled`);
      return;
    }

    try {
      // Setup WebSocket if needed
      if (plugin.setupWebSocket && io) {
        plugin.setupWebSocket(io);
      }

      // Call start method if exists
      if (plugin.start) {
        await plugin.start();
      }

      this.emit('plugin-enabled', {
        pluginId,
        timestamp: new Date()
      });

      logger.info(`▶️  Started plugin: ${plugin.name}`);
    } catch (error) {
      logger.error(`❌ Error starting plugin ${pluginId}:`, error);
      this.emit('plugin-error', {
        pluginId,
        error,
        timestamp: new Date()
      });
    }
  }

  /**
   * Stop a plugin
   */
  async stopPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);

    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    try {
      if (plugin.stop) {
        await plugin.stop();
      }

      this.enabledPlugins.delete(pluginId);

      this.emit('plugin-disabled', {
        pluginId,
        timestamp: new Date()
      });

      logger.info(`⏸️  Stopped plugin: ${plugin.name}`);
    } catch (error) {
      logger.error(`❌ Error stopping plugin ${pluginId}:`, error);
    }
  }

  /**
   * Enable a plugin
   */
  async enablePlugin(pluginId: string, io?: Server): Promise<void> {
    if (!this.plugins.has(pluginId)) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    this.enabledPlugins.add(pluginId);
    await this.startPlugin(pluginId, io);
  }

  /**
   * Disable a plugin
   */
  async disablePlugin(pluginId: string): Promise<void> {
    await this.stopPlugin(pluginId);
  }

  /**
   * Get plugin routes
   */
  getPluginRoutes(): Array<{ router: Router; mount: string }> {
    const routes: Array<{ router: Router; mount: string }> = [];

    for (const pluginId of this.enabledPlugins) {
      const plugin = this.plugins.get(pluginId);

      if (plugin && plugin.getRoutes) {
        try {
          const router = plugin.getRoutes();
          if (router) {
            routes.push({
              router,
              mount: pluginId
            });
          }
        } catch (error) {
          logger.error(`Error getting routes for plugin ${pluginId}:`, error);
        }
      }
    }

    return routes;
  }

  /**
   * Get all plugin metadata
   */
  getPlugins(): PluginMetadata[] {
    const metadata: PluginMetadata[] = [];

    for (const [id, plugin] of this.plugins.entries()) {
      metadata.push({
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        description: plugin.description,
        author: plugin.author,
        enabled: this.enabledPlugins.has(id),
        hasRoutes: !!plugin.getRoutes,
        hasWebSocket: !!plugin.setupWebSocket
      });
    }

    return metadata;
  }

  /**
   * Get plugin by ID
   */
  getPlugin(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Check if plugin is enabled
   */
  isEnabled(pluginId: string): boolean {
    return this.enabledPlugins.has(pluginId);
  }

  /**
   * Get plugin health
   */
  async getPluginHealth(pluginId: string): Promise<PluginHealth | null> {
    const plugin = this.plugins.get(pluginId);

    if (!plugin) {
      return null;
    }

    if (plugin.healthCheck) {
      return await plugin.healthCheck();
    }

    // Default health check
    return {
      status: 'healthy',
      message: 'Plugin running'
    };
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);

    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    try {
      // Stop if running
      if (this.enabledPlugins.has(pluginId)) {
        await this.stopPlugin(pluginId);
      }

      // Cleanup if needed
      if (plugin.cleanup) {
        await plugin.cleanup();
      }

      this.plugins.delete(pluginId);

      this.emit('plugin-unloaded', {
        pluginId,
        timestamp: new Date()
      });

      logger.info(`📤 Unloaded plugin: ${plugin.name}`);
    } catch (error) {
      logger.error(`❌ Error unloading plugin ${pluginId}:`, error);
    }
  }

  /**
   * Emit event to plugins
   */
  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);

    if (listeners) {
      listeners.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          logger.error(`Error in plugin event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Listen to plugin events
   */
  private on(event: string, handler: (data: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }

    this.eventListeners.get(event)!.push(handler);
  }

  /**
   * Shutdown all plugins
   */
  async shutdown(): Promise<void> {
    logger.info('🛑 Shutting down plugins...');

    for (const pluginId of this.enabledPlugins) {
      await this.stopPlugin(pluginId);
    }

    // Cleanup all plugins
    for (const [pluginId, plugin] of this.plugins.entries()) {
      if (plugin.cleanup) {
        try {
          await plugin.cleanup();
        } catch (error) {
          logger.error(`Error cleaning up plugin ${pluginId}:`, error);
        }
      }
    }

    this.plugins.clear();
    this.enabledPlugins.clear();

    logger.info('✅ All plugins shut down');
  }

  /**
   * Utility: Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

export default PluginManager;
