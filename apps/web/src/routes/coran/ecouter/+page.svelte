<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { suraName } from '@awform/hifz';
  import { demoProfileFor } from '$lib/attempts';
  import type { Reciter, SuraPack } from '$lib/coran-audio';
  import { loadMeta, loadVerses } from '$lib/hifz';
  import { fmtBytes, fmtNumber, t } from '$lib/i18n';
  import AudioPlayer from '$lib/quran/AudioPlayer.svelte';
  import CoranTabs from '$lib/quran/CoranTabs.svelte';
  import {
    connectionType,
    removeSura,
    saveSura,
    savedSuras,
    setWifiOnly,
    wifiOnly,
  } from '$lib/quran/offline-audio';
  import { fmtDuration, isHafs, listenQueue, SLEEP_CHOICES } from '$lib/quran/player';
  import type { RiwayaIndex } from '@awform/content/riwayat';
  import RiwayaPicker from '$lib/quran/RiwayaPicker.svelte';
  import {
    ensureRiwayaFont,
    highlightOn,
    isMushafRiwaya,
    loadRiwayaIndex,
    loadRiwayaSura,
    mushafChoice,
    readMushafRiwaya,
    riwayaFamily,
    riwayaText,
    writeMushafRiwaya,
    type MushafRiwaya,
  } from '$lib/quran/riwayat';
  import QuranText from '$lib/quran/QuranText.svelte';
  import { loadReciters, loadTracks } from '$lib/quran/reciters';
  import RiwayaBadge from '$lib/quran/RiwayaBadge.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import { HAFS } from '$lib/quran/player';
  import { readTajwidPrefs, tajwidAllowed, type TajwidSura } from '$lib/quran/tajwid';
  import TajwidBar from '$lib/quran/TajwidBar.svelte';

  /**
   * Lot 27 — Écouter : choix du récitateur (riwāya toujours affichée), sourate et plage, répétition du verset
   * et de la plage, vitesse sans changer la hauteur, minuterie, arrière-plan, sourate gardée hors ligne.
   * Aucune lecture automatique, aucun point pour l'écoute.
   */
  type Verse = { s: number; a: number; text: string };
  const TRACK_CODES = [
    'sourate_absente',
    'recitateur_indisponible',
    'recitateur_non_autorise',
    'riwaya_differente_du_carnet',
    'hors_ligne',
  ];
  let profileId = $state<string | null>(null);
  let loaded = $state(false);
  let error = $state<'erreur' | 'hors_ligne' | null>(null);
  let list = $state<Reciter[]>([]);
  let conseil = $state<string | null>(null);
  let restreint = $state(false);
  let reciterId = $state<string | null>(null);
  let meta = $state<{ weights: number[][]; basmala: string } | null>(null);
  let sura = $state(1);
  let verses = $state<Verse[]>([]);
  // lot 29 : tajwid en couleurs — seulement si le récitateur choisi lit en Ḥafṣ (sinon : bouton absent)
  let tjPrefs = $state(readTajwidPrefs());
  let tjData = $state<TajwidSura | null>(null);
  let from = $state(1);
  let to = $state(1);
  let repeatVerse = $state(1);
  let repeatRange = $state(1);
  let rate = $state(1);
  let sleepMin = $state(0);
  let pack = $state<SuraPack | null>(null);
  let trackCode = $state<string | null>(null);
  let current = $state<number | null>(null);
  let saved = $state(false);
  let wifi = $state(true);
  let progress = $state<{ n: number; total: number } | null>(null);
  let offMsg = $state('');

  const reciter = $derived(list.find((r) => r.id === reciterId) ?? null);
  // A8 : muṣḥaf affiché (Ḥafṣ par défaut) ; surlignage seulement si la riwāya du récitateur est celle du texte
  let rw = $state<MushafRiwaya>(readMushafRiwaya());
  let rwIndex = $state<RiwayaIndex | null>(null);
  let rwError = $state(false);
  const isRw = $derived(rw !== HAFS);
  const rwDef = $derived(riwayaText(rw));
  const count = $derived(
    isRw ? (rwIndex?.counts[sura - 1] ?? 0) : (meta?.weights[sura - 1]?.length ?? 0),
  );
  // sourate servie en entier (découpage par verset non conforme au texte officiel) : un seul fichier
  const queue = $derived(
    pack?.mode === 'sourate' ? [0] : listenQueue({ from, to, repeatVerse, repeatRange }),
  );
  const highlight = $derived(highlightOn(reciter, rw, pack, count));

  onMount(async () => {
    const p = await demoProfileFor('').catch(() => null);
    profileId = p?.id ?? null;
    wifi = await wifiOnly();
    const c = await loadReciters(profileId, 'ecouter');
    list = c.list;
    conseil = c.conseil;
    restreint = c.restreint;
    error = c.error;
    reciterId = page.url.searchParams.get('r') ?? c.initial;
    meta = await loadMeta();
    const m = page.url.searchParams.get('m');
    if (isMushafRiwaya(m)) rw = m;
    await openRiwaya();
    const s = Number(page.url.searchParams.get('s'));
    await openSura(s >= 1 && s <= 114 ? s : 1);
    loaded = true;
  });

  /** Index et police de la riwāya affichée ; retour à Ḥafṣ si indisponible (hors ligne). */
  async function openRiwaya() {
    rwError = false;
    if (rw === HAFS) return;
    void ensureRiwayaFont(rw);
    rwIndex = await loadRiwayaIndex(rw);
    if (!rwIndex) {
      rwError = true;
      rw = HAFS;
    }
  }
  async function setRiwaya(m: MushafRiwaya) {
    rw = m;
    current = null;
    await openRiwaya();
    writeMushafRiwaya(rw);
    await openSura(sura);
  }

  let seq = 0;
  async function openSura(s: number) {
    sura = s;
    current = null;
    const key = rw;
    const n = key !== HAFS ? (rwIndex?.counts[s - 1] ?? 1) : (meta?.weights[s - 1]?.length ?? 1);
    const tok = ++seq;
    const v: Verse[] =
      key !== HAFS
        ? await loadRiwayaSura(key, s).then((d) =>
            d ? [...d.verses.values()].map((x) => ({ s, a: x.a, text: x.text })) : [],
          )
        : await loadVerses(s, 1, n).catch(() => []);
    if (tok !== seq) return;
    verses = v;
    from = 1;
    to = n;
    await openTracks();
  }
  async function openTracks() {
    pack = null;
    trackCode = null;
    saved = false;
    if (!reciterId) return;
    const r = await loadTracks(profileId, reciterId, sura, 'ecouter');
    pack = r.pack;
    trackCode = r.code;
    saved =
      !!pack &&
      (await savedSuras(pack.reciter)).some((x) => x.sura === sura && x.hash === pack!.hash);
  }

  async function keep() {
    if (!pack) return;
    offMsg = '';
    if (wifi && connectionType() === null) offMsg = t('ca.wifi_inconnu');
    progress = { n: 0, total: pack.files.length };
    const r = await saveSura(pack, (n, total) => (progress = { n, total }));
    progress = null;
    if (r.ok) saved = true;
    else offMsg = t(`ca.refus_${r.refus}`);
  }
  async function drop() {
    if (!pack) return;
    await removeSura(pack.reciter, pack.sura);
    saved = false;
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('ca.ecouter_titre')}</title></svelte:head>

