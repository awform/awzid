<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import { suraName } from '@awform/hifz';
  import type { Reciter, SuraPack } from '$lib/coran-audio';
  import { fmtBytes, fmtNumber, localeInfo, t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { PRESETS, type PresetId, type Range } from '../lecture';
  import type { MushafPrefs } from '../mushaf';
  import { fmtDuration, isHafs, SLEEP_CHOICES } from '../player';
  import RiwayaBadge from '../RiwayaBadge.svelte';
  import { mushafChoice, MUSHAF_RIWAYAT, type MushafRiwaya } from '../riwayat';
  import type { TajwidPrefs, TajwidSura } from '../tajwid';
  import TajwidBar from '../TajwidBar.svelte';
  import { TRANSLATIONS } from '../translation';

  /**
   * Corrections du 06/10/2026 — panneau UNIQUE « Réglages » du lecteur (contenu de la feuille) : tout au même
   * endroit, en sections nommées en toutes lettres, avec des sauts vers chacune : Écoute (préréglages, plage,
   * répétitions, vitesse, arrêt automatique), Récitateur (groupés par riwāya, ceux « en ligne » étiquetés ; le
   * muṣḥaf suit la riwāya du récitateur), Muṣḥaf (style de page : Médine à l'identique OU notre muṣḥaf habituel,
   * choix gardé ; riwāyāt décrites comme la liste des récitateurs), Affichage (vue, taille du texte, lecture
   * seule, une page), Traduction, Tajwid, Mémoriser (masquage, lecture guidée sans son), Hors ligne.
   * Remplace les feuilles « Réglages d'écoute » et « Affichage » (aucune perte de fonction).
   */
  let {
    prefs = $bindable(),
    tjPrefs = $bindable(),
    tjData = $bindable(null),
    guide = $bindable({ repeat: 3, pause: 3 }),
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
    wide,
    sura,
    verses,
    basmala,
    exactPages,
    onreciter,
    onpreset,
    onrange,
    onkeep,
    ondrop,
    onwifi,
    onportion,
    onriwaya,
    onmemo,
    onguide,
  }: {
    prefs: MushafPrefs;
    tjPrefs: TajwidPrefs;
    tjData?: TajwidSura | null;
    /** lecture guidée mot à mot SANS SON (Ḥafṣ) : nombre de tours, pause « à toi » en secondes */
    guide?: { repeat: number; pause: number };
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
    wide: boolean;
    sura: number;
    verses: Array<{ s: number; a: number; text: string }>;
    basmala: string;
    /** nombre de pages disponibles « à l'identique » sur ce serveur (0 : aucune) */
    exactPages: number;
    onreciter: (id: string) => void;
    onpreset: (id: PresetId) => void;
    onrange: (from: number, to: number) => void;
    onkeep: () => void;
    ondrop: () => void;
    onwifi: (on: boolean) => void;
    onportion: () => void;
    onriwaya: (m: MushafRiwaya) => void;
    onmemo: (level: number) => void;
    onguide: () => void;
  } = $props();

  const reciter = $derived(reciters.find((r) => r.id === reciterId) ?? null);
  /** récitateurs : ceux de la riwāya du muṣḥaf affiché d'abord (la riwāya est écrite dans chaque ligne) */
  const sorted = $derived(
    [...reciters].sort((a, b) => Number(b.riwaya === rw) - Number(a.riwaya === rw)),
  );
  const online = (r: Reciter) => r.enLigne === true;
  const reciterCount = (k: string) => reciters.filter((r) => r.riwaya === k).length;
  const hafs = $derived(rw === 'hafs');
  const VUES = ['page', 'versets'] as const;
  const STYLES = ['exact', 'fluide'] as const;
  const ar = $derived(localeInfo().code === 'ar');
  const SAUTS = [
    ['ecoute', 'cl.sec_ecoute'],
    ['recitateur', 'cl.sec_recitateur'],
    ['mushaf', 'cl.sec_mushaf'],
    ['affichage', 'cl.affichage'],
    ['traduction', 'mp.traduction'],
    ['memoriser', 'cl.memoriser'],
    ['horsligne', 'cl.sec_horsligne'],
  ] as const;
</script>

<nav class="sauts">
  {#each SAUTS as [id, k] (id)}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- ancre dans le panneau -->
    <a class="saut" href={`#reg-${id}`}><Bidi text={t(k)} /></a>
  {/each}
</nav>

<section class="sec" id="reg-ecoute" data-testid="reglages-ecoute">
  <h3><Icon name="repeter" size={20} />{t('cl.sec_ecoute')}</h3>
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
</section>

<section class="sec" id="reg-recitateur" data-testid="reglages-recitateur">
  <h3><Icon name="casque" size={20} />{t('cl.sec_recitateur')}</h3>
  <div class="field">
    <label for="cl-recitateur">{t('ca.recitateur')}</label>
    <select
      id="cl-recitateur"
      value={reciterId ?? ''}
      onchange={(e) => onreciter(e.currentTarget.value)}
      disabled={!reciters.length}
      data-testid="choix-recitateur"
    >
      {#if !reciter}<option value="">{t('mp.aucun_recitateur')}</option>{/if}
      {#each sorted as r (r.id)}<option value={r.id}
          >{r.nameFr} — {r.riwayaFr}{online(r) ? ` · ${t('cl.en_ligne')}` : ''}{r.id === conseil
            ? ` · ${t('ca.conseil_court')}`
            : ''}</option
        >{/each}
    </select>
  </div>
  {#if reciter}
    <p class="badges">
      <RiwayaBadge riwaya={reciter.riwaya} label={reciter.riwayaFr} />
      {#if online(reciter)}<span class="pill" data-testid="recitateur-en-ligne"
          >{t('cl.en_ligne')}</span
        >{/if}
      {#if restreint}<span class="pill">{t('ca.liste_restreinte')}</span>{/if}
    </p>
    <!-- le récitateur est toujours de la riwāya du muṣḥaf affiché (plus d'état « autre riwāya ») -->
    {#if !isHafs(reciter.riwaya)}
      <p class="muted small" data-testid="meme-riwaya">
        <Bidi text={t('rw.meme_riwaya', { riwaya: reciter.riwayaFr })} />
      </p>
    {/if}
  {:else}
    <p class="warnbox" data-testid="sans-recitateur-riwaya">
      <Bidi text={t('cl.avis_sans_recitateur', { riwaya: mushafChoice(rw).fr })} />
    </p>
  {/if}
  {#if trackMsg}<p class="warnbox" role="status"><Bidi text={trackMsg} /></p>{/if}
  {#if pack?.mode === 'sourate'}<p class="muted small" data-testid="sourate-entiere">
      {t('ca.sourate_entiere')}
    </p>{/if}
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
</section>

<section class="sec" id="reg-mushaf" data-testid="reglages-mushaf">
  <h3><Icon name="mushaf" size={20} />{t('cl.sec_mushaf')}</h3>
  <fieldset class="cards" data-testid="style-page">
    <legend>{t('cl.style_page')}</legend>
    {#each STYLES as s (s)}
      <label class="card-opt" class:on={prefs.style === s}
        ><input
          type="radio"
          name="style-page"
          value={s}
          bind:group={prefs.style}
          data-style={s}
        /><span class="opt-t"><Bidi text={t(`cl.style_${s}`)} /></span><span class="opt-d"
          ><Bidi
            text={s === 'exact'
              ? t('cl.style_exact_desc', { n: exactPages })
              : t('cl.style_fluide_desc')}
          /></span
        ></label
      >
    {/each}
  </fieldset>

  <fieldset class="cards" data-testid="choix-mushaf" data-value={rw} disabled={prefs.memo > 0}>
    <legend>{t('rw.mushaf_affiche')}</legend>
    {#each MUSHAF_RIWAYAT as m (m.key)}
      {@const n = reciterCount(m.key)}
      <label class="card-opt" class:on={rw === m.key}
        ><input
          type="radio"
          name="riwaya-mushaf"
          value={m.key}
          checked={rw === m.key}
          onchange={() => onriwaya(m.key)}
          data-mushaf={m.key}
        /><span class="opt-t"
          ><Bidi text={ar ? m.ar : m.fr} />{#if rw === m.key}<RiwayaBadge
              riwaya={m.key}
              label={m.fr}
            />{/if}</span
        ><span class="opt-d"><Bidi text={t(`cl.riwaya_desc_${m.key}`)} /></span><span class="opt-n"
          ><Bidi
            text={n > 0 ? t('cl.riwaya_recitateurs', { n }) : t('cl.riwaya_sans_recitateur')}
          /></span
        ></label
      >
    {/each}
  </fieldset>
  {#if prefs.memo > 0}<p class="muted small">{t('cl.memo_hafs')}</p>{/if}
</section>

<section class="sec" id="reg-affichage" data-testid="affichage">
  <h3><Icon name="lire" size={20} />{t('cl.affichage')}</h3>
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
  <div class="seg three" role="radiogroup" aria-label={t('cl.taille')}>
    {#each [0, 1, 2] as i (i)}
      <label class:on={prefs.size === i}
        ><input
          type="radio"
          name="taille"
          value={i}
          bind:group={prefs.size}
          data-testid={`taille-${i}`}
        /><span style:font-size={`${0.85 + i * 0.2}rem`}><Bidi text={t(`cl.taille_${i}`)} /></span
        ></label
      >
    {/each}
  </div>
  {#if prefs.size > 0 && prefs.style === 'exact'}<p class="muted small">
      {t('cl.taille_fluide')}
    </p>{/if}
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
</section>

<section class="sec" id="reg-traduction">
  <h3><Icon name="traduction" size={20} />{t('mp.traduction')}</h3>
  {#if hafs}
    <div class="field">
      <label for="mp-traduction">{t('mp.traduction_du_sens')}</label>
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
  {:else}
    <p class="muted small" data-testid="mp-hafs-seulement">
      <Bidi text={t('rw.hafs_seulement')} />
    </p>
  {/if}
</section>

{#if hafs}
  <section class="sec" id="reg-tajwid">
    <h3><Icon name="tajwid" size={20} />{t('cl.sec_tajwid')}</h3>
    <TajwidBar
      riwaya={rw}
      {sura}
      {verses}
      {basmala}
      bind:prefs={tjPrefs}
      bind:data={tjData}
      compact
    />
  </section>
{/if}

<section class="sec" id="reg-memoriser" data-testid="reglages-memoriser">
  <h3><Icon name="masque" size={20} />{t('cl.memoriser')}</h3>
  <fieldset class="masks">
    <legend class="sr">{t('cl.memoriser')}</legend>
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
</section>

<section class="sec" id="reg-horsligne" data-testid="hors-ligne-sourate">
  <h3><Icon name="telecharger" size={20} />{t('ca.garder_titre')}</h3>
  {#if pack}
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
      <button type="button" onclick={onkeep} data-testid="garder-sourate">{t('ca.garder')}</button>
    {/if}
    {#if offMsg}<p class="muted" role="status"><Bidi text={offMsg} /></p>{/if}
  {:else}
    <p class="muted small"><Bidi text={t('mp.aucun_recitateur')} /></p>
  {/if}
</section>

<style>
  /* sauts vers les sections (en tête du panneau, pas collants : rien ne recouvre les réglages) */
  .sauts {
    display: flex;
    gap: 6px;
    margin: 0 -16px 4px;
    padding: 4px 16px 8px;
    overflow-x: auto;
  }
  .saut {
    flex: none;
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 12px;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--mp-green);
    background: var(--mp-mint);
    border: 1px solid var(--mp-mint2);
    border-radius: var(--radius-pill);
    white-space: nowrap;
    text-decoration: none;
  }
  .sec {
    padding: 12px 0 8px;
    border-top: 1px solid var(--line);
    scroll-margin-top: 64px;
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    font-size: 1rem;
    color: var(--mp-green);
  }
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
  .adv summary,
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
  .seg {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 4px;
    margin-bottom: 10px;
    background: var(--surface);
    border-radius: var(--radius-pill);
  }
  .seg.three {
    grid-template-columns: 1fr 1fr 1fr;
  }
  .seg label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 4px;
    font-weight: 700;
    text-align: center;
    color: var(--ink2);
    border-radius: var(--radius-pill);
    cursor: pointer;
  }
  .seg label.on {
    color: var(--or-ink);
    background: var(--or-soft);
    box-shadow: inset 0 0 0 1px var(--or-line);
  }
  .preset input,
  .seg input,
  .mask input,
  .card-opt input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .preset:has(input:focus-visible),
  .seg label:has(input:focus-visible),
  .mask:has(input:focus-visible),
  .card-opt:has(input:focus-visible) {
    outline: 3px solid var(--focus);
  }
  .cards {
    display: grid;
    gap: 6px;
    margin: 0 0 12px;
    padding: 0;
    border: 0;
  }
  .cards legend,
  .field label {
    margin-bottom: 4px;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--ink2);
  }
  .cards[disabled] {
    opacity: 0.6;
  }
  .card-opt {
    display: grid;
    gap: 2px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    cursor: pointer;
  }
  .card-opt.on {
    background: var(--or-soft);
    border-color: var(--or-line);
  }
  .opt-t {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    color: var(--ink);
  }
  .opt-d,
  .opt-n {
    font-size: 0.85rem;
    color: var(--ink2);
  }
  .opt-n {
    font-weight: 700;
    color: var(--mp-green);
  }
  select {
    font: inherit;
    min-height: var(--target);
  }
  .masks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0 0 10px;
    padding: 0;
    border: 0;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
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
</style>
