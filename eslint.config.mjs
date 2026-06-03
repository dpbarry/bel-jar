import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    // Never lint the bundled editor output
    ignores: ['js/editor-cm.bundle.js'],
  },
  {
    files: ['js/beluga-worker.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.worker },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-undef': 'error',
    },
  },
  {
    files: ['js/*.js'],
    ignores: ['js/beluga-worker.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // BelJar module globals (each file declares these via window.Xxx = ...)
        BelugaText: 'readonly',
        BelJarPersist: 'readonly',
        BelJarEditor: 'readonly',
        BelJarDialog: 'readonly',
        BelJarWorkspaceSplit: 'readonly',
        BelJarReplOutput: 'readonly',
        BelJarBelugaRun: 'readonly',
        BelJarReplCommands: 'readonly',
        BelJarSettingsUI: 'readonly',
        BelJarCurrentEditor: 'readonly',
        LiveIntel: 'readonly',
        BelugaClient: 'readonly',
        RunProgress: 'readonly',
        FloatingRectPlacement: 'readonly',
        Menu: 'readonly',
        Tooltips: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-undef': 'error',
    },
  },
  {
    files: ['editor-src/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-undef': 'error',
    },
  },
];
