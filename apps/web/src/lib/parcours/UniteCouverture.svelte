<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { localUnit } from '$lib/offline';
  import Icon from '$lib/ui/Icon.svelte';

  /**
   * D1 — couverture d'une unité (leçons entre deux bilans) : bandeau de couleur (émeraude, émeraude profond,
   * vert feuille, en alternance), motif étoilé fin, titre calligraphié (Amiri) et un OBJET ou un DÉCOR tiré des
   * illustrations du livre (accessoire ou lieu de la scène de la première leçon ; jamais un personnage, ni un
   * animal). L'illustration n'est chargée que lorsque la couverture approche de l'écran.
   */
  let {
    index,
    lecons,
    faites,
    premiere,
    ouvert,
    ontoggle,
    controle,
  }: {
    index: number;
    lecons: string;
    faites: string;
    premiere: string | null;
    ouvert: boolean;
    ontoggle: () => void;
    controle: string;
  } = $props();

  const ORDINAUX = [
    'الْأُولَى',
    'الثَّانِيَةُ',
    'الثَّالِثَةُ',
    'الرَّابِعَةُ',
    'الْخَامِسَةُ',
    'السَّادِسَةُ',
    'السَّابِعَةُ',
    'الثَّامِنَةُ',
    'التَّاسِعَةُ',
    'الْعَاشِرَةُ',
  ];
  const titreAr = $derived(
    index < ORDINAUX.length ? `الْوَحْدَةُ ${ORDINAUX[index]}` : 'الْوَحْدَةُ',
  );
  const TEINTES = ['emeraude', 'profond', 'feuille'] as const;
  const teinte = $derived(TEINTES[index % 3]);

  /** êtres vivants exclus de la couverture (règle des images de la DA : objets et décors seulement) */
  const VIVANTS =
    /^(sparrow|bird|oiseau|chat|cat|dog|chien|elephant|giraffe|monkey|butterfly|lion|tiger|bear|fish|poisson|horse|cheval|camel|chameau|sheep|mouton|cow|vache|goat|chevre|rabbit|lapin|ant|fourmi|bee|abeille|duck|canard|hen|poule|rooster|coq|deer|frog|turtle|tortue|snake|owl|dove|pigeon|mouse|souris|donkey|ane|wolf|fox|insect|spider|whale|dolphin|parrot|peacock|eagle|falcon|ladybug)s?$/i;
  /** le muṣḥaf n'est jamais un décor (règle des images) : ni muṣḥaf, ni support, ni texte coranique en couverture */
  const SACRE = /^(mushaf|rehal|quran|coran|surah|sourate|ayah|aya|bismillah|kaaba)/i;
  let dessin = $state<{ viewBox: string; svg: string } | null>(null);
  let el: HTMLElement | undefined = $state();

  type Scene = { lieu?: string; props?: string[]; persos?: string[] };
  type Lecon = { scene?: Scene; dialogue?: Scene; mots?: Array<{ img?: string }> };
  type Ill = Record<string, { viewBox: string; svg: string }>;

  async function charger() {
    if (!premiere) return;
    let lesson: Lecon;
    let ill: Ill;
    const loc = await localUnit(premiere).catch(() => null);
    if (loc) {
      lesson = loc.unit.lesson as unknown as Lecon;
      ill = loc.illustrations as Ill;
    } else {
      const r = await fetch(`/api/v1/units/${encodeURIComponent(premiere)}`, {
        headers: { accept: 'application/json' },
      }).catch(() => null);
      if (!r?.ok) return;
      const j = (await r.json()) as { unit: { lesson: Lecon }; illustrations: Ill };
      lesson = j.unit.lesson;
      ill = j.illustrations;
    }
    const persos = new Set([...(lesson.scene?.persos ?? []), ...(lesson.dialogue?.persos ?? [])]);
    const candidats = [
      ...(lesson.scene?.props ?? []),
      ...(lesson.dialogue?.props ?? []),
      lesson.scene?.lieu,
      lesson.dialogue?.lieu,
      ...(lesson.mots ?? []).map((m) => m.img),
    ].filter(
      (k): k is string => !!k && !persos.has(k) && !VIVANTS.test(k) && !SACRE.test(k) && !!ill[k],
    );
    const k = candidats[0];
    if (k) dessin = ill[k]!;
  }

  onMount(() => {
    if (!el || !premiere) return;
    if (!('IntersectionObserver' in window)) {
      void charger();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void charger();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  });
</script>

<button
  type="button"
  class="couv"
  bind:this={el}
  aria-expanded={ouvert}
  aria-controls={controle}
  onclick={ontoggle}
  data-testid="unite"
  data-unite={index + 1}
  data-ouvert={ouvert}
>
  <span class="bandeau {teinte}">
    <span class="objet" aria-hidden="true"
      >{#if dessin}<svg viewBox={dessin.viewBox}
          ><!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG des livres validé à l'import (liste blanche) -->
          {@html dessin.svg}</svg
        >{/if}</span
    >
    <span class="titre-ar" lang="ar" dir="rtl"><Bidi text={titreAr} base="ar" /></span>
  </span>
  <span class="pied">
    <span class="nom">
      <strong><Bidi text={t('parc.unite', { n: index + 1 })} /></strong>
      <small><Bidi text={lecons} /></small>
    </span>
    <small class="faites"><Bidi text={faites} /></small>
    <span class="chev" class:ouvert aria-hidden="true"><Icon name="chevron" size={20} /></span>
  </span>
</button>

<style>
  .couv {
    display: grid;
    width: 100%;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 16px;
    overflow: hidden;
    background: var(--card);
    color: var(--ink);
    text-align: start;
    font: inherit;
    cursor: pointer;
    box-shadow: var(--shadow-card);
  }
  .bandeau {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 88px;
    padding: 8px 16px;
    color: var(--bande-texte);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='.16' stroke-width='1'%3E%3Crect x='14' y='14' width='16' height='16'/%3E%3Crect x='14' y='14' width='16' height='16' transform='rotate(45 22 22)'/%3E%3C/g%3E%3C/svg%3E");
    border-bottom: 2px solid var(--gold);
  }
  /* couleurs de la marque (identiques en clair et en sombre : ce sont des aplats, avec un titre ivoire) */
  .emeraude {
    background-color: var(--bande-1);
  }
  .profond {
    background-color: var(--bande-2);
  }
  .feuille {
    background-color: var(--bande-3);
  }
  .objet {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    flex: none;
    border-radius: 50%;
    background: var(--bande-texte);
    box-shadow: 0 0 0 2px rgba(201, 162, 39, 0.7);
  }
  .objet svg {
    width: 48px;
    height: 48px;
  }
  .titre-ar {
    font-family: var(--font-ar-titre);
    font-size: 1.9rem;
    line-height: 1.6;
    font-weight: 700;
  }
  .pied {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    min-height: 56px;
  }
  .nom {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .nom small,
  .faites {
    color: var(--ink2);
  }
  .chev {
    transform: rotate(90deg);
    transition: transform var(--motion-fast) ease;
    color: var(--ink2);
  }
  .chev.ouvert {
    transform: rotate(-90deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
</style>
