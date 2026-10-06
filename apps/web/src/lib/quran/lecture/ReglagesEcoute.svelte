<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import { suraName } from '@awform/hifz';
  import type { Reciter, SuraPack } from '$lib/coran-audio';
  import { fmtBytes, fmtNumber, t } from '$lib/i18n';
  import { PRESETS, type PresetId, type Range } from '../lecture';
  import type { MushafPrefs } from '../mushaf';
  import { fmtDuration, isHafs, SLEEP_CHOICES } from '../player';
  import RiwayaBadge from '../RiwayaBadge.svelte';
  import { isMushafRiwaya, mushafChoice, type MushafRiwaya } from '../riwayat';
  import Feuille from './Feuille.svelte';

  /**
   * Coran épuré — FEUILLE « Réglages d'écoute » (icône répétition de la mini-barre) : préréglages simples
   * d'abord, puis les réglages avancés (récitateur, plage du / au, répétitions du verset et de la plage, vitesse,
   * arrêt automatique, mémoriser), la sourate gardée hors ligne et les crédits. Aucune perte de fonction par
   * rapport à l'ancien écran « Écouter ».
   */
  let {
    open = $bindable(false),
    prefs = $bindable(),
    reciters,
    reciterId,
    conseil,
    restreint,
    rw,
    range,
    length,
    preset,
    pack,
    trackMsg,
    saved,
    wifi,
    progress,
    offMsg,
    portion,
    onreciter,
    onpreset,
    onrange,
    onkeep,
    ondrop,
    onwifi,
    onriwaya,
    onportion,
  }: {
    open?: boolean;
    prefs: MushafPrefs;
    reciters: Reciter[];
    reciterId: string | null;
    conseil: string | null;
    restreint: boolean;
    /** muṣḥaf affiché */
    rw: MushafRiwaya;
    range: Range;
    /** nombre de versets de la sourate écoutée */
    length: number;
    preset: PresetId | null;
    pack: SuraPack | null;
    trackMsg: string;
    saved: boolean;
    wifi: boolean;
    progress: { n: number; total: number } | null;
    offMsg: string;
    /** portion du jour du carnet de hifẓ (mémoriser), si elle existe */
    portion: Range | null;
    onreciter: (id: string) => void;
    onpreset: (id: PresetId) => void;
    onrange: (from: number, to: number) => void;
    onkeep: () => void;
    ondrop: () => void;
    onwifi: (on: boolean) => void;
    onriwaya: (m: MushafRiwaya) => void;
    onportion: () => void;
  } = $props();

  const reciter = $derived(reciters.find((r) => r.id === reciterId) ?? null);
</script>

