<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { suraName } from '@awform/hifz';
  import Ar from '$lib/Ar.svelte';
  import VerseText from '$lib/VerseText.svelte';
  import { loadMeta, loadVerses } from '$lib/hifz';
  import { fmtNumber, t } from '$lib/i18n';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import Compteur from '$lib/quotidien/Compteur.svelte';
  import QuotidienTabs from '$lib/quotidien/QuotidienTabs.svelte';
  import {
    loadAdhkar,
    type AdhkarCategory,
    type AdhkarData,
    type AdhkarItem,
  } from '$lib/quotidien/adhkar';

  /**
   * A12 — adhkār : SEULEMENT les invocations des livres gelés (texte, sens, source et degré tels quels) et les
   * récitations qu'ils recommandent (versets = texte Tanzil, aucune voix de synthèse). Compteur de répétitions.
   */
  type Verse = { s: number; a: number; text: string };
  let data = $state<AdhkarData | null>(null);
  let offline = $state(false);
  let loaded = $state(false);
  let cat = $state<AdhkarCategory>(defaultCategory(new Date()));
  let verses = $state<Record<string, Verse[]>>({});
  let basmala = $state('');
  let free = $state<number | null>(33);

  /** moment proposé selon l'heure de l'appareil (simple commodité, l'utilisateur change d'onglet) */
  function defaultCategory(d: Date): AdhkarCategory {
    const h = d.getHours();
    if (h >= 4 && h < 11) return 'matin';
    if (h >= 16 && h < 21) return 'soir';
    if (h >= 21 || h < 4) return 'coucher';
    return 'apres_priere';
  }

  const items = $derived<AdhkarItem[]>(data?.categories.find((c) => c.id === cat)?.items ?? []);
  const refKey = (s: number, from: number, to: number) => `${s}:${from}-${to}`;

  onMount(async () => {
    const r = await loadAdhkar();
    data = r.data;
    offline = r.offline;
    loaded = true;
    if (!data) return;
    const meta = await loadMeta().catch(() => null);
    basmala = meta?.basmala ?? '';
    const refs: Record<string, { s: number; from: number; to: number }> = {};
    for (const c of data.categories)
      for (const it of c.items)
        for (const x of it.recitation?.refs ?? []) refs[refKey(x.s, x.from, x.to)] = x;
    for (const [k, x] of Object.entries(refs)) {
      const v = await loadVerses(x.s, x.from, x.to).catch(() => []);
      if (v.length) verses = { ...verses, [k]: v };
    }
  });

  const CATS: readonly AdhkarCategory[] = ['matin', 'soir', 'apres_priere', 'adhan', 'coucher'];
</script>

<svelte:head><title>{t('app.nom')} — {t('qt.adhkar_titre')}</title></svelte:head>

<h1>{t('qt.titre')}</h1>
<QuotidienTabs current="adhkar" />

<div class="cats" role="tablist" aria-label={t('qt.adhkar_moments')}>
  {#each CATS as c (c)}
    <button
      type="button"
      role="tab"
      aria-selected={cat === c}
      class:on={cat === c}
      onclick={() => (cat = c)}
      data-categorie={c}><Bidi text={t(`qt.cat_${c}`)} /></button
    >
  {/each}
</div>

{#if !loaded}
  <Loading />
{:else if !data}
  <EmptyState icon="horsligne" title={t('qt.adhkar_absents')} text={t('qt.adhkar_absents_texte')} />
{:else}
  {#if offline}<p class="muted small" role="status">{t('qt.adhkar_copie')}</p>{/if}
  <ul class="liste" data-testid="qt-adhkar" data-categorie-active={cat}>
    {#each items as it (it.id)}
      <li class="card dhikr" data-dhikr={it.id}>
        {#if it.dua}
          {@const d = it.dua}
          <p class="moment">
            {#if d.moment_ar}<Ar text={d.moment_ar} sep />
            {/if}<Bidi text={d.moment_fr} />
          </p>
          {#if d.coranique}
            <Ar text={d.ar} quran tag="p" />
          {:else}
            <Ar text={d.ar} tag="p" />
          {/if}
          <p class="sens"><Bidi text={d.fr} /></p>
          <p class="ref">
            <Icon name="livres" size={16} />
            <span
              ><Bidi
                text={d.coranique ? d.ref_fr || d.source_fr : d.source_fr}
              />{#if d.grade === 'sahih'}
                · {t('rel.sahih')}{:else if d.grade === 'hasan'}
                · {t('rel.hasan')}{/if}</span
            >
          </p>
        {:else if it.recitation}
          {@const r = it.recitation}
          <p class="moment"><Bidi text={r.note_fr} /></p>
          {#each r.refs as x (x.s)}
            <div class="sourate">
              <h3>
                <Bidi
                  text={x.from === x.to
                    ? t('qt.ref_verset', { sourate: suraName(x.s), s: x.s, a: x.from })
                    : t('qt.ref_versets', { sourate: suraName(x.s), s: x.s, de: x.from, a: x.to })}
                />
              </h3>
              {#if verses[refKey(x.s, x.from, x.to)]}
                <VerseText verses={verses[refKey(x.s, x.from, x.to)]!} {basmala} />
              {:else}
                <p class="muted small">{t('qt.versets_hors_ligne')}</p>
              {/if}
            </div>
          {/each}
          <p class="ref">
            <Icon name="livres" size={16} /><span><Bidi text={r.sources.join(' ; ')} /></span>
          </p>
        {/if}
        <div class="bas">
          {#if it.repetitions && it.repetitions > 1}
            <Compteur target={it.repetitions} compact />
          {/if}
          <a class="lecon" href={resolve('/lecons/[id]', { id: it.unit })}
            ><Bidi text={t('qt.voir_lecon', { lecon: it.unit })} /></a
          >
        </div>
      </li>
    {/each}
  </ul>

  <section class="card libre" aria-labelledby="qt-libre-h">
    <h2 id="qt-libre-h"><Icon name="chapelet" size={22} /> {t('qt.compteur_libre')}</h2>
    <p class="muted small">{t('qt.compteur_libre_aide')}</p>
    <div class="cibles" role="group" aria-label={t('qt.compteur_objectif')}>
      {#each [33, 99, 100, null] as c (String(c))}
        <button type="button" class:on={free === c} onclick={() => (free = c)}
          ><Bidi text={c === null ? t('qt.compteur_sans') : fmtNumber(c)} /></button
        >
      {/each}
    </div>
    {#key free}<Compteur target={free} />{/key}
  </section>

  <p class="muted small sources"><Bidi text={t('qt.adhkar_origine')} /></p>
{/if}

<style>
  .cats {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 2px 2px 6px;
    scrollbar-width: thin;
  }
  .cats button,
  .cibles button {
    flex: 0 0 auto;
    min-height: 44px;
    padding: 0 16px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--ink);
    font-weight: 700;
    white-space: nowrap;
  }
  .cats button.on,
  .cibles button.on {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-primary);
  }
  .liste {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .dhikr :global(.ar),
  .dhikr :global(.quran-text) {
    font-size: var(--ar-size);
    line-height: 2;
    margin: 6px 0;
  }
  .moment {
    margin: 0;
    font-weight: 700;
    color: var(--primary);
  }
  .sens {
    margin: 4px 0;
  }
  .ref {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    margin: 6px 0 0;
    color: var(--ink2);
    font-size: 0.9rem;
  }
  .sourate h3 {
    font-size: 1rem;
    margin: var(--space-s) 0 0;
  }
  .bas {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .lecon {
    font-size: 0.9rem;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }
  .libre h2 {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cibles {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
