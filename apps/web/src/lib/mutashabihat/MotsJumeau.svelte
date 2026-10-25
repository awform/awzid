<script lang="ts">
  import { tanwinDisplay } from '@awform/content/text';
  import { splitBasmala } from '@awform/hifz';
  import { fmtNumber, t } from '$lib/i18n';

  /**
   * Un verset MOT PAR MOT (texte Tanzil exact, `texte.split(' ')` : les rangs sont ceux des données des mutashābihāt),
   * avec les mots qui changent SURLIGNÉS (or sur ivoire) et soulignés (jamais la couleur seule), ou, pour une formule
   * commune, le passage commun. Le mot masqué d'un exercice (`trou`) est remplacé par un blanc.
   */
  let {
    v,
    basmala = '',
    marques = [],
    commun = null,
    trou = -1,
    jusqua = Infinity,
  }: {
    v: { s: number; a: number; text: string };
    basmala?: string;
    marques?: readonly number[];
    commun?: readonly [number, number] | null;
    trou?: number;
    /** nombre de mots montrés (début du verset d'un exercice) */
    jusqua?: number;
  } = $props();
  const ESPACE = ' ';
  const words = $derived(v.text.split(' '));
  const nb = $derived.by(() => {
    const p = basmala ? splitBasmala(v.s, v.a, v.text, basmala) : null;
    return p?.basmala ? p.basmala.split(' ').length : 0;
  });
  const texteTrou = t('mt.trou');
  const estCommun = (k: number) => !!commun && k >= commun[0] && k <= commun[1];
</script>

<div class="mj quran-text" lang="ar" dir="rtl" data-verset={`${v.s}:${v.a}`}>
  {#if nb}<p class="bsm">
      {#each words.slice(0, nb) as w, k (k)}<span class="mot" data-k={k}>{tanwinDisplay(w)}</span
        >{ESPACE}{/each}
    </p>{/if}
  <p class="ligne">
    {#each words.slice(nb, jusqua) as w, i (i)}
      {@const k = i + nb}
      {#if k === trou}<span
          class="mot blanc"
          data-k={k}
          data-testid="mot-masque"
          aria-label={texteTrou}
        ></span>{:else}<span
          class="mot"
          class:diff={marques.includes(k)}
          class:commun={!marques.length && estCommun(k)}
          data-k={k}>{tanwinDisplay(w)}</span
        >{/if}{ESPACE}
    {/each}<span class="n">{fmtNumber(v.a, { useGrouping: false })}</span>
  </p>
</div>

<style>
  .mj {
    font-family: var(--font-quran);
    font-size: 1.6rem;
    line-height: 2.3;
    margin: 0 0 4px;
  }
  .mj p {
    margin: 0;
  }
  .bsm {
    text-align: center;
  }
  .mot {
    border-radius: 6px;
    padding: 0 2px;
  }
  /* mot qui change : or sur ivoire + soulignement plein (jamais la couleur seule) */
  .diff {
    background: var(--or-soft);
    color: var(--or-ink);
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 8px;
  }
  /* passage commun d'une formule : soulignement discret en pointillés */
  .commun {
    background: var(--or-soft);
    text-decoration: underline dotted var(--or-ink);
    text-underline-offset: 8px;
  }
  .blanc {
    display: inline-block;
    min-width: 3.5em;
    border-bottom: 3px solid var(--ink2);
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
</style>
