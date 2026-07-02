interface Config {
  BASE_URL: string;
  API_BASE_URL: string;
  WEBSOCKET_URL: string;
}

let config: Config | null = null;
let configPromise: Promise<Config> | null = null;

export const loadConfig = async (): Promise<Config> => {
  if (config) {
    return config;
  }

  // Dedupe concurrent callers (e.g. index.tsx and authStore.ts both call this
  // on startup) so they share a single in-flight fetch instead of racing.
  if (configPromise) {
    return configPromise;
  }

  configPromise = loadConfigInternal();
  return configPromise;
};

const loadConfigInternal = async (): Promise<Config> => {
  try {
    const isLocalDevelopment = window.location.hostname === 'localhost' && window.location.port === '3000';
    
    // Try to load development config first if in local development
    if (isLocalDevelopment) {
      try {
        const devResponse = await fetch('/config.dev.json');
        const devJsonConfig = await devResponse.json() as any;
        config = {
          BASE_URL: devJsonConfig.BASE_URL || 'http://localhost:3000',
          API_BASE_URL: devJsonConfig.API_BASE_URL || 'http://localhost:3001/api',
          WEBSOCKET_URL: devJsonConfig.WEBSOCKET_URL || 'ws://localhost:3001'
        };
        console.log('Development config loaded');
        return config!;
      } catch (devError) {
        console.warn('Failed to load config.dev.json, falling back to config.json');
      }
    }
    
    // Load production config
    const response = await fetch('/config.json');
    const jsonConfig = await response.json() as any;
    config = {
      BASE_URL: jsonConfig.BASE_URL || 'https://musable.breadjs.nl',
      API_BASE_URL: jsonConfig.API_BASE_URL || 'https://musable.breadjs.nl/api',
      WEBSOCKET_URL: jsonConfig.WEBSOCKET_URL || 'wss://musable.breadjs.nl'
    };
    return config;
  } catch (error) {
    console.warn('Failed to load config.json, using fallback config');
    
    // Fallback configuration 
    const isLocalDevelopment = window.location.hostname === 'localhost' && window.location.port === '3000';
    
    const wsOrigin = window.location.origin.replace(/^http/, 'ws');
    config = {
      BASE_URL: window.location.origin,
      API_BASE_URL: isLocalDevelopment ? '/api' : `${window.location.origin}/api`,
      WEBSOCKET_URL: isLocalDevelopment ? 'ws://localhost:3001' : wsOrigin
    };
    
    return config;
  }
};

export const getConfig = (): Config => {
  if (!config) {
    throw new Error('Config not loaded. Call loadConfig() first.');
  }
  return config;
};

export const getBaseUrl = (): string => {
  return getConfig().BASE_URL;
};

export const getApiBaseUrl = (): string => {
  return getConfig().API_BASE_URL;
};

export const getWebSocketUrl = (): string => {
  return getConfig().WEBSOCKET_URL;
};