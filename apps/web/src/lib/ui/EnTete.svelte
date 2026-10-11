<script lang="ts">
  import type { Snippet } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  /**
   * D2 — en-tête d'un espace (Coran, Vivre l'islam, Sciences), même vocabulaire que les couvertures d'unité (D1) :
   * bandeau émeraude au motif étoilé, filet doré, titre arabe calligraphié (Amiri) SUR SA LIGNE, objet ou décor
   * dans un médaillon ivoire (jamais un personnage, un animal ni le muṣḥaf ; à défaut, l'étoile à 8 branches),
   * puis le titre français (Lexend) et, au besoin, une action nommée (`action`).
   */
  let {
    titre,
    ar,
    icon = '',
    teinte = 1,
    action,
  }: { titre: string; ar: string; icon?: string; teinte?: 1 | 2 | 3; action?: Snippet } = $props();
</script>

<header class="entete" data-testid="entete-espace">
  <div class="bande" style:background-color="var(--bande-{teinte})">
    <span class="objet" aria-hidden="true"
      >{#if icon}<Icon name={icon} size={34} />{:else}<span class="khatam"></span>{/if}</span
    >
    <p class="titre-ar" lang="ar" dir="rtl"><Bidi text={ar} base="ar" /></p>
  </div>
  <div class="pied">
    <h1><Bidi text={titre} /></h1>
    {@render action?.()}
  </div>
</header>

<style>
  .entete {
    border: 1px solid var(--line);
    border-radius: 16px;
    overflow: hidden;
    background: var(--card);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-m);
  }
  .bande {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 84px;
    padding: 8px 16px;
    color: var(--bande-texte);
    background-image: var(--motif-etoile);
    border-bottom: 2px solid var(--gold);
  }
  .objet {
    display: grid;
    place-items: center;
    width: 60px;
    height: 60px;
    flex: none;
    border-radius: 50%;
    background: var(--bande-texte);
    color: var(--bande-1);
    box-shadow: 0 0 0 2px rgba(201, 162, 39, 0.7);
  }
  /* étoile à 8 branches : deux carrés croisés (khatam), filet doré */
  .khatam {
    position: relative;
    width: 26px;
    height: 26px;
  }
  .khatam::before,
  .khatam::after {
    content: '';
    position: absolute;
    inset: 0;
    border: 2px solid var(--bande-1);
    border-radius: 2px;
  }
  .khatam::after {
    transform: rotate(45deg);
  }
  .titre-ar {
    margin: 0;
    font-family: var(--font-ar-titre);
    font-weight: 700;
    font-size: 1.9rem;
    line-height: 1.6;
  }
  .pied {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 16px;
  }
  .pied h1 {
    margin: 0;
    font-size: 1.5rem;
  }
</style>
