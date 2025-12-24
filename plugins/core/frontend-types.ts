import { ComponentType } from 'react';
import { RouteObject } from 'react-router-dom';

/**
 * Frontend plugin interface
 */
export interface FrontendPlugin {
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

  /** Required backend plugins */
  backendDependencies?: string[];

  /**
   * Initialize the plugin
   * Called when plugin is loaded
   */
  initialize(): Promise<void> | void;

  /**
   * Plugin routes (optional)
   * Add new pages to the app
   */
  routes?: RouteObject[];

  /**
   * Sidebar extension (optional)
   * Add items to the sidebar navigation
   */
  sidebarItems?: SidebarItem[];

  /**
   * Admin panel sections (optional)
   * Add tabs/sections to the admin panel
   */
  adminSections?: AdminSection[];

  /**
   * Player extensions (optional)
   * Add buttons/actions to the player
   */
  playerActions?: PlayerAction[];

  /**
   * Context menu items (optional)
   * Add items to the context menu
   */
  contextMenuItems?: ContextMenuItem[];

  /**
   * Component overrides (optional)
   * Override or extend existing components
   */
  componentOverrides?: ComponentOverride[];

  /**
   * Zustand stores (optional)
   * Add custom state management
   */
  stores?: PluginStore[];

  /**
   * Plugin settings component (optional)
   * Rendered in settings page
   */
  settingsComponent?: ComponentType;

  /**
   * Cleanup function
   * Called when plugin is unloaded
   */
  cleanup?(): Promise<void> | void;
}

/**
 * Sidebar navigation item
 */
export interface SidebarItem {
  /** Unique identifier */
  id: string;

  /** Display label */
  label: string;

  /** Icon component */
  icon: ComponentType<{ className?: string }>;

  /** Route path */
  path: string;

  /** Required permission (optional) */
  permission?: 'user' | 'admin';

  /** Section in sidebar (library, playlists, rooms, etc.) */
  section?: 'library' | 'playlists' | 'rooms' | 'plugins' | 'other';

  /** Order in section (lower = higher) */
  order?: number;
}

/**
 * Admin panel section
 */
export interface AdminSection {
  /** Unique identifier */
  id: string;

  /** Tab label */
  label: string;

  /** Icon component */
  icon: ComponentType<{ className?: string }>;

  /** Section component */
  component: ComponentType;

  /** Route path for the section */
  path: string;

  /** Order in tabs */
  order?: number;
}

/**
 * Player action button
 */
export interface PlayerAction {
  /** Unique identifier */
  id: string;

  /** Button label */
  label: string;

  /** Icon component */
  icon: ComponentType<{ className?: string }>;

  /** Action handler */
  action: (context: PlayerContext) => void | Promise<void>;

  /** When to show this action */
  showWhen?: (context: PlayerContext) => boolean;

  /** Button position */
  position?: 'primary' | 'secondary' | 'menu';

  /** Tooltip text */
  tooltip?: string;

  /** Order in the action list */
  order?: number;
}

/**
 * Player context provided to actions
 */
export interface PlayerContext {
  currentSong: any;
  isPlaying: boolean;
  playlist: any[];
  currentIndex: number;
}

/**
 * Context menu item
 */
export interface ContextMenuItem {
  /** Unique identifier */
  id: string;

  /** Menu label */
  label: string;

  /** Icon component */
  icon?: ComponentType<{ className?: string }>;

  /** Action handler */
  action: (context: MenuContext) => void | Promise<void>;

  /** When to show this item */
  showWhen?: (context: MenuContext) => boolean;

  /** Divider before this item */
  divider?: boolean;

  /** Order in the menu */
  order?: number;
}

/**
 * Context menu context
 */
export interface MenuContext {
  type: 'song' | 'album' | 'artist' | 'playlist';
  item: any;
  position: { x: number; y: number };
}

/**
 * Component override
 */
export interface ComponentOverride {
  /** Component to override */
  target: string;

  /** Override type */
  type: 'replace' | 'wrap' | 'extend';

  /** New component (for replace) */
  component?: ComponentType;

  /** Wrapper component (for wrap) */
  wrapper?: ComponentType<{ children: any }>;

  /** Additional props to pass */
  props?: Record<string, any>;
}

/**
 * Plugin Zustand store
 */
export interface PluginStore {
  /** Store name */
  name: string;

  /** Store creator function */
  creator: () => any;

  /** Initial state */
  initialState?: any;
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
  hasSidebarItems: boolean;
  hasAdminSections: boolean;
  hasPlayerActions: boolean;
  backendRequired: boolean;
  backendAvailable: boolean;
}

/**
 * Plugin manager events
 */
export type PluginEvent =
  | 'plugin-loaded'
  | 'plugin-enabled'
  | 'plugin-disabled'
  | 'plugin-error';

/**
 * Plugin context - provides access to core features
 */
export interface PluginContext {
  /** API client */
  api: any;

  /** Emit events to other plugins */
  emit: (event: string, data: any) => void;

  /** Listen to events from other plugins */
  on: (event: string, handler: (data: any) => void) => void;

  /** Get another plugin */
  getPlugin: (pluginId: string) => FrontendPlugin | undefined;

  /** Check if backend plugin is available */
  isBackendAvailable: (pluginId: string) => Promise<boolean>;
}
