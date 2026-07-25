import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // `src/components/ui/` est VENDORISÉ : ces fichiers viennent de la CLI shadcn et sont
    // réécrits à chaque `shadcn add`. Plusieurs exportent une variante CVA à côté de leur
    // composant (`buttonVariants`, `badgeVariants`), ce que la règle de rafraîchissement
    // rapide interdit. Les corriger serait perdu à la prochaine mise à jour.
    files: ['src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
