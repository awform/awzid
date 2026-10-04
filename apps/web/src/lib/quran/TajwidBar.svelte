<script lang="ts">
  import { onMount } from 'svelte';
  import { fmtNumber, t } from '$lib/i18n';
  import {
    examples,
    legendFor,
    loadTajwid,
    readTajwidPrefs,
    tajwidAllowed,
    writeTajwidPrefs,
    type TajwidPrefs,
    type TajwidSura,
  } from './tajwid';
  import TajwidRuns from './TajwidRuns.svelte';

  /**
   * Lot 29 — bouton « Tajwid en couleurs » (désactivé par défaut, réglage gardé sur l'appareil), soulignés en
   * plus des couleurs (daltonisme), légende toujours accessible (couleur, nom de la règle, exemple tiré de la
   * sourate ouverte) et crédit de la source. ABSENT hors de la riwāya Ḥafṣ. Les annotations de la sourate
   * sont chargées à la demande, seulement quand le tajwid est affiché.
   */
  let {
    riwaya,
    sura,
    verses,
    basmala,
    prefs = $bindable(readTajwidPrefs()),
    data = $bindable(null),
  }: {
    riwaya: string | null | undefined;
    sura: number;
    verses: Array<{ s: number; a: number; text: string }>;
    basmala: string;
    prefs?: TajwidPrefs;
    data?: TajwidSura | null;
  } = $props();

  const allowed = $derived(tajwidAllowed(riwaya));
  let child = $state(false);
  let failed = $state(false);
  let dialog: HTMLDialogElement | undefined = $state();

  onMount(() => {
    const read = () => (child = document.documentElement.dataset.public === 'enfant');
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-public'] });
    return () => mo.disconnect();
  });

  let seq = 0;
  $effect(() => {
    const s = sura;
    if (!allowed || !prefs.on) return;
    if (data?.s === s) return;
    const tok = ++seq;
    failed = false;
    void loadTajwid(s).then((d) => {
      if (tok !== seq) return;
      data = d;
      failed = !d;
    });
  });

  const legend = $derived(legendFor(child));
  const ex = $derived(prefs.on && data ? examples(verses, basmala, data, child) : new Map());

  function set(p: Partial<TajwidPrefs>) {
    prefs = { ...prefs, ...p };
    writeTajwidPrefs(prefs);
  }
</script>

{#snippet legende()}
  <ul class="legende" lang="fr" dir="ltr">
    {#each legend as e (e.token)}
      {@const x = ex.get(e.token)}
      <li data-legende={e.token}>
        <span class="tajwid" class:motifs={prefs.motifs}
          ><span
            class="pastille tj"
            data-tj={child ? undefined : e.token}
            data-tjf={child ? undefined : e.family}
            data-tjk={child ? e.token : undefined}
            data-tjkf={child ? e.family : undefined}
            aria-hidden="true">{' '.repeat(5)}</span
          ></span
        >
        <span class="nom">{t(e.label)}</span>
        {#if x}<span class="ex"
            ><span class="quran-text tajwid" class:motifs={prefs.motifs} lang="ar" dir="rtl"
              ><TajwidRuns runs={x.word} /></span
            >
            <span class="muted">{t('tj.verset', { n: fmtNumber(x.aya) })}</span></span
          >{:else}<span class="ex muted">{t('tj.absent')}</span>{/if}
      </li>
    {/each}
  </ul>
  <p class="muted small credit" data-testid="tajwid-credit" lang="fr" dir="ltr">
    {t('tj.credit')}
    <a href="https://github.com/cpfair/quran-tajweed" rel="noopener noreferrer" target="_blank"
      >{t('tj.source')}</a
    >
    ·
    <a
      href="https://creativecommons.org/licenses/by/4.0/deed.fr"
      rel="noopener noreferrer license"
      target="_blank">{t('tj.licence')}</a
    >
  </p>
{/snippet}

{#if allowed}
  <section class="card tjbar" data-testid="tajwid-barre">
    <div class="row">
      <button
        type="button"
        class:primary={prefs.on}
        aria-pressed={prefs.on}
        onclick={() => set({ on: !prefs.on })}
        data-testid="tajwid">{t('tj.bouton')}</button
      >
      {#if prefs.on}
        <label class="motifs-choix"
          ><input
            type="checkbox"
            checked={prefs.motifs}
            onchange={(e) => set({ motifs: e.currentTarget.checked })}
            data-testid="tajwid-motifs"
          />
          {t('tj.motifs')}</label
        >
      {/if}
    </div>
    {#if prefs.on}
      {#if failed}<p class="muted small" role="status" data-testid="tajwid-indisponible">
          {t('tj.indisponible')}
        </p>{/if}
      <details open data-testid="tajwid-legende">
        <summary>{t('tj.legende')}</summary>
        {@render legende()}
      </details>
    {/if}
  </section>
  {#if prefs.on}
    <button
      type="button"
      class="fab"
      onclick={() => dialog?.showModal()}
      data-testid="tajwid-fab"
      aria-haspopup="dialog">{t('tj.legende')}</button
    >
    <dialog bind:this={dialog} aria-labelledby="tj-dlg-titre" data-testid="tajwid-dialogue">
      <h2 id="tj-dlg-titre">{t('tj.legende')}</h2>
      {@render legende()}
      <form method="dialog"><button type="submit">{t('tj.fermer')}</button></form>
    </dialog>
  {/if}
{/if}

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-s) var(--space-m);
    align-items: center;
  }
  .motifs-choix {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    min-height: 44px;
  }
  details {
    margin-top: var(--space-s);
  }
  summary {
    cursor: pointer;
    min-height: 44px;
    display: flex;
    align-items: center;
    font-weight: 700;
  }
  .legende {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
    gap: 6px var(--space-m);
  }
  .legende li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0 10px;
    align-items: center;
  }
  /* pastille : la couleur de la règle, et dessous le souligné de sa famille (si les soulignés sont choisis) */
  .pastille {
    display: inline-block;
    position: relative;
    font-size: 1.1rem;
    line-height: 2.2;
    white-space: pre;
  }
  .pastille::before {
    content: '';
    position: absolute;
    inset: 0.35em 0 auto;
    height: 0.9em;
    border-radius: 6px;
    background: currentColor;
  }
  .nom {
    font-weight: 600;
  }
  .ex {
    grid-column: 2;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: baseline;
    font-size: 0.9rem;
  }
  .ex .quran-text {
    font-size: 1.5rem;
  }
  .credit {
    margin: var(--space-s) 0 0;
  }
  .small {
    font-size: 0.85rem;
  }
  .fab {
    position: fixed;
    inset-inline-end: 12px;
    bottom: 96px;
    z-index: 20;
    box-shadow: var(--shadow-float, 0 2px 8px rgb(0 0 0 / 0.25));
  }
  @media (min-width: 900px) {
    .fab {
      bottom: 24px;
    }
  }
  dialog {
    max-width: min(640px, calc(100vw - 32px));
    max-height: 80vh;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg, 16px);
    background: var(--card);
    color: var(--ink);
    padding: var(--space-m);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.4);
  }
  dialog h2 {
    margin-top: 0;
  }
</style>
