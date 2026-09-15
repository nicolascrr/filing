// @ts-check
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default tseslint.config(
  // Global ignores
  {
    ignores: ['dist/**', 'node_modules/**', '.astro/**', '*.config.mjs', 'eslint.config.mjs'],
  },

  // Astro plugin: recommended + a11y rules (includes base JS rules)
  ...astro.configs.recommended,
  ...astro.configs['jsx-a11y-recommended'],

  // Register the @typescript-eslint plugin for all files so its rules resolve.
  {
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      'no-unused-vars': 'off', // handled by @typescript-eslint
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Apply TypeScript parser to .ts files
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
  },

  // Apply TypeScript parser to .astro frontmatter
  {
    files: ['**/*.astro'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 2022,
        sourceType: 'module',
        extraFileExtensions: ['.astro'],
      },
    },
  },

  // Avoid conflicts with Prettier formatting
  {
    rules: {
      'astro/semi': 'off',
    },
  },
);
