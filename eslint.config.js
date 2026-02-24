import js from '@eslint/js'
import globals from 'globals'

const browserGlobals = Object.fromEntries(
  Object.entries(globals.browser).map(([key, value]) => [key.trim(), value])
)
const nodeGlobals = Object.fromEntries(
  Object.entries(globals.node).map(([key, value]) => [key.trim(), value])
)

export default [
  { ignores: ['node_modules', 'dist', 'venv'] },
  {
    files: ['renderer/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: browserGlobals,
      sourceType: 'module'
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ]
    }
  },
  {
    files: ['electron/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: nodeGlobals,
      sourceType: 'script'
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ]
    }
  }
]