<h1>{t('ca.ecouter_titre')}</h1>
<CoranTabs current="ecouter" />

{#if !loaded}
  <Loading lines={4} />
{:else if error}
  <StatusMessage kind={error} onretry={() => location.reload()} />
{:else if list.length === 0}
  <EmptyState
    icon="casque"
    title={t('ca.aucun_titre')}
    text={restreint ? t('ca.aucun_restreint') : t('ca.aucun_texte')}
  >
    <a class="button" href={resolve('/coran/lecteur')}>{t('ca.onglet_lire')}</a>
  </EmptyState>
{:else}
  <section class="card choix" aria-labelledby="choix-titre">
    <h2 id="choix-titre" class="sr">{t('ca.reglages')}</h2>
    <div class="field">
      <label for="recitateur">{t('ca.recitateur')}</label>
      <select
        id="recitateur"
        bind:value={reciterId}
        onchange={openTracks}
        data-testid="choix-recitateur"
      >
        {#each list as r (r.id)}<option value={r.id}
            >{r.nameFr} — {r.riwayaFr}{r.id === conseil
              ? ` · ${t('ca.conseil_court')}`
              : ''}</option
          >{/each}
      </select>
    </div>
    {#if reciter}
      <p class="badges">
        <RiwayaBadge riwaya={reciter.riwaya} label={reciter.riwayaFr} />
        {#if reciter.id === conseil}<span class="pill">{t('ca.conseil')}</span>{/if}
        {#if restreint}<span class="pill">{t('ca.liste_restreinte')}</span>{/if}
      </p>
    {/if}
    <RiwayaPicker value={rw} onchange={setRiwaya} />
    {#if rwError}<p class="muted small" role="status">{t('rw.indisponible')}</p>{/if}
    {#if reciter && reciter.riwaya !== rw}
      <p class="warnbox" data-testid="autre-riwaya">
        {#if !isRw}<Bidi text={t('ca.autre_riwaya_texte', { riwaya: reciter.riwayaFr })} />
        {:else}<Bidi
            text={t('rw.autre_texte', { riwaya: reciter.riwayaFr, texte: mushafChoice(rw).fr })}
          />{/if}
        {#if isMushafRiwaya(reciter.riwaya)}<button
            type="button"
            class="link"
            onclick={() => setRiwaya(reciter.riwaya as MushafRiwaya)}
            data-testid="voir-riwaya"
            ><Bidi text={t('rw.voir_texte', { riwaya: reciter.riwayaFr })} /></button
          >{/if}
      </p>
    {:else if reciter && !isHafs(reciter.riwaya) && highlight}
      <p class="muted small" data-testid="meme-riwaya">
        <Bidi text={t('rw.meme_riwaya', { riwaya: reciter.riwayaFr })} />
      </p>
    {/if}
    <div class="grid">
      <div class="field">
        <label for="sourate">{t('lecteur.sourate')}</label>
        <select
          id="sourate"
          value={sura}
          onchange={(e) => openSura(Number(e.currentTarget.value))}
          data-testid="sourate"
        >
          {#each Array.from({ length: 114 }, (_, i) => i + 1) as s (s)}<option value={s}
              >{fmtNumber(s)}. {suraName(s)}</option
            >{/each}
        </select>
      </div>
      <div class="field">
        <label for="de">{t('ca.du_verset')}</label>
        <input id="de" type="number" min="1" max={count} bind:value={from} data-testid="de" />
      </div>
      <div class="field">
        <label for="au">{t('ca.au_verset')}</label>
        <input id="au" type="number" min={from} max={count} bind:value={to} data-testid="au" />
      </div>
      <div class="field">
        <label for="rv">{t('ca.repeter_verset')}</label>
        <input
          id="rv"
          type="number"
          min="1"
          max="20"
          bind:value={repeatVerse}
          data-testid="repeter-verset"
        />
      </div>
      <div class="field">
        <label for="rr">{t('ca.repeter_plage')}</label>
        <input
          id="rr"
          type="number"
          min="1"
          max="20"
          bind:value={repeatRange}
          data-testid="repeter-plage"
        />
      </div>
      <div class="field">
        <label for="vitesse">{t('ca.vitesse')}</label>
        <select id="vitesse" bind:value={rate} data-testid="vitesse">
          {#each [0.5, 0.75, 1, 1.25, 1.5] as v (v)}<option value={v}>{fmtNumber(v)}×</option
            >{/each}
        </select>
      </div>
      <div class="field">
        <label for="minuterie">{t('ca.minuterie')}</label>
        <select id="minuterie" bind:value={sleepMin} data-testid="minuterie">
          {#each SLEEP_CHOICES as m (m)}<option value={m}
              >{m ? t('ca.minutes', { n: m }) : t('ca.sans_minuterie')}</option
            >{/each}
        </select>
      </div>
    </div>
  </section>

  {#if reciter}
    {#if trackCode}
      <StatusMessage
        kind={trackCode === 'hors_ligne' ? 'hors_ligne' : 'erreur'}
        message={t(`ca.pistes_${TRACK_CODES.includes(trackCode) ? trackCode : 'erreur'}`)}
        onretry={openTracks}
      />
    {:else}
      <AudioPlayer
        {reciter}
        {pack}
        {queue}
        {rate}
        {sleepMin}
        onaya={(a) => (current = highlight ? a : null)}
      />
      {#if pack}
        <section class="card off" data-testid="hors-ligne-sourate">
          <h2>{t('ca.garder_titre')}</h2>
          <p class="muted">
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
              bind:checked={wifi}
              onchange={() => setWifiOnly(wifi)}
              data-testid="wifi-seulement"
            />
            {t('ca.wifi_seulement')}</label
          >
          {#if saved}
            <p class="ok-line" data-testid="sur-appareil">{t('ca.sur_appareil')}</p>
            <button type="button" onclick={drop} data-testid="supprimer-sourate"
              >{t('ca.supprimer')}</button
            >
          {:else if progress}
            <p role="status">
              <Bidi text={t('ca.telechargement', { n: progress.n, total: progress.total })} />
            </p>
          {:else}
            <button type="button" onclick={keep} data-testid="garder-sourate"
              >{t('ca.garder')}</button
            >
          {/if}
          {#if offMsg}<p class="muted" role="status"><Bidi text={offMsg} /></p>{/if}
        </section>
      {/if}
    {/if}
    <p class="credit muted small" data-testid="credit">
      <Bidi text={pack?.credit ?? reciter.credit} /><br /><Bidi
        text={t('ca.licence', { source: reciter.license.source })}
      />
      {#if reciter.creditAr}<br /><span lang="ar" dir="rtl" data-testid="credit-ar"
          ><Bidi text={reciter.creditAr} /></span
        >{/if}
      {#if reciter.usageNote}<br /><span data-testid="usage-note"
          ><Bidi text={reciter.usageNote} /></span
        >{/if}
    </p>
  {/if}

  {#if !isRw}
    <TajwidBar
      riwaya={reciter?.riwaya ?? HAFS}
      {sura}
      {verses}
      basmala={meta?.basmala ?? ''}
      bind:prefs={tjPrefs}
      bind:data={tjData}
    />
  {/if}
  <QuranText
    {sura}
    {verses}
    basmala={meta?.basmala ?? ''}
    {current}
    {from}
    {to}
    riwaya={isRw ? riwayaFamily(rw) : null}
    tajwid={!isRw && tjPrefs.on && tajwidAllowed(reciter?.riwaya ?? HAFS) ? tjData : null}
    motifs={tjPrefs.motifs}
    onpick={(a) => {
      if (a < from || from !== to) {
        from = a;
        to = a;
      } else to = Math.max(from, a);
    }}
  />
  {#if pack?.mode === 'sourate'}<p class="muted small" data-testid="sourate-entiere">
      {t('ca.sourate_entiere')}
    </p>{/if}
  {#if reciter && !highlight}<p class="muted small" data-testid="sans-surlignage">
      {t('ca.sans_surlignage')}
    </p>{/if}
  <p class="muted small" data-testid="credit-texte">
    {#if rwDef}<Bidi
        text={t('rw.credit', {
          riwaya: rwDef.fr,
          version: rwDef.version,
          police: rwDef.fontVersion,
        })}
      />{:else}<Bidi text={t('lecteur.credit')} />{/if}
  </p>
{/if}

<style>
  .choix {
    display: grid;
    gap: var(--space-s);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr));
    gap: var(--space-s) var(--space-m);
  }
  .field {
    display: grid;
    gap: 4px;
  }
  .field select,
  .field input {
    width: 100%;
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
  }
  .ok-line {
    color: var(--ok-ink);
    font-weight: 700;
  }
  .credit {
    margin-top: var(--space-s);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
