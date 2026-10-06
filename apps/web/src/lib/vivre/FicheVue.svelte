<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import type { FichePoint, Statut } from '@awform/content/adab';
  import Ar from '$lib/Ar.svelte';
  import ArFr from '$lib/ArFr.svelte';
  import { t } from '$lib/i18n';
  import { levelLabel } from '$lib/levels';
  import type { AdabEntry, Fiche, Kind } from './vivre';

  /**
   * A37 — une fiche du livret « Bon comportement » (situation, étapes avant / pendant / après avec l'ÉTIQUETTE de
   * chaque point, ce qu'on dit, pourquoi, dans la vraie vie, « Que fais-tu si… ? », défi), ou une rubrique d'un
   * livre (lue telle quelle dans la leçon : verset en bloc, arabe sur sa ligne, français dessous).
   * Enfants : l'essentiel ; ados : + « Que fais-tu si… ? » et le pourquoi ; adultes : tout.
   */
  type Obj = Record<string, unknown>;
  type Pt = { ar?: string; fr?: string; verset_tanzil?: unknown; statut?: string };
  let {
    fiche = null,
    entry = null,
    block = null,
    madhhab = null,
    kind,
  }: {
    fiche?: Fiche | null;
    entry?: AdabEntry | null;
    block?: Obj | null;
    madhhab?: string | null;
    kind: Kind | null;
  } = $props();

  const ado = $derived(kind !== 'enfant');
  const adulte = $derived(kind !== 'enfant' && kind !== 'ado');
  // statuts des étapes des livres de sciences → étiquettes communes (fard : obligatoire ; sunna, mustaḥabb,
  // faḍīla : recommandé ; « commun » : sans étiquette)
  const BOOK: Record<string, Statut> = {
    fard: 'obligatoire',
    sunna: 'recommande',
    mustahabb: 'recommande',
    fadila: 'recommande',
  };
  const list = (x: unknown) => (Array.isArray(x) ? (x as Pt[]) : []);
  const str = (x: unknown) => (typeof x === 'string' ? x : '');
</script>

