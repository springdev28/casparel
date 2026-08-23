/**
 * @fileOverview Mobile support role: configures or implements Metro.Config for the Expo application.
 * System connection: supports native build/runtime behavior and communication with the same API used by web and desktop.
 */
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
