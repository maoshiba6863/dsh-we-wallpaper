import js from '@eslint/js';

const NODE_GLOBALS = {
  process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly',
  URLSearchParams: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  setImmediate: 'readonly', clearImmediate: 'readonly', queueMicrotask: 'readonly',
  structuredClone: 'readonly', performance: 'readonly', fetch: 'readonly',
  AbortController: 'readonly', AbortSignal: 'readonly', global: 'readonly', globalThis: 'readonly',
  __dirname: 'readonly', __filename: 'readonly', require: 'readonly', module: 'writable',

  WebSocket: 'readonly', Blob: 'readonly',
};

const BROWSER_GLOBALS = {
  window: 'readonly', document: 'readonly', location: 'readonly', navigator: 'readonly',
  Image: 'readonly', HTMLCanvasElement: 'readonly', MutationObserver: 'readonly',
  requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
};

const JUSTIFIED_OFF = {

  'no-useless-escape': 'off',

  'no-empty': 'off',

  'no-control-regex': 'off',
};

export default [
  {

    ignores: ['lib/client.js', 'node_modules/**', '.npm-cache/**', '.test-cache/**', 'assets/**', 'lib/types/**'],
  },

  {
    files: ['lib/**/*.js', 'scripts/**/*.mjs', 'test/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: NODE_GLOBALS,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...JUSTIFIED_OFF,

      'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-unused-private-class-members': 'error',
      'no-constant-binary-expression': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-promise-executor-return': 'error',
      'require-atomic-updates': 'warn',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-return-assign': 'error',
      'no-sequences': 'error',
      'no-throw-literal': 'error',
      'no-unused-expressions': 'error',
      'no-void': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
      'no-console': 'off',
    },
  },

  {
    files: ['lib/webwallgl/**/*.js', 'lib/we-focus-guard.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...NODE_GLOBALS, ...BROWSER_GLOBALS },
    },
    rules: {

      'no-var': 'off',
    },
  },

  {
    files: ['test/**/*.mjs'],
    rules: {
      'no-new-func': 'off', 'no-eval': 'off', 'no-implied-eval': 'off', 'no-script-url': 'off',

      'no-template-curly-in-string': 'off',
    },
  },

  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,

      sourceType: 'module',
    },
    rules: {
      ...js.configs.recommended.rules,
      ...JUSTIFIED_OFF,

      'no-undef': 'off',
      'no-unused-vars': 'off',

      'no-redeclare': 'error',

      'no-var': 'off',
      'prefer-const': 'off',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-console': 'off',

    },
  },

  {
    files: ['src/client.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs' },
  },

  {

    rules: { 'no-irregular-whitespace': ['error', { skipComments: true }] },
  },
  {

    files: ['src/styles.js', 'src/styles-*.js'],
    rules: { 'no-irregular-whitespace': 'off' },
  },
  {

    files: ['src/panel-tabs.js'],
    rules: { 'no-empty-pattern': 'off' },
  },
];
