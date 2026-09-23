import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const RESTRICTED_BSV_CONTRACT_IMPORTS = [
  { name: 'scrypt-ts', message: 'scrypt-ts may only be imported by files under src/bsv/contracts/.' },
  { name: 'scrypt-ord', message: 'scrypt-ord may only be imported by files under src/bsv/contracts/.' },
  { name: 'bsv', message: 'bsv may only be imported by files under src/bsv/contracts/.' },
]

export default defineConfig([
  globalIgnores(['dist', 'src/bsv/contracts/prototype']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'no-restricted-imports': ['error', { paths: RESTRICTED_BSV_CONTRACT_IMPORTS }],
    },
  },
  {
    // scrypt-ts contract sources: the SmartContract base constructor idiom is
    // `super(...arguments)` (see prototype/, license.ts), and `@prop()`-only fields
    // legitimately import types (e.g. ByteString) used only as type annotations.
    files: ['src/bsv/contracts/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      'prefer-rest-params': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    // The License contract test's fixture drives the contract through scrypt-ts (mw-5wuz6.2).
    files: ['tests/fixtures/bsv/license-contract.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
])
