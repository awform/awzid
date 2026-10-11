/**
 * Marque Awzid — couleur du nom et du slogan selon le fond réel (clair ou sombre).
 * Les thèmes de l'application ont des en-têtes clairs (clair, verdure) ou foncés (jardin, nuit, manuscrit,
 * tout mode sombre) : on lit le fond affiché et on retient la couleur de marque lisible dessus (≥ 4,5:1),
 * sinon la couleur de texte du thème. Nom : #084C38 (clair) / #E8DFC8 (sombre) ; slogan : #0B6E4F / #D9B54A.
 */
export const NOM = { clair: '#084C38', sombre: '#E8DFC8' } as const;
export const SLOGAN = { clair: '#0B6E4F', sombre: '#D9B54A' } as const;

type Rgb = [number, number, number];

export function parseCouleur(css: string): (Rgb & { a?: number }) | null {
  const m = css.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\s*\)/);
  if (m) {
    const r = [Number(m[1]), Number(m[2]), Number(m[3])] as Rgb & { a?: number };
    if (m[4] !== undefined) r.a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4]);
    return r;
  }
  const h = css.trim().match(/^#([0-9a-f]{6})$/i);
  if (h) {
    const n = parseInt(h[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return null;
}

function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contraste(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Encre de marque lisible sur `fond` ; `null` si aucune des deux ne tient 4,5:1 (le thème garde sa couleur). */
export function choisirEncre(
  fond: string,
  paire: { clair: string; sombre: string },
): { encre: string | null; fondSombre: boolean } {
  const f = parseCouleur(fond) ?? [255, 255, 255];
  const fondSombre = luminance(f) < 0.2;
  const prefere = fondSombre ? paire.sombre : paire.clair;
  const autre = fondSombre ? paire.clair : paire.sombre;
  for (const c of [prefere, autre]) {
    const rgb = parseCouleur(c)!;
    if (contraste(rgb, f) >= 4.5) return { encre: c, fondSombre };
  }
  return { encre: null, fondSombre };
}

/** Fond réellement affiché derrière `el` : premier ancêtre non transparent. */
export function fondDe(el: Element): string {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const bg = getComputedStyle(n).backgroundColor;
    const c = parseCouleur(bg);
    if (c && (c.a ?? 1) > 0.9) return bg;
  }
  return 'rgb(255, 255, 255)';
}

/**
 * Action Svelte : pose la couleur de marque sur le nœud et `data-fond="clair|sombre"` ; se remet à jour
 * quand le thème, le mode ou la préférence du système changent. Avant l'hydratation : couleur du thème.
 */
export function encreDeMarque(node: HTMLElement, paire: { clair: string; sombre: string }) {
  const maj = () => {
    const { encre, fondSombre } = choisirEncre(fondDe(node.parentElement ?? node), paire);
    node.style.color = encre ?? '';
    node
      .closest<HTMLElement>('[data-marque]')
      ?.setAttribute('data-fond', fondSombre ? 'sombre' : 'clair');
  };
  maj();
  const obs = new MutationObserver(maj);
  const racine = document.documentElement;
  obs.observe(racine, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-mode', 'data-palette'],
  });
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  mq?.addEventListener?.('change', maj);
  return {
    destroy() {
      obs.disconnect();
      mq?.removeEventListener?.('change', maj);
    },
  };
}
