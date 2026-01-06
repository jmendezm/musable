interface Config {
  BASE_URL: string;
  API_BASE_URL: string;
  WEBSOCKET_URL: string;
  BACKEND_URL: string;
}

const config: Config = {
  BASE_URL: process.env.REACT_APP_BASE_URL || 'http://127.0.0.1:3000',
  API_BASE_URL: process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:3001/api',
  WEBSOCKET_URL: process.env.REACT_APP_WEBSOCKET_URL || 'ws://127.0.0.1:3001',
  BACKEND_URL: process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:3001'
};

export const getConfig = (): Config => {
  return config;
};

export const getBaseUrl = (): string => {
  return config.BASE_URL;
};

export const getApiBaseUrl = (): string => {
  return config.API_BASE_URL;
};

export const getWebSocketUrl = (): string => {
  return config.WEBSOCKET_URL;
};

export const getBackendUrl = (): string => {
  return config.BACKEND_URL;
};