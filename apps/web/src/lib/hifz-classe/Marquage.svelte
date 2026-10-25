<script lang="ts">
  import { tanwinDisplay } from '@awform/content/text';
  import { splitBasmala } from '@awform/hifz';
  import Bidi from '$lib/Bidi.svelte';
  import { fmtNumber, t } from '$lib/i18n';
  import { TYPES, type Erreur, type Type } from './donnees';

  /**
   * Le texte Tanzil MOT PAR MOT (`texte.split(' ')`, comme l'IA d'écoute et la carte des erreurs) : le maître touche un mot, puis le
   * type d'erreur (oubli, mot ajouté après celui-ci, mot changé, tajwīd) ; chaque marque se voit par une lettre ET un style de
   * soulignement (jamais la couleur seule). Aucun micro, aucun enregistrement : c'est un simple carnet de cochage.
   */
  let {
    verses,
    basmala = '',
    erreurs = $bindable([]),
    figee = false,
    onchange,
  }: {
    verses: ReadonlyArray<{ s: number; a: number; text: string }>;
    basmala?: string;
    erreurs?: Erreur[];
    figee?: boolean;
    onchange?: () => void;
  } = $props();
  const ESPACE = ' ';
  const CODE: Record<Type, string> = { oubli: '−', ajout: '+', changement: '≠', tajwid: 'T' };
  let choisi = $state<{ a: number; k: number } | null>(null);

  const types = (a: number, k: number) =>
    TYPES.filter((ty) => erreurs.some((e) => e.a === a && e.k === k && e.t === ty));
  const nbBasmala = (v: { s: number; a: number; text: string }) => {
    const p = basmala ? splitBasmala(v.s, v.a, v.text, basmala) : null;
    return p?.basmala ? p.basmala.split(' ').length : 0;
  };
  function basculer(ty: Type) {
    if (!choisi || figee) return;
    const { a, k } = choisi;
    erreurs = erreurs.some((e) => e.a === a && e.k === k && e.t === ty)
      ? erreurs.filter((e) => !(e.a === a && e.k === k && e.t === ty))
      : [...erreurs, { a, k, t: ty }];
    onchange?.();
  }
  function effacer() {
    if (!choisi || figee) return;
    const { a, k } = choisi;
    erreurs = erreurs.filter((e) => !(e.a === a && e.k === k));
    onchange?.();
  }
  const compte = (ty: Type) => erreurs.filter((e) => e.t === ty).length;
</script>

<div class="marquage" data-testid="marquage">
  {#each verses as v (v.a)}
    {@const mots = v.text.split(' ')}
    {@const nb = nbBasmala(v)}
    <div class="verset quran-text" lang="ar" dir="rtl" data-verset={`${v.s}:${v.a}`}>
      {#if nb}<p class="bsm">
          {#each mots.slice(0, nb) as w, k (k)}<span class="mot" data-k={k}>{tanwinDisplay(w)}</span
            >{ESPACE}{/each}
        </p>{/if}
      <p class="ligne">
        {#each mots.slice(nb) as w, i (i)}
          {@const k = i + nb}
          {@const ty = types(v.a, k)}
          <button
            type="button"
            class="mot"
            class:choisi={choisi?.a === v.a && choisi?.k === k}
            class:oubli={ty.includes('oubli')}
            class:ajout={ty.includes('ajout')}
            class:changement={ty.includes('changement')}
            class:tajwid={ty.includes('tajwid')}
            aria-pressed={choisi?.a === v.a && choisi?.k === k}
            aria-label={t('hc.mot_aria', {
              n: k + 1,
              a: v.a,
              types: ty.map((x) => t(`hc.type_${x}`)).join(', '),
            })}
            onclick={() => (choisi = { a: v.a, k })}
            data-k={k}
            data-testid="mot"
            data-marques={ty.join(',')}
            >{tanwinDisplay(w)}{#if ty.length}<sup class="codes" aria-hidden="true"
                >{ty.map((x) => CODE[x]).join('')}</sup
              >{/if}</button
          >{ESPACE}
        {/each}<span class="n">{fmtNumber(v.a, { useGrouping: false })}</span>
      </p>
    </div>
  {/each}

  <div class="legende" data-testid="legende">
    {#each TYPES as ty (ty)}
      <span class={`pastille ${ty}`}
        ><b aria-hidden="true"><Bidi text={CODE[ty]} /></b>
        <Bidi text={t(`hc.type_${ty}`)} />
        <small data-testid={`compte-${ty}`}><Bidi text={compte(ty)} /></small></span
      >
    {/each}
  </div>

  {#if choisi && !figee}
    <div class="panneau" role="group" aria-label={t('hc.panneau')} data-testid="panneau-mot">
      <p class="petit">
        <Bidi text={t('hc.mot_choisi', { n: choisi.k + 1, a: choisi.a })} />
      </p>
      <div class="boutons">
        {#each TYPES as ty (ty)}
          <button
            type="button"
            class={`type ${ty}`}
            aria-pressed={types(choisi.a, choisi.k).includes(ty)}
            onclick={() => basculer(ty)}
            data-testid={`type-${ty}`}
            ><b aria-hidden="true"><Bidi text={CODE[ty]} /></b>
            <Bidi text={t(`hc.type_${ty}`)} /></button
          >
        {/each}
        <button type="button" onclick={effacer} data-testid="type-effacer">{t('hc.effacer')}</button
        >
        <button type="button" onclick={() => (choisi = null)}>{t('hc.fermer')}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .marquage {
    display: grid;
    gap: 6px;
  }
  .verset {
    font-family: var(--font-quran);
    font-size: 1.7rem;
    line-height: 2.5;
  }
  .verset p {
    margin: 0;
  }
  .bsm {
    text-align: center;
  }
  button.mot {
    all: unset;
    cursor: pointer;
    min-height: 44px;
    padding: 0 4px;
    border-radius: 6px;
  }
  button.mot:focus-visible {
    outline: 3px solid var(--teal);
  }
  button.mot.choisi {
    background: var(--primary-soft);
    outline: 2px solid var(--primary);
  }
  .oubli {
    text-decoration: underline wavy var(--bad-ink);
    text-underline-offset: 8px;
    background: var(--bad-bg);
  }
  .ajout {
    text-decoration: underline dotted var(--warn-ink);
    text-underline-offset: 8px;
    background: var(--warn-bg);
  }
  .changement {
    text-decoration: underline double var(--info-ink, var(--ink));
    text-underline-offset: 8px;
    background: var(--info-bg);
  }
  .tajwid {
    text-decoration: underline dashed var(--or-ink);
    text-underline-offset: 8px;
    background: var(--or-soft);
  }
  .codes {
    font-family: var(--font-ui);
    font-size: 0.7rem;
    margin-inline-start: 2px;
  }
  .n {
    display: inline-block;
    min-width: 1.8em;
    padding: 0 4px;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    text-align: center;
    vertical-align: middle;
  }
  .legende {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 0.9rem;
  }
  .pastille {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    padding: 2px 10px;
    border-radius: 999px;
    border: 1px solid var(--line);
  }
  .panneau {
    position: sticky;
    bottom: 0;
    z-index: 2;
    display: grid;
    gap: 6px;
    padding: 10px 12px;
    background: var(--card);
    border: 1px solid var(--or-line);
    border-radius: 12px;
    box-shadow: var(--shadow-float);
  }
  .petit {
    margin: 0;
    font-size: 0.9rem;
  }
  .boutons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .boutons button {
    min-height: 48px;
  }
  .type[aria-pressed='true'] {
    outline: 3px solid var(--primary);
    font-weight: 700;
  }
</style>
