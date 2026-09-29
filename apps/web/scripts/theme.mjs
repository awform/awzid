// Régénère src/lib/theme/tokens.css depuis src/lib/theme/tokens.ts (Node 24 lit le TypeScript directement).
import { writeFileSync } from 'node:fs';
import { renderCss } from '../src/lib/theme/tokens.ts';

writeFileSync(new URL('../src/lib/theme/tokens.css', import.meta.url), renderCss());
console.log('thème : src/lib/theme/tokens.css régénéré');