<Feuille id="reglages" title={t('cl.reglages_ecoute')} bind:open testid="reglages-ecoute">
  <p class="where muted" data-testid="plage-ecoute">
    <Bidi text={t('cl.plage', { sourate: suraName(range.s), de: range.from, a: range.to })} />
  </p>

  <fieldset class="presets">
    <legend>{t('cl.prereglages')}</legend>
    {#each PRESETS as p (p.id)}
      <label class="preset" class:on={preset === p.id}
        ><input
          type="radio"
          name="preset"
          checked={preset === p.id}
          onchange={() => onpreset(p.id)}
          data-preset={p.id}
        /><Bidi text={t(`cl.preset_${p.id}`)} /></label
      >
    {/each}
    {#if portion}
      <button type="button" class="portion" onclick={onportion} data-testid="portion-carnet"
        ><Bidi
          text={t('cl.portion_du_jour', {
            sourate: suraName(portion.s),
            de: portion.from,
            a: portion.to,
          })}
        /></button
      >
    {/if}
  </fieldset>

  <div class="field">
    <label for="cl-recitateur">{t('ca.recitateur')}</label>
    <select
      id="cl-recitateur"
      value={reciterId ?? ''}
      onchange={(e) => onreciter(e.currentTarget.value)}
      disabled={!reciters.length}
      data-testid="choix-recitateur"
    >
      {#if !reciters.length}<option value="">{t('mp.aucun_recitateur')}</option>{/if}
      {#each reciters as r (r.id)}<option value={r.id}
          >{r.nameFr} — {r.riwayaFr}{r.id === conseil ? ` · ${t('ca.conseil_court')}` : ''}</option
        >{/each}
    </select>
  </div>
  {#if reciter}
    <p class="badges">
      <RiwayaBadge riwaya={reciter.riwaya} label={reciter.riwayaFr} />
      {#if restreint}<span class="pill">{t('ca.liste_restreinte')}</span>{/if}
    </p>
    {#if reciter.riwaya !== rw}
      <p class="warnbox" data-testid="autre-riwaya">
        <Bidi
          text={rw === 'hafs'
            ? t('ca.autre_riwaya_texte', { riwaya: reciter.riwayaFr })
            : t('rw.autre_texte', { riwaya: reciter.riwayaFr, texte: mushafChoice(rw).fr })}
        />
        {#if isMushafRiwaya(reciter.riwaya)}<button
            type="button"
            class="link"
            onclick={() => onriwaya(reciter.riwaya as MushafRiwaya)}
            data-testid="voir-riwaya"
            ><Bidi text={t('rw.voir_texte', { riwaya: reciter.riwayaFr })} /></button
          >{/if}
      </p>
    {:else if !isHafs(reciter.riwaya)}
      <p class="muted small" data-testid="meme-riwaya">
        <Bidi text={t('rw.meme_riwaya', { riwaya: reciter.riwayaFr })} />
      </p>
    {/if}
  {/if}
  {#if trackMsg}<p class="warnbox" role="status"><Bidi text={trackMsg} /></p>{/if}
  {#if pack?.mode === 'sourate'}<p class="muted small" data-testid="sourate-entiere">
      {t('ca.sourate_entiere')}
    </p>{/if}

  <details class="adv" open>
    <summary>{t('cl.avances')}</summary>
    <div class="grid">
      <div class="field">
        <label for="cl-de">{t('ca.du_verset')}</label>
        <input
          id="cl-de"
          type="number"
          min="1"
          max={length}
          value={range.from}
          onchange={(e) => onrange(Number(e.currentTarget.value), range.to)}
          data-testid="de"
        />
      </div>
      <div class="field">
        <label for="cl-au">{t('ca.au_verset')}</label>
        <input
          id="cl-au"
          type="number"
          min={range.from}
          max={length}
          value={range.to}
          onchange={(e) => onrange(range.from, Number(e.currentTarget.value))}
          data-testid="au"
        />
      </div>
      {#if prefs.chain}
        <div class="field">
          <label for="cl-rn">{t('ca.ecoutes_nouveau')}</label>
          <input
            id="cl-rn"
            type="number"
            min="1"
            max="20"
            bind:value={prefs.repeatNew}
            data-testid="repeter-nouveau"
          />
        </div>
        <div class="field">
          <label for="cl-rc">{t('ca.enchainements')}</label>
          <input
            id="cl-rc"
            type="number"
            min="0"
            max="10"
            bind:value={prefs.repeatChain}
            data-testid="enchainements"
          />
        </div>
      {:else}
        <div class="field">
          <label for="cl-rv">{t('ca.repeter_verset')}</label>
          <input
            id="cl-rv"
            type="number"
            min="1"
            max="20"
            bind:value={prefs.repeatVerse}
            data-testid="repeter-verset"
          />
        </div>
        <div class="field">
          <label for="cl-rr">{t('ca.repeter_plage')}</label>
          <input
            id="cl-rr"
            type="number"
            min="1"
            max="20"
            bind:value={prefs.repeatRange}
            data-testid="repeter-plage"
          />
        </div>
      {/if}
      <div class="field">
        <label for="cl-vitesse">{t('ca.vitesse')}</label>
        <select id="cl-vitesse" bind:value={prefs.rate} data-testid="vitesse">
          {#each [0.5, 0.75, 1, 1.25, 1.5] as v (v)}<option value={v}>{fmtNumber(v)}×</option
            >{/each}
        </select>
      </div>
      <div class="field">
        <label for="cl-minuterie">{t('ca.minuterie')}</label>
        <select id="cl-minuterie" bind:value={prefs.sleepMin} data-testid="minuterie">
          {#each SLEEP_CHOICES as m (m)}<option value={m}
              >{m ? t('ca.minutes', { n: m }) : t('ca.sans_minuterie')}</option
            >{/each}
        </select>
      </div>
    </div>
    <label class="check"
      ><input type="checkbox" bind:checked={prefs.chain} data-testid="mode-enchainer" />
      <Bidi text={t('cl.enchainer')} /></label
    >
  </details>

  {#if pack}
    <section class="off" data-testid="hors-ligne-sourate">
      <h3>{t('ca.garder_titre')}</h3>
      <p class="muted small">
        <Bidi
          text={t('ca.garder_texte', {
            taille: fmtBytes(pack.bytes),
            duree: fmtDuration(pack.durationMs),
          })}
        />
      </p>
      <label class="check"
        ><input
          type="checkbox"
          checked={wifi}
          onchange={(e) => onwifi(e.currentTarget.checked)}
          data-testid="wifi-seulement"
        />
        {t('ca.wifi_seulement')}</label
      >
      {#if saved}
        <p class="ok-line" data-testid="sur-appareil">{t('ca.sur_appareil')}</p>
        <button type="button" onclick={ondrop} data-testid="supprimer-sourate"
          >{t('ca.supprimer')}</button
        >
      {:else if progress}
        <p role="status">
          <Bidi text={t('ca.telechargement', { n: progress.n, total: progress.total })} />
        </p>
      {:else}
        <button type="button" onclick={onkeep} data-testid="garder-sourate">{t('ca.garder')}</button
        >
      {/if}
      {#if offMsg}<p class="muted" role="status"><Bidi text={offMsg} /></p>{/if}
    </section>
  {/if}

  {#if reciter}
    <p class="credit muted small" data-testid="credit">
      <Bidi text={pack?.credit ?? reciter.credit} /><br /><Bidi
        text={t('ca.licence', { source: reciter.license.source })}
      />
      {#if reciter.creditAr}<br /><span lang="ar" dir="rtl" data-testid="credit-ar"
          ><Bidi text={reciter.creditAr} base="ar" /></span
        >{/if}
      {#if reciter.usageNote}<br /><span data-testid="usage-note"
          ><Bidi text={reciter.usageNote} /></span
        >{/if}
    </p>
  {/if}
  <p class="small">
    <a href={resolve('/coran/recitateurs')} data-testid="lien-recitateurs"
      >{t('cl.tous_recitateurs')}</a
    >
  </p>
</Feuille>

<style>
  .where {
    margin: 0 0 8px;
  }
  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0 0 12px;
    padding: 0;
    border: 0;
  }
  .presets legend {
    margin-bottom: 6px;
    font-weight: 700;
    font-size: 0.9rem;
  }
  .preset {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 14px;
    font-size: 0.92rem;
    color: var(--mp-green);
    background: var(--mp-mint);
    border: 1px solid var(--mp-mint2);
    border-radius: var(--radius-pill);
    cursor: pointer;
  }
  .preset.on {
    font-weight: 700;
    color: var(--or-ink);
    background: var(--or-soft);
    border-color: var(--or-line);
  }
  .preset input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .preset:has(input:focus-visible) {
    outline: 3px solid var(--focus);
  }
  .portion {
    min-height: 44px;
    color: var(--on-primary);
    background: var(--primary);
    border-color: var(--primary);
    border-radius: var(--radius-pill);
  }
  .field {
    display: grid;
    gap: 4px;
    margin-bottom: 8px;
  }
  .field label {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--ink2);
  }
  .field select,
  .field input {
    width: 100%;
    font: inherit;
    min-height: var(--target);
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0 0 8px;
  }
  .adv {
    margin: 8px 0;
  }
  .adv summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    font-weight: 700;
    cursor: pointer;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 12px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
  }
  .off {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }
  .off h3 {
    margin: 0 0 4px;
    font-size: 1rem;
  }
  .ok-line {
    color: var(--ok-ink);
    font-weight: 700;
  }
  .credit {
    margin-top: 12px;
  }
  .small {
    font-size: 0.85rem;
  }
  .link {
    min-height: 0;
    padding: 0;
    color: var(--primary);
    background: none;
    border: 0;
    text-decoration: underline;
  }
</style>
