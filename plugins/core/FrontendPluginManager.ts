import { lazy, Suspense } from 'react';
import { RouteObject } from 'react-router-dom';
import { logger } from '../utils/logger'; // You may need to create this
import {
  FrontendPlugin,
  PluginMetadata,
  PluginContext,
  PluginEvent,
  SidebarItem,
  AdminSection,
  PlayerAction,
  ContextMenuItem
} from './types';

// Simple logger if you don't have one
const log = {
  info: (msg: string, ...args: any[]) => console.log(`[PluginManager] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[PluginManager] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(`[PluginManager] ${msg}`, ...args)
};

class FrontendPluginManager {
  private plugins: Map<string, FrontendPlugin> = new Map();
  private enabledPlugins: Set<string> = new Set();
  private eventListeners: Map<string, Array<(data: any) => void>> = new Map();
  private context: PluginContext;

  constructor(apiClient: any) {
    this.context = {
      api: apiClient,
      emit: this.emit.bind(this),
      on: this.on.bind(this),
      getPlugin: this.getPlugin.bind(this),
      isBackendAvailable: this.isBackendAvailable.bind(this)
    };
  }

  /**
   * Load all plugins from the plugins directory
   * For now, we'll load them from a compiled manifest
   */
  async loadPlugins(pluginManifest: any[]): Promise<void> {
    try {
      for (const pluginConfig of pluginManifest) {
        await this.loadPlugin(pluginConfig);
      }

      log.info(`📦 Loaded ${this.plugins.size} frontend plugins`);
    } catch (error) {
      log.error('Error loading plugins:', error);
    }
  }

  /**
   * Load a single plugin
   */
  async loadPlugin(pluginConfig: any): Promise<void> {
    try {
      // For development, we can dynamically import
      // In production, plugins should be pre-compiled

      const pluginModule = await import(/* @vite-ignore */ `../../plugins/${pluginConfig.id}/frontend/src/index.ts`);
      const plugin: FrontendPlugin = pluginModule.default || pluginModule.plugin;

      if (!plugin || !plugin.id || !plugin.name) {
        log.warn(`⚠️  Invalid plugin: ${pluginConfig.id}`);
        return;
      }

      // Check backend dependencies
      if (plugin.backendDependencies && plugin.backendDependencies.length > 0) {
        const backendAvailable = await this.checkBackendDependencies(plugin.backendDependencies);

        if (!backendAvailable) {
          log.warn(
            `⚠️  Plugin ${plugin.id} requires backend plugins: ${plugin.backendDependencies.join(', ')}`
          );
          // Store plugin but don't enable it
          this.plugins.set(plugin.id, plugin);
          return;
        }
      }

      // Store plugin
      this.plugins.set(plugin.id, plugin);

      // Auto-enable if marked as enabled
      if (pluginConfig.enabled !== false) {
        this.enabledPlugins.add(plugin.id);
      }

      // Initialize plugin
      await plugin.initialize();

      this.emit('plugin-loaded', {
        pluginId: plugin.id,
        timestamp: new Date()
      });

      log.info(`✅ Loaded plugin: ${plugin.name} v${plugin.version}`);
    } catch (error) {
      log.error(`❌ Error loading plugin ${pluginConfig.id}:`, error);
    }
  }

  /**
   * Start all enabled plugins
   */
  async startPlugins(): Promise<void> {
    log.info('🚀 Starting frontend plugins...');

    for (const pluginId of this.enabledPlugins) {
      const plugin = this.plugins.get(pluginId);

      if (plugin) {
        try {
          // Plugin-specific startup logic if needed
          log.info(`▶️  Started plugin: ${plugin.name}`);
        } catch (error) {
          log.error(`❌ Error starting plugin ${pluginId}:`, error);
        }
      }
    }

    log.info(`✅ Started ${this.enabledPlugins.size} frontend plugins`);
  }

  /**
   * Enable a plugin
   */
  async enablePlugin(pluginId: string): Promise<void> {
    if (!this.plugins.has(pluginId)) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    this.enabledPlugins.add(pluginId);

    this.emit('plugin-enabled', {
      pluginId,
      timestamp: new Date()
    });

    log.info(`✅ Enabled plugin: ${pluginId}`);
  }

  /**
   * Disable a plugin
   */
  async disablePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);

    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    try {
      if (plugin.cleanup) {
        await plugin.cleanup();
      }

      this.enabledPlugins.delete(pluginId);

      this.emit('plugin-disabled', {
        pluginId,
        timestamp: new Date()
      });

      log.info(`⏸️  Disabled plugin: ${pluginId}`);
    } catch (error) {
      log.error(`❌ Error disabling plugin ${pluginId}:`, error);
    }
  }

  /**
   * Get all plugin routes
   */
  getPluginRoutes(): RouteObject[] {
    const routes: RouteObject[] = [];

    for (const pluginId of this.enabledPlugins) {
      const plugin = this.plugins.get(pluginId);

      if (plugin && plugin.routes) {
        for (const route of plugin.routes) {
          // Wrap route elements in Suspense for lazy loading
          if (route.element) {
            route.element = (
              <Suspense fallback={<div>Loading...</div>}>
                {route.element}
              </Suspense>
            );
          }
          routes.push(route);
        }
      }
    }

    return routes;
  }

  /**
   * Get all sidebar items
   */
  getSidebarItems(): SidebarItem[] {
    const items: SidebarItem[] = [];

    for (const pluginId of this.enabledPlugins) {
      const plugin = this.plugins.get(pluginId);

      if (plugin && plugin.sidebarItems) {
        items.push(...plugin.sidebarItems);
      }
    }

    // Sort by order
    return items.sort((a, b) => (a.order || 999) - (b.order || 999));
  }

  /**
   * Get all admin sections
   */
  getAdminSections(): AdminSection[] {
    const sections: AdminSection[] = [];

    for (const pluginId of this.enabledPlugins) {
      const plugin = this.plugins.get(pluginId);

      if (plugin && plugin.adminSections) {
        sections.push(...plugin.adminSections);
      }
    }

    // Sort by order
    return sections.sort((a, b) => (a.order || 999) - (b.order || 999));
  }

  /**
   * Get all player actions
   */
  getPlayerActions(): PlayerAction[] {
    const actions: PlayerAction[] = [];

    for (const pluginId of this.enabledPlugins) {
      const plugin = this.plugins.get(pluginId);

      if (plugin && plugin.playerActions) {
        actions.push(...plugin.playerActions);
      }
    }

    // Sort by order
    return actions.sort((a, b) => (a.order || 999) - (b.order || 999));
  }

  /**
   * Get context menu items for a specific type
   */
  getContextItems(type: string): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];

    for (const pluginId of this.enabledPlugins) {
      const plugin = this.plugins.get(pluginId);

      if (plugin && plugin.contextMenuItems) {
        const filteredItems = plugin.contextMenuItems.filter(item =>
          !item.showWhen || item.showWhen({ type } as any)
        );
        items.push(...filteredItems);
      }
    }

    // Sort by order
    return items.sort((a, b) => (a.order || 999) - (b.order || 999));
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
        hasRoutes: !!plugin.routes && plugin.routes.length > 0,
        hasSidebarItems: !!plugin.sidebarItems && plugin.sidebarItems.length > 0,
        hasAdminSections: !!plugin.adminSections && plugin.adminSections.length > 0,
        hasPlayerActions: !!plugin.playerActions && plugin.playerActions.length > 0,
        backendRequired: !!plugin.backendDependencies && plugin.backendDependencies.length > 0,
        backendAvailable: true // Would check actual backend status
      });
    }

    return metadata;
  }

  /**
   * Get plugin by ID
   */
  getPlugin(pluginId: string): FrontendPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Check if plugin is enabled
   */
  isEnabled(pluginId: string): boolean {
    return this.enabledPlugins.has(pluginId);
  }

  /**
   * Check if backend plugin is available
   */
  private async isBackendAvailable(pluginId: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/plugins/${pluginId}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Check backend dependencies
   */
  private async checkBackendDependencies(deps: string[]): Promise<boolean> {
    const results = await Promise.all(
      deps.map(dep => this.isBackendAvailable(dep))
    );

    return results.every(result => result);
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
          log.error(`Error in plugin event handler for ${event}:`, error);
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
    log.info('🛑 Shutting down frontend plugins...');

    for (const [pluginId, plugin] of this.plugins.entries()) {
      if (this.enabledPlugins.has(pluginId)) {
        await this.disablePlugin(pluginId);
      }

      if (plugin.cleanup) {
        try {
          await plugin.cleanup();
        } catch (error) {
          log.error(`Error cleaning up plugin ${pluginId}:`, error);
        }
      }
    }

    this.plugins.clear();
    this.enabledPlugins.clear();

    log.info('✅ All frontend plugins shut down');
  }
}

// Create singleton instance
let pluginManagerInstance: FrontendPluginManager | null = null;

export const getPluginManager = (apiClient?: any): FrontendPluginManager => {
  if (!pluginManagerInstance) {
    if (!apiClient) {
      throw new Error('Plugin manager requires API client on first initialization');
    }
    pluginManagerInstance = new FrontendPluginManager(apiClient);
  }
  return pluginManagerInstance;
};

export default FrontendPluginManager;
