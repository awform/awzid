/** Symboles des codes image et des avatars (aucun visage, aucun émoji-visage : CDC §3.4). */
export const SYMBOLS = [
  {
    id: 'etoile',
    label: 'étoile',
    d: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.3 6L12 16.6 6.6 19.4l1.3-6L3.4 9.3l6-.7z',
    fill: '#F2B233',
  },
  { id: 'lune', label: 'lune', d: 'M15 3a9 9 0 1 0 6 15A7 7 0 0 1 15 3z', fill: '#2F6FDB' },
  {
    id: 'soleil',
    label: 'soleil',
    d: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v3M12 20v3M1 12h3M20 12h3',
    fill: '#F07F2E',
  },
  {
    id: 'feuille',
    label: 'feuille',
    d: 'M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19l8-8',
    fill: '#1F9D6B',
  },
  {
    id: 'goutte',
    label: 'goutte',
    d: 'M12 3c3 5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6 6-11z',
    fill: '#9FD3F5',
  },
  { id: 'livre', label: 'livre', d: 'M4 5h7v14H4zM13 5h7v14h-7z', fill: '#E5484D' },
] as const;

export type SymbolId = (typeof SYMBOLS)[number]['id'];

export async function hashCode(profileId: string, code: string[]): Promise<string> {
  const data = new TextEncoder().encode(`${profileId}:${code.join('-')}`);
  const h = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
