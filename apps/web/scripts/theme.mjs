// Régénère src/lib/theme/tokens.css depuis src/lib/theme/tokens.ts et signes.css depuis signes.ts (Node 24 lit le TypeScript directement).
import { writeFileSync } from 'node:fs';
import { renderCss } from '../src/lib/theme/tokens.ts';
import { renderSignesCss } from '../src/lib/theme/signes.ts';

writeFileSync(new URL('../src/lib/theme/tokens.css', import.meta.url), renderCss());
writeFileSync(new URL('../src/lib/theme/signes.css', import.meta.url), renderSignesCss());
console.log('thème : src/lib/theme/tokens.css et signes.css régénérés');
