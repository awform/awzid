<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { fn } from '$lib/fonctions.svelte';
  import { setContext } from 'svelte';
  import { resolve } from '$app/paths';
  import {
    ficheDefi,
    pointText,
    situationFor,
    statutLabel,
    verseRef,
    type FicheDire,
    type FichePoint,
    type Statut,
  } from '@awform/content/adab';
  import Ar from '$lib/Ar.svelte';
  import ArFr from '$lib/ArFr.svelte';
  import Ecouter from '$lib/Ecouter.svelte';
  import { t } from '$lib/i18n';
  import { AUDIO_CTX, levelAudio, type LevelAudio } from '$lib/lecons-audio';
  import { levelLabel } from '$lib/levels';
  import VersetBloc from '$lib/quran/VersetBloc.svelte';
  import type { AdabEntry, Fiche, Kind } from './vivre';

  /**
   * A37 — une fiche du livret « Bon comportement » (format des livres B9) ou une rubrique d'un livre.
   * Fiche : situation, étapes avant / pendant / après — chaque point avec son ÉTIQUETTE (cinq statuts religieux,
   * « Recommandé · sunna » pour `force: forte`, « À éviter — … » pour une conduite à éviter, pastille neutre
   * « Conseil » sans statut religieux) —, ce qu'on dit (arabe sur sa ligne, traduction dessous, source ; verset en
   * bloc, récitant humain seulement), pourquoi, attention, dans la vraie vie (pays de l'utilisateur), religion ou
   * coutume, défi. Texte de chaque point selon l'âge (`enfant_fr`, `ado_fr`, `adulte_fr`). Enfants : l'essentiel ;
   * ados : + notes ; adultes : tout (+ sources).
   * Audio : seulement les textes arabes non coraniques des fiches (niveaux « akhlaq-enf » et « akhlaq »).
   */
  type Obj = Record<string, unknown>;
  type Pt = { ar?: string; fr?: string; verset_tanzil?: unknown; statut?: string };
  let {
    fiche = null,
    entry = null,
    block = null,
    madhhab = null,
    kind,
    pays = null,
    titres = {},
  }: {
    fiche?: Fiche | null;
    entry?: AdabEntry | null;
    block?: Obj | null;
    madhhab?: string | null;
    kind: Kind | null;
    pays?: string | null;
    titres?: Record<string, string>;
  } = $props();

  const enfant = $derived(kind === 'enfant');
  const adulte = $derived(kind !== 'enfant' && kind !== 'ado');
  let audio = $state<LevelAudio | null>(null);
  setContext(AUDIO_CTX, () => audio);
  $effect(() => {
    if (!fiche) return;
    void levelAudio(fiche.ages.includes('enfant') ? 'akhlaq-enf' : 'akhlaq').then(
      (a) => (audio = a),
    );
  });
  const dires = $derived(
    (fiche?.dire ?? []).filter((d) => !kind || !d.ages || d.ages.includes(kind)),
  );
  const vie = $derived(
    (fiche?.vraie_vie ?? []).filter(
      (v) => v.pays.includes('tous') || (!!pays && v.pays.includes(pays)),
    ),
  );
  const defi = $derived(fiche ? ficheDefi(fiche, kind) : null);
  // statuts des étapes des livres de religion → étiquettes communes ; le terme du livre reste en précision
  const BOOK: Record<string, Statut> = {
    fard: 'obligatoire',
    sunna: 'recommande',
    mustahabb: 'recommande',
    fadila: 'recommande',
  };
  const PRECISION: Record<string, string> = {
    sunna: 'sunna',
    mustahabb: 'mustaḥabb',
    fadila: 'faḍīla',
  };
  const list = (x: unknown) => (Array.isArray(x) ? (x as Pt[]) : []);
  const str = (x: unknown) => (typeof x === 'string' ? x : '');
  const verse = (d: FicheDire) => {
    const r = verseRef(d.src);
    return r ? { i: 0, j: d.ar.length, ...r, ref: t('vi.coran_ref', { ref: d.src ?? '' }) } : null;
  };
