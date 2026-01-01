module.exports = {
  webpack: {
    configure: (webpackConfig, { env, paths }) => {
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
