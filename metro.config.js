const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = (async () => {
  const defaultConfig = await getDefaultConfig(__dirname);
  return mergeConfig(defaultConfig, {
    transformer: {
      getTransformOptions: async () => ({
        transform: {
          experimentalImportSupport: false,
          inlineRequires: true,
        },
      }),
    },
    resolver: {
      assetExts: [...defaultConfig.resolver.assetExts, 'svg', 'ttf', 'otf', 'woff', 'woff2'],
      extraNodeModules: {
        'react-native/asset-registry': path.resolve(
          __dirname,
          'node_modules/@react-native/assets-registry'
        ),
      },
    },
  });
})();

module.exports = config;