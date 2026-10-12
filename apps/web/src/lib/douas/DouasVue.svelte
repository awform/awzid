<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { activeProfile } from '$lib/attempts';
  import { t } from '$lib/i18n';
  import { fetchMe, type ProfileInfo } from '$lib/session';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import DouaTexte from './DouaTexte.svelte';
  import {
    forChild,
    inRubrique,
    loadDouas,
    loadFavorites,
    toggleFavorite,
    type DouasData,
  } from './douas';

  /**
   * Onglet « Douas » de « Vivre l'islam » (chargé à la demande, gardé au premier usage) : douas RETENUES par le
   * référent seulement, classées par rubriques ; pour chacune, l'arabe vocalisé sur sa ligne, le moment où on la
   * dit, la traduction (« en préparation » tant qu'elle n'est pas fournie) ; source et degré derrière « Source » ;
   * favoris sur l'appareil. Profil enfant : seulement la liste courte du quotidien, sans rubriques.
   * Aucun audio pour l'instant (l'audio humain futur aura sa place dans les données, `audio`).
   */
  let data = $state<DouasData | null>(null);
  let offline = $state(false);
  let loaded = $state(false);
  let profile = $state<ProfileInfo | null>(null);
  let favoris = $state<string[]>([]);
  let ouverte = $state<string | null>(null);
  let choix = $state<string | null>(page.url.searchParams.get('r'));

  const enfant = $derived(profile?.kind === 'enfant');
  const rubrique = $derived(
    choix === 'favoris' || data?.rubriques.some((r) => r.id === choix)
      ? choix
      : (data?.rubriques[0]?.id ?? null),
  );
  const liste = $derived<string[]>(
    !data
      ? []
      : enfant
        ? forChild(data)
        : rubrique === 'favoris'
          ? favoris.filter((id) => data!.douas[id])
          : inRubrique(data, rubrique ?? ''),
  );

  onMount(async () => {
    const me = await fetchMe().catch(() => null);
    profile =
      (await activeProfile().catch(() => null)) ??
      (me?.account.kind === 'adulte' ? (me.profiles[0] ?? null) : null);
    const [r, f] = await Promise.all([loadDouas(), loadFavorites(profile?.id ?? null)]);
    data = r.data;
    offline = r.offline;
    favoris = f;
    loaded = true;
  });

  // rubrique choisie (lien `?r=…`) : sa pastille visible dans la rangée défilante
  let cats = $state<HTMLElement | null>(null);
  $effect(() => {
    const r = rubrique;
    cats
      ?.querySelector(`[data-rubrique="${r}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  async function basculer(id: string) {
    favoris = await toggleFavorite(profile?.id ?? null, favoris, id);
  }
</script>

<p class="bandeau" role="note" data-testid="douas-bandeau">
  <Icon name="coche" size={18} />
  <span>{t('do.bandeau')}</span>
</p>

{#if !loaded}
  <Loading />
{:else if !data}
  <EmptyState icon="horsligne" title={t('do.absentes_titre')} text={t('do.absentes_texte')} />
{:else}
  {#if offline}<p class="muted small" role="status" data-testid="douas-hors-ligne">
      {t('do.hors_ligne')}
    </p>{/if}
  {#if enfant}
    <h2 class="titre-enfant">{t('do.enfant_titre')}</h2>
  {:else}
    <div
      class="cats"
      bind:this={cats}
      role="group"
      aria-label={t('do.rubriques')}
      data-testid="douas-rubriques"
    >
      <button
        type="button"
        class:on={rubrique === 'favoris'}
        aria-pressed={rubrique === 'favoris'}
        onclick={() => (choix = 'favoris')}
        data-rubrique="favoris"
        ><Icon name="etoile" size={18} />
        <Bidi text={t('do.favoris_n', { n: favoris.length })} /></button
      >
      {#each data.rubriques as r (r.id)}
        <button
          type="button"
          class:on={rubrique === r.id}
          aria-pressed={rubrique === r.id}
          onclick={() => (choix = r.id)}
          data-rubrique={r.id}><Bidi text={t(`do.r.${r.id}`)} /></button
        >
      {/each}
    </div>
    <h2 data-testid="douas-titre-rubrique">
      <Bidi text={rubrique === 'favoris' ? t('do.favoris') : t(`do.r.${rubrique}`)} />
    </h2>
  {/if}

  {#if !liste.length}
    <EmptyState icon="etoile" title={t('do.favoris_vide_titre')} text={t('do.favoris_vide')} />
  {:else}
    <ul class="liste" data-testid="douas-liste" data-enfant={enfant ? '1' : undefined}>
      {#each liste as id (id)}
        {@const d = data.douas[id]!}
        {@const fav = favoris.includes(id)}
        <li class="card doua" class:facultatif={d.facultatif} data-doua={id}>
          <h3><Bidi text={d.titre} /></h3>
          {#if d.facultatif}<span class="pill">{t('do.facultatif')}</span>{/if}
          {#if d.compagnon}<span class="pill" data-testid="douas-compagnon"
              >{t('do.compagnon')}</span
            >{/if}
          <DouaTexte doua={d} />
          <!-- audio humain futur (récitant) : `d.audio`, aucun bouton tant qu'il n'y en a pas -->
          {#if d.coran_cite}<p class="cite muted" data-testid="douas-coran-cite">
              {t('do.contient_coran')}
            </p>{/if}
          {#if d.moment}<p class="moment"><Bidi text={d.moment} /></p>{/if}
          {#if d.traduction}
            <p class="sens"><Bidi text={d.traduction} /></p>
          {:else}
            <p class="sens muted" data-testid="douas-traduction-prep">
              {t('do.traduction_prep')}
            </p>
          {/if}
          <div class="actions">
            <button
              type="button"
              class="btn-ligne"
              aria-expanded={ouverte === id}
              aria-controls={`src-${id}`}
              onclick={() => (ouverte = ouverte === id ? null : id)}
              data-testid="douas-source"><Icon name="info" size={18} /> {t('do.source')}</button
            >
            <button
              type="button"
              class="btn-ligne"
              class:on={fav}
              aria-pressed={fav}
              onclick={() => basculer(id)}
              data-testid="douas-favori"
              ><Icon name="etoile" size={18} filled={fav} />
              <Bidi text={fav ? t('do.retirer_favori') : t('do.ajouter_favori')} /></button
            >
          </div>
          {#if ouverte === id}
            <dl class="source" id={`src-${id}`} data-testid="douas-source-detail">
              {#if d.compagnon}<dd class="compagnon"><Bidi text={d.compagnon} /></dd>{/if}
              <!-- parole de Compagnon : seulement qui l'a dite et qui la rapporte, et le lien (le degré viendra
                   après vérification sur l'édition) -->
              {#if !d.compagnon}
                <dt>{t('do.recueil')}</dt>
                <dd><Bidi text={d.source.recueil} /></dd>
                {#if d.source.degre}<dt>{t('do.degre')}</dt>
                  <dd><Bidi text={d.source.degre} /></dd>{/if}
                {#if d.source.juge}<dt>{t('do.juge_par')}</dt>
                  <dd><Bidi text={d.source.juge} /></dd>{/if}
                {#if d.note}<dd class="note"><Bidi text={d.note} /></dd>{/if}
              {/if}
              {#if d.source.lien}<dd class="lien">
                  <a href={d.source.lien} target="_blank" rel="noopener noreferrer external"
                    ><Bidi text={t('do.voir_sunnah')} /></a
                  >
                </dd>{/if}
            </dl>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  .bandeau {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 var(--space-s);
    padding: 8px 12px;
    border-radius: var(--radius-md);
    background: var(--info-bg);
    color: var(--ink);
    font-size: 0.9rem;
    font-weight: 700;
  }
  .cats {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 2px 2px 6px;
    scrollbar-width: thin;
  }
  .cats button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
    min-height: 44px;
    padding: 0 14px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--ink);
    font-weight: 700;
    white-space: nowrap;
  }
  .cats button.on {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-primary);
  }
  .titre-enfant {
    margin-top: var(--space-s);
  }
  .liste {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .doua h3 {
    margin: 0;
    font-size: 1.02rem;
  }
  .doua.facultatif {
    margin-top: calc(-1 * var(--space-xs));
    border-inline-start: 4px solid var(--line);
  }
  .doua :global(.ar),
  .doua :global(.quran-text) {
    font-size: var(--ar-size);
  }
  .doua :global(.quran-text) {
    font-size: calc(var(--ar-size) + 4px);
  }
  .moment {
    margin: 0;
    font-weight: 700;
    color: var(--primary);
  }
  .sens {
    margin: 4px 0;
  }
  .cite {
    margin: 0 0 4px;
    font-size: 0.85rem;
  }
  .source .lien a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
  }
  .btn-ligne {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 12px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--ink);
    font-weight: 700;
  }
  .btn-ligne.on {
    border-color: var(--accent);
    color: var(--ink);
  }
  .source {
    margin: 8px 0 0;
    padding: 8px 12px;
    border-radius: var(--radius-md);
    background: var(--surface);
    font-size: 0.9rem;
  }
  .source dt {
    font-weight: 700;
    margin-top: 4px;
  }
  .source dd {
    margin: 0;
  }
  .source .compagnon,
  .source .note {
    margin-top: 6px;
    font-style: italic;
  }
  .pill {
    display: inline-block;
    margin: 4px 6px 0 0;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
