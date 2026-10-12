<script lang="ts">
  import type { EtatMot } from '@awform/hifz';
  import { t } from '$lib/i18n';
  import { pauseGroups } from '$lib/quran/pause';

  /**
   * A5 — texte de la portion, MOT PAR MOT (Tanzil exact, jamais modifié), dans un conteneur `lang="ar"` : état de
   * chaque mot (oublié, changé, désordre, doute…), mot en cours du suivi en direct, mots cachés qui se dévoilent.
   * Classe `quran-text` : texte coranique rendu tel quel, jamais dans <Bidi> (règle des gabarits).
   */
  let {
    versets,
    index,
    etats,
    ajouts,
    sautes,
    courant = -1,
    masque = false,
  }: {
    versets: ReadonlyArray<{ s: number; a: number; text: string }>;
    index: ReadonlyMap<string, number>;
    etats: readonly EtatMot[];
    ajouts: ReadonlySet<number>;
    sautes: ReadonlySet<string>;
    courant?: number;
    masque?: boolean;
  } = $props();
  const ESPACE = ' ';
  /** lot lecteur 4 : numéro de verset en chiffres arabes (١٢٣) dans l'étoile, comme dans le lecteur */
  const arNum = (n: number) => new Intl.NumberFormat('ar-EG', { useGrouping: false }).format(n);
</script>

<div class="texte quran-text" class:masque lang="ar" dir="rtl" data-testid="ecoute-texte">
  <!-- un mot (Tanzil, tel quel) : déclaré DANS le texte coranique (règle des gabarits) -->
  {#snippet mot(s: number, a: number, w: string, k: number)}{@const i = index.get(
      `${s}:${a}:${k}`,
    )}{@const e = i === undefined ? undefined : etats[i]}<span
      class="mot {e ?? ''}"
      class:courant={i !== undefined && i === courant}
      data-etat={e}>{w}</span
    >{#if i !== undefined && ajouts.has(i)}<span class="ajout" aria-hidden="true">+</span
      >{/if}{/snippet}
  {#each versets as v (v.a)}
    {@const ws = v.text.split(' ')}
    <p class="verset" class:saute={sautes.has(`${v.s}:${v.a}`)}>
      <!-- signes de pause (U+06D6 à U+06DC) rattachés au mot qui précède, à l'affichage seulement (pause.ts) -->
      {#each pauseGroups(ws) as gr (gr[0])}
        {#if gr.length > 1}<span class="wg" data-testid="ecoute-groupe"
            >{#each gr as k, j (k)}{j > 0 ? ESPACE : ''}{@render mot(
                v.s,
                v.a,
                ws[k]!,
                k,
              )}{/each}</span
          >{:else}{@render mot(v.s, v.a, ws[gr[0]!]!, gr[0]!)}{/if}{ESPACE}
      {/each}
      <span class="num" aria-label={t('ec.verset_n', { n: v.a })}>{arNum(v.a)}</span>
    </p>
  {/each}
</div>

<style>
  /* numéro de verset dans une rosette verte (étoile à huit pointes), comme dans le lecteur */
  .num {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: 2.1em;
    height: 2.1em;
    margin-inline: 3px;
    vertical-align: -0.1em;
    font-size: 0.68em;
    line-height: 1;
    color: var(--mp-green);
    white-space: nowrap;
  }
  .num::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--mp-green);
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-20 -20 40 40'%3E%3Cg fill='none' stroke='%23000' stroke-linejoin='round'%3E%3Cpath stroke-width='2.4' d='M0-18L5.3-12.7H12.7V-5.3L18 0 12.7 5.3V12.7H5.3L0 18-5.3 12.7H-12.7V5.3L-18 0-12.7-5.3V-12.7H-5.3Z'/%3E%3C/g%3E%3C/svg%3E")
      center / contain no-repeat;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-20 -20 40 40'%3E%3Cg fill='none' stroke='%23000' stroke-linejoin='round'%3E%3Cpath stroke-width='2.4' d='M0-18L5.3-12.7H12.7V-5.3L18 0 12.7 5.3V12.7H5.3L0 18-5.3 12.7H-12.7V5.3L-18 0-12.7-5.3V-12.7H-5.3Z'/%3E%3C/g%3E%3C/svg%3E")
      center / contain no-repeat;
  }
  .texte {
    font-family: var(--font-quran);
    font-size: 1.6rem;
    line-height: 2.4;
    text-align: right;
  }
  :global(.enfant) .texte {
    font-size: 1.9rem;
  }
  .verset {
    margin: 0 0 6px;
  }
  .verset.saute {
    background: var(--warn-bg);
    border-radius: 8px;
  }
  /* un mot et ses signes de pause : jamais coupés en fin de ligne */
  .wg {
    white-space: nowrap;
  }
  .mot {
    border-radius: 6px;
    padding: 0 2px;
    transition: background-color 0.2s;
  }
  .mot.oublie {
    background: var(--warn-bg);
    text-decoration: underline dotted var(--warn-ink);
    text-underline-offset: 8px;
  }
  .mot.remplace {
    background: var(--bad-bg);
    color: var(--bad-ink);
  }
  .mot.ordre {
    background: var(--warn-bg);
    text-decoration: underline wavy var(--warn-ink);
    text-underline-offset: 8px;
  }
  .mot.courant {
    outline: 2px solid var(--accent);
  }
  .masque .mot:not(.ok):not(.oublie):not(.remplace):not(.ordre) {
    color: transparent;
    border-bottom: 2px dotted var(--ink2);
  }
  .ajout {
    color: var(--bad-ink);
    font-family: var(--font-ui);
    font-weight: 700;
    padding: 0 3px;
  }
</style>
