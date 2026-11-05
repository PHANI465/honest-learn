// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      // React Native <Text> renders quotes and apostrophes literally; this rule only matters for HTML.
      'react/no-unescaped-entities': 'off',
    },
  },
]);
