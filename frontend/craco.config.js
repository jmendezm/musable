const webpack = require('webpack');
// Remove this line:
// const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const path = require('path');

module.exports = {
  webpack: {
    configure: (webpackConfig, { env, paths }) => {
      // Load environment variables from root .env file
      const dotenv = require('dotenv');
      const envPath = path.resolve(__dirname, '../.env');
      dotenv.config({ path: envPath });

      // Define REACT_APP_ variables in webpack
      const reactAppVars = Object.keys(process.env)
        .filter(key => key.startsWith('REACT_APP_'))
        .reduce((acc, key) => {
          acc[`process.env.${key}`] = JSON.stringify(process.env[key]);
          return acc;
        }, {});

      webpackConfig.plugins.push(
        new webpack.DefinePlugin(reactAppVars)
      );

      // Remove the React Refresh plugin code - CRA handles this automatically

      return webpackConfig;
    },
  },
  devServer: (devServerConfig, { env, paths, proxy, allowedHost }) => {
    devServerConfig.port = 3000;
    devServerConfig.host = '0.0.0.0';

    delete devServerConfig.onBeforeSetupMiddleware;
    delete devServerConfig.onAfterSetupMiddleware;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      if (!devServer) {
        throw new Error('devServer is not defined');
      }
      return middlewares;
    };

    return devServerConfig;
  },
};