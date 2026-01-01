const webpack = require('webpack');
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

      return webpackConfig;
    },
  },
  devServer: (devServerConfig, { env, paths, proxy, allowedHost }) => {
    // Explicitly set port to 3000 to avoid conflicts with backend
    devServerConfig.port = 3000;
    devServerConfig.host = '0.0.0.0';

    // Remove deprecated middleware options
    delete devServerConfig.onBeforeSetupMiddleware;
    delete devServerConfig.onAfterSetupMiddleware;

    // Use the new setupMiddlewares option (it should be a function)
    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      if (!devServer) {
        throw new Error('devServer is not defined');
      }
      // Return middlewares without modifications
      return middlewares;
    };

    return devServerConfig;
  },
};
