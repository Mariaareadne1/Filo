// Flat ESLint config for the Next.js 16 business dashboard. eslint-config-next
// bundles the React, React Hooks (rules-of-hooks / exhaustive-deps), jsx-a11y,
// and Core Web Vitals rule sets — the safety net the react-reviewer flagged as
// missing for web/.
import next from 'eslint-config-next';

const config = [
  ...next,
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
  {
    rules: {
      // Apostrophes/quotes in display copy ("didn't", "…") are harmless in JSX
      // text — this HTML-oriented rule is pure noise. (Matches the RN config.)
      'react/no-unescaped-entities': 'off',
    },
  },
];

export default config;
