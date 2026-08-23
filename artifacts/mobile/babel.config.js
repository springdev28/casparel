/**
 * @fileOverview Mobile support role: configures or implements Babel.Config for the Expo application.
 * System connection: supports native build/runtime behavior and communication with the same API used by web and desktop.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
  };
};
