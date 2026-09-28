import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Dossier du contenu copié depuis le PC (hors dépôt). */
export const CONTENT_DIR = process.env.AWFORM_CONTENT_DIR ?? join(homedir(), 'awform-content');
export const HAS_CONTENT = existsSync(join(CONTENT_DIR, 'data', 'index-lecons.js'));
