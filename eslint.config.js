// Flat ESLint config. eslint-config-expo bundles the React, React Hooks
// (rules-of-hooks: error, exhaustive-deps: warn), and TypeScript rules for
// an Expo app. The web/ Next subproject and native folders are ignored here.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...(Array.isArray(expoConfig) ? expoConfig : [expoConfig]),
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'web/**',
      'ios/**',
      'android/**',
      'scripts/**',
    ],
  },
  {
    rules: {
      // Apostrophes in display copy ("didn't") are harmless in React Native
      // text — this HTML-oriented rule is pure noise here.
      'react/no-unescaped-entities': 'off',

      // Keep the classic, high-value hook rules enforced (this is what the
      // audit asked for):
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // The React-Compiler-era rules bundled with react-hooks v6 fire on
      // idiomatic RN patterns (reading Animated.Value refs during render,
      // setState inside async effect callbacks). Adopting them means a large,
      // risky rewrite that's out of scope here — deferred, not enforced.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
    },
  },
];
