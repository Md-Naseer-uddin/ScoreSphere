import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Shared packages run in both the browser and Node (plan §3.2), so they may not
// touch platform APIs, persistence clients, UI frameworks or the apps.
const PLATFORM_IMPORTS = {
  group: [
    'node:*',
    'fs',
    'path',
    'os',
    'crypto',
    'pg',
    'drizzle-orm',
    'drizzle-orm/*',
    'dexie',
    'react',
    'react-dom',
    '@nestjs/*',
    '@scoresphere/api',
    '@scoresphere/client',
  ],
  message: 'Shared packages must stay platform-neutral (plan §3.2).',
};

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      '**/dev-dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'apps/client/android/**',
      'apps/api/drizzle/**',
      'docs/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}', 'apps/api/**/*.ts', '**/*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      // Nest resolves constructor injection from emitted decorator metadata,
      // which needs value imports for injected classes.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    files: ['apps/client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['packages/{contracts,engine-kit,sports}/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [PLATFORM_IMPORTS] }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'process', 'Buffer'],
    },
  },
  {
    files: ['packages/contracts/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            PLATFORM_IMPORTS,
            {
              group: ['@scoresphere/engine-kit', '@scoresphere/sports'],
              message: 'contracts is the bottom layer.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/engine-kit/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            PLATFORM_IMPORTS,
            { group: ['@scoresphere/sports'], message: 'engine-kit must not depend on sports.' },
          ],
        },
      ],
    },
  },
  prettier,
);
