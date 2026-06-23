const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('adb', 'wasm');

module.exports = config;
