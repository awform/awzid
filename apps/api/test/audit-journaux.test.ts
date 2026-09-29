/**
 * Audit MIN-13 : les journaux de l'API ne gardent ni chaîne de requête, ni identifiant d'élève ou de compte,
 * ni adresse IP complète.
 */
import { describe, expect, it } from 'vitest';
import { logSafeUrl, logSerializers, truncIp } from '../src/app.js';

describe('audit MIN-13 — journaux minimisés', () => {
  it('URL sans paramètres ni identifiants, adresse tronquée', () => {
    expect(
      logSafeUrl('/api/v1/tutor/01a0edce-919e-742a-9b13-015ebd88198c/journal?email=x@y.z'),
    ).toBe('/api/v1/tutor/:id/journal');
    expect(truncIp('192.168.1.106')).toBe('192.168.1.0');
    expect(truncIp('::ffff:10.0.0.7')).toBe('10.0.0.0');
    expect(truncIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3::');
    const r = logSerializers.req({
      method: 'GET',
      url: '/api/v1/profiles/01a0edce-919e-742a-9b13-015ebd88198c?x=1',
      ip: '203.0.113.9',
    });
    expect(JSON.stringify(r)).not.toMatch(/01a0edce|x=1|203\.0\.113\.9/);
    expect(r).toEqual({ method: 'GET', url: '/api/v1/profiles/:id', remoteAddress: '203.0.113.0' });
  });
});