{#snippet etiquette(s: Statut | undefined)}
  {#if s}<span class="st st-{s}" data-statut={s}><Bidi text={t(`vi.statut.${s}`)} /></span>{/if}
{/snippet}

{#snippet point(p: FichePoint, src: boolean)}
  <li class="pt">
    {@render etiquette(p.statut)}
    {#if p.ar}<Ar text={p.ar} block />{/if}
    <span><Bidi text={p.fr} /></span>
    {#if p.source_fr && src}<small class="muted"><Bidi text={p.source_fr} /></small>{/if}
  </li>
{/snippet}

{#if fiche}
  <article class="card" data-testid="vi-fiche" data-fiche={fiche.id}>
    <h2><Bidi text={fiche.titre_fr} /></h2>
    {#if fiche.titre_ar}<Ar text={fiche.titre_ar} block />{/if}
    {#if fiche.test}<span class="soon">{t('vi.essai')}</span>{/if}
    <h3>{t('vi.situation')}</h3>
    <p><Bidi text={fiche.situation_fr} /></p>
    {#each ['avant', 'pendant', 'apres'] as const as k (k)}
      {#if fiche.etapes[k].length}
        <h3><Bidi text={t(`vi.${k}`)} /></h3>
        <ul class="pts" data-etape={k}>
          {#each fiche.etapes[k] as p, i (i)}{@render point(p, adulte)}{/each}
        </ul>
      {/if}
    {/each}
    {#if fiche.dire.length}
      <h3>{t('vi.dire')}</h3>
      <ul class="pts" data-testid="vi-dire">
        {#each fiche.dire as d, i (i)}{@render point(d, true)}{/each}
      </ul>
    {/if}
    {#if fiche.pourquoi_fr && ado}
      <h3>{t('vi.pourquoi')}</h3>
      <p><Bidi text={fiche.pourquoi_fr} /></p>
    {/if}
    {#if fiche.vraie_vie_fr && adulte}
      <h3>{t('vi.vraie_vie')}</h3>
      <p data-testid="vi-vraie-vie"><Bidi text={fiche.vraie_vie_fr} /></p>
    {/if}
    {#if fiche.situations.length && ado}
      <h3>{t('vi.que_fais_tu')}</h3>
      <div data-testid="vi-situations">
        {#each fiche.situations as s, i (i)}<details>
            <summary><Bidi text={s.question_fr} /></summary>
            <p><Bidi text={s.reponse_fr} /></p>
          </details>{/each}
      </div>
    {/if}
    {#if fiche.defi_fr}
      <p class="warnbox" data-testid="vi-fiche-defi">
        <strong>{t('vi.defi')}</strong> · <Bidi text={fiche.defi_fr} />
      </p>
    {/if}
  </article>
{:else if entry && block}
  <article class="card" data-testid="vi-entree" data-entree={entry.id}>
    <h2><Bidi text={str(block.titre_fr) || entry.titre_fr} /></h2>
    {#if str(block.titre_ar)}<Ar text={str(block.titre_ar)} block />{/if}
    <p class="muted">
      <Bidi text={t('vi.lecon', { niveau: levelLabel(entry.level), n: entry.n })} /> ·
      <a href={resolve(`/lecons/${entry.unit}` as '/')} data-testid="vi-voir-lecon"
        >{t('vi.voir_lecon')}</a
      >
    </p>
    {#if str(block.intro_fr)}<p><Bidi text={str(block.intro_fr)} /></p>{/if}
    {#each ['texte', 'points', 'etapes', 'retiens'] as k (k)}
      {#if list(block[k]).length}
        <ul class="pts" data-bloc={k}>
          {#each list(block[k]) as p, i (i)}<li class="pt">
              {@render etiquette(BOOK[p.statut ?? ''])}
              <ArFr ar={p.ar ?? ''} fr={p.fr ?? ''} verset={p.verset_tanzil} stack />
            </li>{/each}
        </ul>
      {/if}
    {/each}
    {#if ado && list(block.situations).length}
      <h3>{t('vi.que_fais_tu')}</h3>
      <div data-testid="vi-situations">
        {#each list(block.situations) as s, i (i)}
          {@const x = s as Obj}
          <details>
            <summary><Bidi text={str(x.fr)} /></summary>
            <p>
              <strong><Bidi text={t(x.bien === true ? 'vi.bien' : 'vi.pas_bien')} /></strong> ·
              <Bidi text={str(x.pourquoi_fr)} />
            </p>
          </details>{/each}
      </div>
    {/if}
    {#if madhhab}<p class="muted" data-testid="madhhab">
        <Bidi text={t(`madhhab.${madhhab}`)} />
      </p>{/if}
  </article>
{/if}

<style>
  .pts {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .pt {
    display: grid;
    gap: 4px;
    justify-items: start;
    padding: var(--space-s) 0;
    border-bottom: 1px solid var(--line);
  }
  .pt :global(.arfr) {
    justify-self: stretch;
  }
  /* étiquettes : le mot écrit TOUJOURS (jamais la couleur seule), couleurs des jetons (contrastes contrôlés) */
  .st {
    padding: 1px 10px;
    border-radius: var(--radius-pill);
    font-size: 0.8rem;
    font-weight: 800;
    background: var(--ok-bg);
    color: var(--ok-ink);
  }
  .st-obligatoire {
    background: var(--primary);
    color: var(--on-primary);
  }
  .st-permis {
    background: var(--info-bg);
    color: var(--info);
  }
  .st-deconseille {
    background: var(--warn-bg);
    color: var(--warn-ink);
  }
  .st-interdit {
    background: var(--bad-bg);
    color: var(--bad-ink);
  }
  details {
    margin: var(--space-xs) 0;
  }
</style>
