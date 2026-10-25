// Lint rules for the app and the test suite. CI fails if any rule here is broken.
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    // The React store
    files: ['src/**/*.{js,jsx}'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
  {
    // The Node server is CommonJS
    files: ['server/**/*.js', 'api/**/*.js', 'api-tests/**/*.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['tests/**/*.ts', 'tests-smoke/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      // Every test must contain at least one assertion
      'playwright/expect-expect': ['error', { assertFunctionNames: ['openCart', 'add', 'open', 'openStable', 'expectNoA11yViolations'] }],
      // No forgotten .only or skipped tests
      'playwright/no-focused-test': 'error',
      'playwright/no-skipped-test': 'error',
      // Every expect must be awaited and must have a matcher
      'playwright/missing-playwright-await': 'error',
      'playwright/valid-expect': 'error',
      // Prefer web-first assertions that retry, over one-off checks
      'playwright/prefer-web-first-assertions': 'error',
      // No hard-coded sleeps
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-conditional-in-test': 'off',
      'playwright/no-conditional-expect': 'error',
      'playwright/no-useless-not': 'error',
      'playwright/prefer-to-have-count': 'error',
      'playwright/prefer-to-have-length': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
