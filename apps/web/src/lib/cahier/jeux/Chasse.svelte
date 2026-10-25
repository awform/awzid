<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import type { LevelAudio } from '$lib/lecons-audio';
  import type { Audio } from '../donnees';
  import { jouerElement } from '../audio';

  /**
   * « Je colorie » et « Je trouve la lettre » (cahier des enfants, 25/10/2026) : on touche toutes les cases qui ont la
   * lettre. Une case juste s'allume et se dit ; une autre case ne coûte rien (« Réessaie »). Cibles de 44 px au moins,
   * grandes pour les enfants ; aucune pénalité.
   */
  let {
    lettre,
    cases,
    consigne,
    a = 's',
    audio,
    profil,
    onfini,
  }: {
    lettre: string;
    cases: Array<{ ar: string; cible: boolean }>;
    /** consigne française du cahier (sinon le texte par défaut) */
    consigne?: string;
    a?: Audio;
    audio: LevelAudio | null;
    profil: string | null;
    onfini?: () => void;
  } = $props();

  let trouvees = $state<number[]>([]);
  let essai = $state<number | null>(null);
  let fini = $state(false);
  const reste = $derived(cases.filter((c, i) => c.cible && !trouvees.includes(i)).length);

  function toucher(i: number) {
    const c = cases[i]!;
    void jouerElement({ ar: c.ar, a }, audio, profil).catch(() => null);
    if (!c.cible) {
      essai = i;
      return;
    }
    essai = null;
    if (!trouvees.includes(i)) trouvees = [...trouvees, i];
    if (cases.every((x, j) => !x.cible || trouvees.includes(j)) && !fini) {
      fini = true;
      onfini?.();
    }
  }
</script>

<div class="chasse" data-testid="chasse">
  <p class="consigne">
    <Bidi text={consigne ?? t('cahier.colorie_consigne', { l: lettre })} />
  </p>
  <div class="cases" dir="rtl">
    {#each cases as c, i (i)}
      <button
        type="button"
        class="case"
        class:bon={trouvees.includes(i)}
        class:mauvais={essai === i}
        aria-pressed={trouvees.includes(i)}
        data-cible={c.cible ? '1' : '0'}
        onclick={() => toucher(i)}
        ><span class="ar" lang="ar" dir="rtl"><Bidi text={c.ar} base="ar" /></span></button
      >
    {/each}
  </div>
  <p class="etat" role="status" data-testid="chasse-etat">
    {#if fini}<Bidi text={t('cahier.chasse_fini')} />{:else if essai !== null}<Bidi
        text={t('cahier.reessaie')}
      />{:else}<Bidi text={t('cahier.chasse_reste', { n: reste })} />{/if}
  </p>
</div>

<style>
  .chasse {
    margin: 0.5rem 0;
  }
  .consigne {
    margin: 0 0 0.5rem;
    color: var(--ink2);
  }
  .cases {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(4.6rem, 1fr));
    gap: 0.5rem;
  }
  .case {
    min-height: 4.2rem;
    min-width: 2.75rem;
    display: grid;
    place-items: center;
    border-radius: 16px;
    border: 2px solid var(--line);
    background: var(--cah-papier, var(--paper));
    color: var(--ink);
    cursor: pointer;
    transition:
      background var(--motion-fast, 120ms),
      transform var(--motion-fast, 120ms);
  }
  .case .ar {
    font: 400 2.2rem/1.5 var(--font-ar);
  }
  .case.bon {
    background: var(--ok-bg);
    border-color: var(--ok-ink);
    transform: scale(1.04);
  }
  .case.mauvais {
    background: var(--warn-bg);
    border-color: var(--warn-ink);
  }
  .case:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  .etat {
    margin: 0.5rem 0 0;
    font-weight: 700;
    color: var(--ink2);
  }
  @media (prefers-reduced-motion: reduce) {
    .case {
      transition: none;
    }
    .case.bon {
      transform: none;
    }
  }
</style>
