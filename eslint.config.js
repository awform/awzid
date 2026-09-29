import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Règle de contenu (cahier des charges §3.1) : AUCUNE normalisation Unicode du texte arabe,
 * nulle part dans le code. Tout appel à `.normalize(` est refusé.
 */
const noUnicodeNormalize = {
  selector: "CallExpression[callee.property.name='normalize']",
  message:
    'Interdit : aucune normalisation Unicode (NFC/NFD/NFKC) du contenu — le texte coranique doit rester octet pour octet (CDC §3.1).',
};

export default ts.config(
  {
    ignores: [
      '**/node_modules/',
      'infra/ci/contenu/',
      'infra/ci/contenu-synthetique/',
      'apps/android/android/',
      '**/dist/',
      '**/build/',
      '**/.svelte-kit/',
      '**/coverage/',
      '**/test-results/',
      '**/playwright-report/',
      'packages/db/migrations/',
      'apps/web/static/',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'no-restricted-syntax': ['error', noUnicodeNormalize],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: { parser: ts.parser, extraFileExtensions: ['.svelte'] },
    },
  },
);
