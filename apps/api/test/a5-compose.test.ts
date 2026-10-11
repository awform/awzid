/**
 * A5 — le service d'écoute ne peut PAS garder la voix : conteneur en lecture seule, /tmp en mémoire, aucun port
 * publié, aucun secret, modèle en lecture seule, profil « ecoute » (jamais démarré sans le vouloir).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..', '..');

describe('A5 : service d’écoute (compose.yml, image)', () => {
  const y = readFileSync(join(ROOT, 'infra', 'prod', 'compose.yml'), 'utf8');
  const debut = y.indexOf('\n  ecoute:\n');
  const bloc = y.slice(debut + 1, y.indexOf('\n  ', y.indexOf('logging:', debut)) + 1);

  it('lecture seule, /tmp en mémoire, aucun port, aucun secret, modèle en lecture seule', () => {
    expect(debut).toBeGreaterThan(0);
    expect(bloc).toMatch(/read_only: true/);
    expect(bloc).toMatch(/tmpfs: \['\/tmp:/);
    expect(bloc).not.toMatch(/ports:|env_file|volumes:.*:rw/);
    expect(bloc).toMatch(/:\/model:ro'/);
    expect(bloc).toMatch(/profiles: \[ecoute\]/);
  });

  it('image : utilisateur sans droits, journal d’accès coupé, modèle hors de l’image', () => {
    const d = readFileSync(join(ROOT, 'services', 'ecoute-ia', 'Dockerfile'), 'utf8');
    expect(d).toMatch(/^USER ecoute$/m);
    expect(d).toContain('--no-access-log');
    expect(d).not.toMatch(/COPY .*\.nemo/);
  });
});
