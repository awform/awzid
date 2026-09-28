import { homedir } from 'node:os';
import { join } from 'node:path';

/** Charge le .env de la racine du dépôt s'il existe (valeurs de développement, jamais versionnées). */
export function loadRootEnv(): void {
  try {
    process.loadEnvFile(new URL('../../../.env', import.meta.url));
  } catch {
    /* pas de .env */
  }
}

export function contentDir(): string {
  return process.env.AWFORM_CONTENT_DIR ?? join(homedir(), 'awform-content');
}
