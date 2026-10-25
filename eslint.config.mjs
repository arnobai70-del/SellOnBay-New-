import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts}'],
    // Strict React Compiler style rules. The existing animation and hydration code sets state in effects on purpose, so these warn until it is reworked.
    rules: { 'react-hooks/set-state-in-effect': 'warn', 'react-hooks/refs': 'warn', 'react-hooks/purity': 'warn' },
  },
  {
    // `({ secret: _s, ...rest }) => rest` drops a field on purpose; names starting with _ are meant to be unused.
    rules: { '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }] },
  },
  globalIgnores(['.next/**', '.next-legacy/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts', 'prototype/**', 'scripts/**', 'public/**', '**/*.cjs']),
]);
