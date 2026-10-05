<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import { localeInfo, t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import type { MushafPrefs } from '../mushaf';
  import RiwayaBadge from '../RiwayaBadge.svelte';
  import { mushafChoice, MUSHAF_RIWAYAT, type MushafRiwaya } from '../riwayat';
  import type { TajwidPrefs, TajwidSura } from '../tajwid';
  import TajwidBar from '../TajwidBar.svelte';
  import { TRANSLATIONS } from '../translation';
  import Feuille from './Feuille.svelte';

  /**
   * Coran épuré — FEUILLE « Affichage » : page du Muṣḥaf ou sourate en versets, muṣḥaf (riwāya écrite en clair),
   * traduction du sens, tajwid en couleurs (Ḥafṣ), mémoriser (masquer peu à peu), lecture seule, une page.
   */
  let {
    open = $bindable(false),
    prefs = $bindable(),
    tjPrefs = $bindable(),
    tjData = $bindable(null),
    rw,
    wide,
    sura,
    verses,
    basmala,
    onriwaya,
    onmemo,
    guide = $bindable({ repeat: 3, pause: 3 }),
    onguide,
  }: {
    /** lecture guidée mot à mot SANS SON (Ḥafṣ) : nombre de tours, pause « à toi » en secondes */
    guide?: { repeat: number; pause: number };
    onguide: () => void;
    open?: boolean;
    prefs: MushafPrefs;
    tjPrefs: TajwidPrefs;
    tjData?: TajwidSura | null;
    rw: MushafRiwaya;
    wide: boolean;
    sura: number;
    verses: Array<{ s: number; a: number; text: string }>;
    basmala: string;
    onriwaya: (m: MushafRiwaya) => void;
    onmemo: (level: number) => void;
  } = $props();
  const hafs = $derived(rw === 'hafs');
  const VUES = ['page', 'versets'] as const;
</script>

<Feuille id="affichage" title={t('cl.affichage')} bind:open testid="affichage">
  <div class="seg" role="radiogroup" aria-label={t('cl.vue')}>
    {#each VUES as v (v)}
      <label class:on={prefs.vue === v}
        ><input
          type="radio"
          name="vue"
          value={v}
          bind:group={prefs.vue}
          data-testid={`vue-${v}`}
        /><Icon name={v === 'page' ? 'mushaf' : 'lire'} size={20} /><Bidi
          text={t(`cl.vue_${v}`)}
        /></label
      >
    {/each}
  </div>

  <div class="field">
    <label for="choix-mushaf">{t('rw.mushaf_affiche')}</label>
    <select
      id="choix-mushaf"
      value={rw}
      onchange={(e) => onriwaya(e.currentTarget.value as MushafRiwaya)}
      disabled={prefs.memo > 0}
      data-testid="choix-mushaf"
    >
      {#each MUSHAF_RIWAYAT as m (m.key)}<option value={m.key}
          >{localeInfo().code === 'ar' ? m.ar : m.fr}</option
        >{/each}
    </select>
    <span><RiwayaBadge riwaya={rw} label={mushafChoice(rw).fr} /></span>
    {#if prefs.memo > 0}<p class="muted small">{t('cl.memo_hafs')}</p>{/if}
  </div>

  {#if hafs}
    <div class="field">
      <label for="mp-traduction">{t('mp.traduction')}</label>
      <select
        id="mp-traduction"
        value={prefs.showTrad ? prefs.translation : ''}
        onchange={(e) => {
          const v = e.currentTarget.value;
          prefs.showTrad = !!v;
          if (v) prefs.translation = v;
        }}
        data-testid="mp-traduction"
      >
        <option value="">{t('mp.sans_traduction')}</option>
        {#each TRANSLATIONS as x (x.key)}<option value={x.key}>{t(x.label)}</option>{/each}
      </select>
    </div>
    <TajwidBar
      riwaya={rw}
      {sura}
      {verses}
      {basmala}
      bind:prefs={tjPrefs}
      bind:data={tjData}
      compact
    />
  {:else}
    <p class="muted small" data-testid="mp-hafs-seulement">
      <Bidi text={t('rw.hafs_seulement')} />
    </p>
  {/if}

  <fieldset class="masks">
    <legend>{t('cl.memoriser')}</legend>
    {#each [0, 1, 2, 3] as n (n)}
      <label class="mask" class:on={prefs.memo === n}
        ><input
          type="radio"
          name="masque"
          checked={prefs.memo === n}
          onchange={() => onmemo(n)}
          data-mask={n}
        /><Bidi text={t(`ca.masque_${n}`)} /></label
      >
    {/each}
  </fieldset>

  <label class="check"
    ><input type="checkbox" bind:checked={prefs.readOnly} data-testid="mp-lecture-seule" />
    {t('mp.lecture_seule')}</label
  >
  {#if wide && prefs.vue === 'page'}
    <label class="check"
      ><input type="checkbox" bind:checked={prefs.single} data-testid="mp-vue-mobile" />
      {t('mp.vue_mobile')}</label
    >
  {/if}
  {#if hafs}
    <details class="guide">
      <summary>{t('cl.guidage')}</summary>
      <p class="muted small"><Bidi text={t('cl.guidage_aide')} /></p>
      <div class="pair">
        <label
          >{t('lecteur.repeter')}
          <input
            type="number"
            min="1"
            max="20"
            bind:value={guide.repeat}
            data-testid="repeter"
          /></label
        >
        <label
          >{t('lecteur.pause')}
          <input
            type="number"
            min="0"
            max="30"
            bind:value={guide.pause}
            data-testid="pause"
          /></label
        >
      </div>
      <button type="button" class="go" onclick={onguide} data-testid="lire"
        >{t('lecteur.lire')}</button
      >
    </details>
  {/if}
  <p class="links">
    <a href={resolve('/hifz')} data-testid="lien-carnet">{t('cl.carnet')}</a>
    <a href={resolve('/coran/recitateurs')}>{t('ca.onglet_recitateurs')}</a>
  </p>
</Feuille>

<style>
  .seg {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 4px;
    margin-bottom: 12px;
    background: var(--surface);
    border-radius: var(--radius-pill);
  }
  .seg label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    font-weight: 700;
    color: var(--ink2);
    border-radius: var(--radius-pill);
    cursor: pointer;
  }
  .seg label.on {
    color: var(--or-ink);
    background: var(--or-soft);
    box-shadow: inset 0 0 0 1px var(--or-line);
  }
  .seg input,
  .mask input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .seg label:has(input:focus-visible),
  .mask:has(input:focus-visible) {
    outline: 3px solid var(--focus);
  }
  .field {
    display: grid;
    gap: 4px;
    margin-bottom: 10px;
  }
  .field label {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--ink2);
  }
  select {
    font: inherit;
    min-height: var(--target);
  }
  .masks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 10px 0;
    padding: 0;
    border: 0;
  }
  .masks legend {
    margin-bottom: 6px;
    font-weight: 700;
  }
  .mask {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 12px;
    font-size: 0.9rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    cursor: pointer;
  }
  .mask.on {
    font-weight: 700;
    color: var(--or-ink);
    background: var(--or-soft);
    border-color: var(--or-line);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
  }
  .guide summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    font-weight: 700;
    cursor: pointer;
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 8px;
  }
  .pair label {
    display: grid;
    gap: 2px;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--ink2);
  }
  .pair input {
    font: inherit;
    min-height: var(--target);
  }
  .go {
    color: var(--on-primary);
    background: var(--primary);
    border-color: var(--primary);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin: 12px 0 0;
    font-size: 0.9rem;
  }
  .small {
    font-size: 0.85rem;
  }
</style>
