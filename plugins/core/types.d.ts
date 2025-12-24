import { Router } from 'express';
import { Server } from 'socket.io';
/**
 * Plugin interface - All musable plugins must implement this
 */
export interface Plugin {
    /** Unique plugin identifier */
    id: string;
    /** Human-readable plugin name */
    name: string;
    /** Plugin version */
    version: string;
    /** Plugin description */
    description: string;
    /** Plugin author */
    author?: string;
    /** Plugin dependencies (other plugins required) */
    dependencies?: string[];
    /**
     * Initialize the plugin
     * Called when plugin is loaded
     */
    initialize(): Promise<void> | void;
    /**
     * Start the plugin
     * Called after all plugins are initialized
     */
    start?(): Promise<void> | void;
    /**
     * Stop the plugin
     * Called during shutdown
     */
    stop?(): Promise<void> | void;
    /**
     * Get plugin routes (if any)
     * Returns Express router with plugin-specific endpoints
     */
    getRoutes?(): Router;
    /**
     * Get WebSocket handlers (if any)
     * Called with Socket.IO server for real-time features
     */
    setupWebSocket?(io: Server): void;
    /**
     * Get plugin configuration schema
     * Returns JSON schema for plugin configuration
     */
    getConfigSchema?(): object;
    /**
     * Validate plugin configuration
     * Returns true if config is valid
     */
    validateConfig?(config: any): boolean;
    /**
     * Health check
     * Returns plugin health status
     */
    healthCheck?(): Promise<PluginHealth>;
    /**
     * Plugin cleanup
     * Called when plugin is unloaded
     */
    cleanup?(): Promise<void> | void;
}
/**
 * Plugin health status
 */
export interface PluginHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    message?: string;
    metadata?: Record<string, any>;
}
/**
 * Plugin metadata
 */
export interface PluginMetadata {
    id: string;
    name: string;
    version: string;
    description: string;
    author?: string;
    enabled: boolean;
    hasRoutes: boolean;
    hasWebSocket: boolean;
    config?: any;
}
/**
 * Plugin manager events
 */
export type PluginEvent = 'plugin-loaded' | 'plugin-enabled' | 'plugin-disabled' | 'plugin-error' | 'plugin-unloaded';
export interface PluginEventData {
    pluginId: string;
    error?: Error;
    timestamp: Date;
}
/**
 * Plugin context - Provides access to core musable features
 */
export interface PluginContext {
    /** Database models */
    models: {
        Song: any;
        Artist: any;
        Album: any;
        User: any;
        Playlist: any;
    };
    /** Logger */
    logger: any;
    /** Configuration */
    config: any;
    /** Emit events to other plugins */
    emit(event: string, data: any): void;
    /** Listen to events from other plugins */
    on(event: string, handler: (data: any) => void): void;
}
//# sourceMappingURL=types.d.ts.map