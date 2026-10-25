/**
 * Cahiers des enfants et des ados (25/10/2026) — glisser-déposer au doigt et à la souris (événements « pointeur »),
 * sans bibliothèque et sans « action » Svelte (une action ajoute son code d'exécution à la coquille de l'élève). Une
 * tuile se glisse sur une cible marquée `data-depot` ; un simple appui n'est PAS un glissement (il reste un clic : le mode
 * « sans glisser » touche la tuile, puis la case, et le clavier fait de même). La tuile fantôme suit le doigt.
 *
 * Usage : `onpointerdown={(e) => glisser(e, (cible) => …)}` sur la tuile ; `cible` est l'élément `data-depot` sous le
 * doigt au lâcher (ou null).
 */

/** distance (px) au-delà de laquelle un appui devient un glissement */
export const SEUIL_GLISSEMENT = 8;

export function glisser(e: PointerEvent, depot: (cible: HTMLElement | null) => void): void {
  const node = e.currentTarget as HTMLElement | null;
  if (!node || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const id = e.pointerId;
  const x0 = e.clientX;
  const y0 = e.clientY;
  let enCours = false;
  let fantome: HTMLElement | null = null;
  let dx = 0;
  let dy = 0;
  try {
    node.setPointerCapture(id);
  } catch {
    /* capture indisponible : le glissement suit quand même le pointeur */
  }

  const bouge = (m: PointerEvent) => {
    if (m.pointerId !== id) return;
    if (!enCours && Math.hypot(m.clientX - x0, m.clientY - y0) > SEUIL_GLISSEMENT) {
      enCours = true;
      const r = node.getBoundingClientRect();
      fantome = node.cloneNode(true) as HTMLElement;
      fantome.removeAttribute('data-testid');
      fantome.setAttribute('aria-hidden', 'true');
      fantome.classList.add('fantome');
      const s = fantome.style;
      s.position = 'fixed';
      s.left = '0';
      s.top = '0';
      s.width = `${r.width}px`;
      s.height = `${r.height}px`;
      s.margin = '0';
      s.zIndex = '1000';
      s.pointerEvents = 'none';
      dx = x0 - r.left;
      dy = y0 - r.top;
      document.body.appendChild(fantome);
      node.classList.add('en-main');
    }
    if (enCours && fantome) {
      fantome.style.transform = `translate(${m.clientX - dx}px, ${m.clientY - dy}px)`;
      m.preventDefault();
    }
  };
  const fin = (u: PointerEvent, annule: boolean) => {
    if (u.pointerId !== id) return;
    window.removeEventListener('pointermove', bouge);
    window.removeEventListener('pointerup', haut);
    window.removeEventListener('pointercancel', abandon);
    try {
      node.releasePointerCapture(id);
    } catch {
      /* déjà relâché */
    }
    if (!enCours) return;
    fantome?.remove();
    node.classList.remove('en-main');
    // le lâcher d'un glissement ne doit pas compter comme un clic (sélection de la tuile)
    const sansClic = (c: Event) => {
      c.stopImmediatePropagation();
      c.preventDefault();
    };
    window.addEventListener('click', sansClic, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', sansClic, { capture: true }), 0);
    if (annule) return;
    const sous = document.elementFromPoint(u.clientX, u.clientY);
    depot((sous?.closest('[data-depot]') as HTMLElement | null) ?? null);
  };
  const haut = (u: PointerEvent) => fin(u, false);
  const abandon = (u: PointerEvent) => fin(u, true);
  window.addEventListener('pointermove', bouge, { passive: false });
  window.addEventListener('pointerup', haut);
  window.addEventListener('pointercancel', abandon);
}
