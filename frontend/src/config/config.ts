interface Config {
  BASE_URL: string;
  API_BASE_URL: string;
  WEBSOCKET_URL: string;
}

let config: Config | null = null;

export const loadConfig = async (): Promise<Config> => {
  if (config) {
    return config;
  }

  // Load config from config.json
  const response = await fetch('/config.json');
  const jsonConfig = await response.json();

  config = {
    BASE_URL: jsonConfig.BASE_URL,
    API_BASE_URL: jsonConfig.API_BASE_URL,
    WEBSOCKET_URL: jsonConfig.WEBSOCKET_URL
  };

  console.log('✅ Config loaded:', config);
  return config;
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