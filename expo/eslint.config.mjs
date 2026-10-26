import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';

// The Expo flat config sets import/parsers to the package name. With npm's
// isolated dependency layout eslint-plugin-import cannot resolve that parser
// from its own module path; it can use the active flat-config parser instead.
const expoConfigWithResolvableParser = expoConfig.map((config) => {
  const settings = config.settings;
  if (!settings?.['import/parsers']) return config;
  const { 'import/parsers': _parserPaths, ...remainingImportSettings } = settings;
  return { ...config, settings: remainingImportSettings };
});

export default defineConfig([
  ...expoConfigWithResolvableParser,
  {
    ignores: [
      '**/node_modules/**',
      '.expo/**',
      '.qa-*/**',
      'android/**',
      'ios/**',
      'coverage/**',
    ],
  },
  {
    rules: {
      // Existing state synchronization patterns are intentionally shared with web.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
    },
  },
]);
