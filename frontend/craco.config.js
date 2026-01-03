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

      // Remove React Refresh in production to avoid build errors
      if (env === 'production') {
        webpackConfig = removeReactRefresh(webpackConfig);
      }

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

// Helper function to remove React Refresh plugins
function removeReactRefresh(webpackConfig) {
  // Remove ReactRefreshWebpackPlugin
  if (webpackConfig.plugins) {
    webpackConfig.plugins = webpackConfig.plugins.filter(
      plugin => plugin.constructor.name !== 'ReactRefreshWebpackPlugin'
    );
  }

  // Remove React Refresh from babel loader options
  const babelLoader = webpackConfig.module.rules.find(
    rule =>
      rule.oneOf &&
      rule.oneOf.find(oneOf =>
        oneOf.loader && oneOf.loader.includes('babel-loader')
      )
  );

  if (babelLoader && babelLoader.oneOf) {
    babelLoader.oneOf.forEach(rule => {
      if (rule.use && rule.use.options && rule.use.options.plugins) {
        rule.use.options.plugins = rule.use.options.plugins.filter(
          plugin =>
            !(
              Array.isArray(plugin) &&
              plugin[0].includes('react-refresh')
            )
        );
      }
    });
  }

  return webpackConfig;
}
