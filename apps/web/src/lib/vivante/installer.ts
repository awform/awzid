/**
 * Chantier A21 — chargé À LA DEMANDE (aucun octet dans la page de leçon tant que la leçon n'est pas vivante) :
 * génère les animations depuis la leçon reçue (projection élève) et les place après chaque partie de la page.
 * Les animations ne sont jamais écrites à la main : `buildVivante` (packages/content) applique six modèles.
 */
import { mount, unmount } from 'svelte';
import { buildVivante, type VivSlot } from '@awform/content/vivante';
import { audioIdFor, levelAudio, type LevelAudio } from '$lib/lecons-audio';
import Motion from './Motion.svelte';

/** partie de la page (section du lecteur de leçon) qui précède chaque animation */
const ANCHORS: Record<Exclude<VivSlot, 'fin'>, string> = {
  lettres: '.letters, .forms',
  lecture: '.notion, .syl, .readline, .phrase',
  mots: '.words',
  dialogue: '.dlg',
  lexique: '.lex',
  retiens: '.memo, .bravo',
};

interface Unit {
  id: string;
  levelCode: string;
  lesson: unknown;
}

export async function installer(
  article: HTMLElement,
  unit: Unit,
  illus: (() => Record<string, { viewBox: string }>) | undefined,
  audio: (() => LevelAudio | null) | undefined,
): Promise<() => void> {
  // fichiers audio du niveau (déjà en cache) : questions « écoute » seulement si le fichier existe
  const la = await levelAudio(unit.levelCode).catch(() => null);
  const images = illus?.() ?? {};
  const { motions, condense } = buildVivante(unit.lesson, {
    unitId: unit.id,
    images: Object.keys(images),
    hasAudio: (s) => !!audioIdFor(s, la),
  });
  const lettres = ((unit.lesson as { lettres?: Array<{ l: string }> }).lettres ?? []).filter(
    (x) => typeof x?.l === 'string',
  );
  const sections = [...article.querySelectorAll<HTMLElement>(':scope > section')];
  const made: Array<{ host: HTMLElement; app: ReturnType<typeof mount> }> = [];
  const place = (after: Element, m: (typeof motions)[number], isCondense = false) => {
    const host = document.createElement('div');
    host.className = 'vivante-hote';
    after.after(host);
    const app = mount(Motion, {
      target: host,
      props: {
        motion: m,
        illus: images,
        audio: audio ?? (() => la),
        lettres,
        condense: isCondense,
      },
    });
    made.push({ host, app });
  };
  for (const m of motions) {
    if (m.slot === 'fin') continue;
    const sel = ANCHORS[m.slot];
    // dernière section de la partie (lettres : « je découvre » puis le tableau des formes)
    const sec = sections.filter((s) => s.matches(sel) || s.querySelector(sel)).at(-1);
    if (sec) place(sec, m);
  }
  const last = sections.at(-1);
  if (condense && last) place(last, condense, true);
  return () => {
    for (const { host, app } of made) {
      void unmount(app);
      host.remove();
    }
  };
}
