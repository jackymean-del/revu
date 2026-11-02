import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import institutionWords from './eslint-rules/institution-words.js'

/**
 * Lint for bugs, not style. Type-checking is tsc's job (npm run typecheck),
 * so the type-aware presets are not enabled, to avoid duplicate reports.
 * CI runs `eslint src --max-warnings 0`.
 */
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src/**/*.gen.ts'] },
  {
    files: ['**/*.{ts,tsx,mts}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    // AT-v1-04: institution words in components come from t().
    files: ['src/**/*.tsx'],
    plugins: { revu: { rules: { 'institution-words': institutionWords } } },
    rules: { 'revu/institution-words': 'error' },
  },
  {
    // Verification harnesses run under tsx, outside the app build.
    files: ['*.mts'],
    languageOptions: { globals: globals.node },
  },
)
