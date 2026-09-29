/**
 * Consignes et explications PÉDAGOGIQUES des livres (lot 15, mécanisme seulement) : le contenu des livres est
 * en français (`consigne_fr`, `titre_fr`…). Quand une traduction du contenu existera, elle sera livrée dans
 * les fichiers de contenu sous la forme `<champ>_<langue>` (ex. `consigne_en`) : ce module la choisit selon la
 * langue de l'interface, sinon garde le français ET le signale (`lang: 'fr'`) pour que la page l'annonce
 * correctement (attribut lang). L'arabe étudié et le Coran ne sont jamais traduits par ce mécanisme.
 */
import { locale } from './index';

export interface ContentText {
  text: string;
  lang: string;
}

export function contentText(
  obj: object | null | undefined,
  base: string,
  loc: string = locale(),
): ContentText | null {
  if (!obj) return null;
  const o = obj as Record<string, unknown>;
  const tr = o[`${base}_${loc}`];
  if (loc !== 'fr' && typeof tr === 'string' && tr.trim()) return { text: tr, lang: loc };
  const fr = o[`${base}_fr`];
  return typeof fr === 'string' && fr.trim() ? { text: fr, lang: 'fr' } : null;
}
