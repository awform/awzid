import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Règle de contenu (cahier des charges §3.1) : AUCUNE normalisation Unicode du texte arabe, nulle part dans le
 * code. Toute forme est refusée (audit QUA-1) : appel direct, propriété calculée ou littérale, accès par le
 * prototype, et tout appel qui reçoit une forme de normalisation (« NFC », « NFKD »…).
 */
const NORMALIZE_MESSAGE =
  'Interdit : aucune normalisation Unicode (NFC/NFD/NFKC) du contenu — le texte coranique doit rester octet pour octet (CDC §3.1).';
const noUnicodeNormalize = [
  "MemberExpression[property.name='normalize']",
  "MemberExpression[property.value='normalize']",
  'CallExpression > Literal[value=/^NFK?[CD]$/]',
].map((selector) => ({ selector, message: NORMALIZE_MESSAGE }));

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
      'no-restricted-syntax': ['error', ...noUnicodeNormalize],
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
