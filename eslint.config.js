import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// Flat config (ESLint 10). TypeScript handles undefined-symbol checking, so
// core `no-undef` is disabled for TS/TSX to avoid false positives on ambient
// globals like `chrome` (typed via @types/chrome).
export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-undef': 'off',
    },
  },
)
