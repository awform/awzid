<script lang="ts">
  import type { EtatMot } from '@awform/hifz';

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
</script>

<div class="texte quran-text" class:masque lang="ar" dir="rtl" data-testid="ecoute-texte">
  {#each versets as v (v.a)}
    <p class="verset" class:saute={sautes.has(`${v.s}:${v.a}`)}>
      {#each v.text.split(' ') as w, k (k)}
        {@const i = index.get(`${v.s}:${v.a}:${k}`)}
        {@const e = i === undefined ? undefined : etats[i]}
        <span class="mot {e ?? ''}" class:courant={i !== undefined && i === courant} data-etat={e}
          >{w}</span
        >{#if i !== undefined && ajouts.has(i)}<span class="ajout" aria-hidden="true">+</span
          >{/if}{ESPACE}
      {/each}
      <span class="num">﴿{v.a}﴾</span>
    </p>
  {/each}
</div>

<style>
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
  .num {
    font-size: 0.8em;
    color: var(--ink2);
  }
</style>