</script>

{#snippet etiquette(s: Statut | undefined, precision = '', eviter = false)}
  {#if s}<span class="st st-{s}" data-statut={s}
      ><Bidi
        text={eviter ? `${t('vi.a_eviter')} — ${t(`vi.statut.${s}`)}` : t(`vi.statut.${s}`)}
      />{#if precision}<small class="prec" data-precision><Bidi text={`· ${precision}`} /></small
        >{/if}</span
    >{/if}
{/snippet}

{#snippet point(p: FichePoint)}
  {@const txt = pointText(p, kind)}
  {#if txt}
    {@const l = statutLabel(p)}
    <li class="pt" data-point={p.id}>
      {@render etiquette(l.statut, l.precision ?? '', l.eviter)}
      <span><Bidi text={txt} /></span>
      {#if p.note_fr && !enfant}<small class="muted"><Bidi text={p.note_fr} /></small>{/if}
      {#if p.sources_fr?.length && adulte}<small class="muted src"
          ><Bidi text={p.sources_fr.join(' · ')} /></small
        >{/if}
    </li>
  {/if}
{/snippet}

{#if fiche}
  <article class="card" data-testid="vi-fiche" data-fiche={fiche.id}>
    <h2><Bidi text={fiche.titre_fr} /></h2>
    {#if fiche.titre_ar}<div class="tar">
        <Ar text={fiche.titre_ar} block /><Ecouter text={fiche.titre_ar} small />
      </div>{/if}
    {#if fiche.test}<span class="soon">{t('vi.essai')}</span>{/if}
    <h3>{t('vi.situation')}</h3>
    <p data-testid="vi-situation"><Bidi text={situationFor(fiche, kind)} /></p>
    {#each ['avant', 'pendant', 'apres'] as const as k (k)}
      {#if fiche.etapes[k].some((p) => pointText(p, kind))}
        <h3><Bidi text={t(`vi.${k}`)} /></h3>
        <ul class="pts" data-etape={k}>
          {#each fiche.etapes[k] as p (p.id)}{@render point(p)}{/each}
        </ul>
      {/if}
    {/each}
    {#each ['dire', 'rappel'] as const as role (role)}
      {@const ds = dires.filter((d) => d.role === role)}
      {#if ds.length}
        <h3><Bidi text={t(role === 'dire' ? 'vi.dire' : 'vi.retenir')} /></h3>
        <ul class="pts" data-testid={role === 'dire' ? 'vi-dire' : 'vi-rappel'}>
          {#each ds as d (d.id)}
            {@const sens = enfant ? (d.enfant_fr ?? d.fr) : d.fr}
            {@const m = d.type === 'coran' ? verse(d) : null}
            <li class="pt" data-dire={d.type}>
              {#if m}
                <!-- verset : bloc du Muṣḥaf (texte Tanzil des livres), récitant humain, jamais de synthèse -->
                <VersetBloc ar={d.ar} {m} fr={sens} />
              {:else}
                <span class="ligne"><Ar text={d.ar} block /><Ecouter text={d.ar} small /></span>
                <span><Bidi text={sens} /></span>
                {#if d.source_fr}<small class="muted"><Bidi text={d.source_fr} /></small>{/if}
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    {/each}
    {#if enfant ? (fiche.pourquoi_enfant_fr ?? fiche.pourquoi_fr) : fiche.pourquoi_fr}
      <h3>{t('vi.pourquoi')}</h3>
      <p><Bidi text={(enfant ? fiche.pourquoi_enfant_fr : null) ?? fiche.pourquoi_fr ?? ''} /></p>
    {/if}
    {#if fiche.attention_fr && !enfant}
      <p class="card bad" data-testid="vi-attention">
        <strong>{t('vi.attention')}</strong> · <Bidi text={fiche.attention_fr} />
      </p>
    {/if}
    {#if vie.length && !enfant}
      <h3>{t('vi.vraie_vie')}</h3>
      <ul class="pts" data-testid="vi-vraie-vie">
        {#each vie as v, i (i)}<li class="pt"><Bidi text={v.fr} /></li>{/each}
      </ul>
    {/if}
    {#if fiche.religion_coutume_fr && adulte}
      <h3>{t('vi.religion_coutume')}</h3>
      <p data-testid="vi-religion-coutume"><Bidi text={fiche.religion_coutume_fr} /></p>
    {/if}
    {#if defi && fn('vivre_defi')}
      <p class="warnbox" data-testid="vi-fiche-defi">
        <strong>{t('vi.defi')}</strong> · <Bidi text={defi} />
      </p>
    {/if}
    {#if fiche.liens.fiches.some((id) => titres[id]) && !enfant}
      <h3>{t('vi.fiches_liees')}</h3>
      <p class="liens">
        {#each fiche.liens.fiches.filter((id) => titres[id]) as id (id)}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- vue de la même page /vivre -->
          <a href={`?f=${id}`} data-lien={id}><Bidi text={titres[id]!} /></a>
        {/each}
      </p>
    {/if}
  </article>
{:else if entry && block}
  <article class="card" data-testid="vi-entree" data-entree={entry.id}>
    <h2><Bidi text={str(block.titre_fr) || entry.titre_fr} /></h2>
    {#if str(block.titre_ar)}<Ar text={str(block.titre_ar)} block />{/if}
    <p class="muted">
      <Bidi
        text={t(entry.bilan ? 'vi.bilan' : 'vi.lecon', {
          niveau: levelLabel(entry.level),
          n: entry.n,
        })}
      /> ·
      <a href={resolve(`/lecons/${entry.unit}` as '/')} data-testid="vi-voir-lecon"
        >{t('vi.voir_lecon')}</a
      >
    </p>
    {#if str(block.intro_fr)}<p><Bidi text={str(block.intro_fr)} /></p>{/if}
    {#each ['texte', 'points', 'etapes', 'retiens'] as k (k)}
      {#if list(block[k]).length}
        <ul class="pts" data-bloc={k}>
          {#each list(block[k]) as p, i (i)}<li class="pt">
              {@render etiquette(BOOK[p.statut ?? ''], PRECISION[p.statut ?? ''] ?? '')}
              <ArFr ar={p.ar ?? ''} fr={p.fr ?? ''} verset={p.verset_tanzil} stack />
            </li>{/each}
        </ul>
      {/if}
    {/each}
    {#if !enfant && list(block.situations).length}
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
    {#if entry.fiches?.some((id) => titres[id])}
      <h3>{t('vi.fiches_liees')}</h3>
      <p class="liens">
        {#each entry.fiches.filter((id) => titres[id]) as id (id)}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- vue de la même page /vivre -->
          <a href={`?f=${id}`} data-lien={id}><Bidi text={titres[id]!} /></a>
        {/each}
      </p>
    {/if}
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
  .pt :global(.arfr),
  .pt :global(.verset-bloc),
  .ligne {
    justify-self: stretch;
  }
  .ligne,
  .tar {
    display: flex;
    align-items: center;
    gap: var(--space-s);
  }
  .ligne :global([lang='ar']),
  .tar :global([lang='ar']) {
    flex: 1;
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
  /* conseil pratique : pastille NEUTRE, sans couleur religieuse */
  .st-conseil {
    background: var(--surface);
    color: var(--ink);
    font-weight: 700;
  }
  .prec {
    margin-inline-start: 4px;
    font-weight: 600;
    font-size: 0.75rem;
  }
  .src {
    font-size: 0.8rem;
  }
  .liens {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-s);
  }
  details {
    margin: var(--space-xs) 0;
  }
</style>
