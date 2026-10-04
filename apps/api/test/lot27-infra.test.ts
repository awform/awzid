/**
 * Lot 27 — exploitation de l'audio du Coran : l'API lit le stockage audio en lecture seule ; l'outil
 * d'import (service « outils ») l'écrit, avec ffmpeg, et lit les fichiers reçus en lecture seule.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PROD = join(import.meta.dirname, '..', '..', '..', 'infra', 'prod');
const compose = readFileSync(join(PROD, 'compose.yml'), 'utf8');
const dockerfile = readFileSync(join(PROD, 'Dockerfile'), 'utf8');
const service = (name: string) => {
  const m = new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z-]+:\\n|\\nvolumes:)`).exec(
    compose,
  );
  return m?.[1] ?? '';
};

describe('audio du Coran : déploiement', () => {
  it('API : AWFORM_AUDIO_DIR et volume « audio » en lecture seule', () => {
    const api = service('api');
    expect(api).toContain('AWFORM_AUDIO_DIR: /audio');
    expect(api).toContain("'audio:/audio:ro'");
    expect(compose).toMatch(/\nvolumes:[\s\S]*\n {2}audio:\n/);
  });
  it('outil d’import : profil « outils », compte propriétaire, source en lecture seule, ffmpeg', () => {
    const s = service('coran-audio');
    expect(s).toContain('profiles: [outils]');
    expect(s).toContain('outils.env');
    expect(s).toContain("'audio:/audio'");
    expect(s).toMatch(/:\/source:ro'/);
    expect(s).toContain('dist/cli/coran-audio.js');
    expect(s).toContain('target: outils-audio');
    expect(dockerfile).toMatch(
      /FROM api AS outils-audio[\s\S]*install -y --no-install-recommends ffmpeg/,
    );
    // l'image de l'API servie n'embarque pas ffmpeg
    const api = /FROM runtime AS api\n([\s\S]*?)\nFROM /.exec(dockerfile)?.[1] ?? '';
    const code = api
      .split('\n')
      .filter((l) => !l.trim().startsWith('#'))
      .join('\n');
    expect(code).toContain('CMD ["node", "dist/server.js"]');
    expect(code).not.toContain('ffmpeg');
  });
});
