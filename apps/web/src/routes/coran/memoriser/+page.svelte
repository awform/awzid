<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { suraName } from '@awform/hifz';
  import { demoProfileFor } from '$lib/attempts';
  import type { Reciter, SuraPack } from '$lib/coran-audio';
  import { hifzToday, loadMeta, loadVerses } from '$lib/hifz';
  import { fmtNumber, t } from '$lib/i18n';
  import type { ProfileInfo } from '$lib/session';
  import AudioPlayer from '$lib/quran/AudioPlayer.svelte';
  import CoranTabs from '$lib/quran/CoranTabs.svelte';
  import { canMemorize, chainQueue, portionRange, type ChainStep } from '$lib/quran/player';
  import QuranText from '$lib/quran/QuranText.svelte';
  import { loadReciters, loadTracks } from '$lib/quran/reciters';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import { HAFS } from '$lib/quran/player';
  import { readTajwidPrefs, type TajwidSura } from '$lib/quran/tajwid';
  import TajwidBar from '$lib/quran/TajwidBar.svelte';

  /**
   * Lot 27 — Mémoriser, relié au carnet de hifẓ : la portion du jour est proposée ; méthode « écouter,
   * répéter, enchaîner » (chaque nouveau verset N fois, puis toute la plage), masquage progressif du texte.
   * Récitations en Ḥafṣ SEULEMENT (les carnets suivent le texte de Ḥafṣ) ; sans audio, le masquage reste
   * utilisable avec le texte seul.
   */
  type Verse = { s: number; a: number; text: string };
  let profile = $state<ProfileInfo | null>(null);
  let loaded = $state(false);
  let list = $state<Reciter[]>([]);
  let reciterId = $state<string | null>(null);
  let meta = $state<{ weights: number[][]; basmala: string } | null>(null);
  let sura = $state(1);
  let verses = $state<Verse[]>([]);
  // lot 29 : tajwid en couleurs (Ḥafṣ : la mémorisation ne suit que des récitateurs en Ḥafṣ)
  let tjPrefs = $state(readTajwidPrefs());
  let tjData = $state<TajwidSura | null>(null);
  let from = $state(1);
  let to = $state(1);
  let repeatNew = $state(5);
  let repeatChain = $state(2);
  let mask = $state(0);
  let rate = $state(1);
  let pack = $state<SuraPack | null>(null);
  let current = $state<number | null>(null);
  let step = $state<ChainStep | null>(null);
  let fromCarnet = $state(false);

  const reciter = $derived(list.find((r) => r.id === reciterId) ?? null);
  const count = $derived(meta?.weights[sura - 1]?.length ?? 0);
  const steps = $derived(chainQueue({ from, to, repeatNew, repeatChain }));
  const queue = $derived(steps.map((s) => s.aya));

  onMount(async () => {
    profile = await demoProfileFor('').catch(() => null);
    meta = await loadMeta();
    if (profile) {
      const c = await loadReciters(profile.id, 'memoriser');
      list = c.list.filter(canMemorize);
      reciterId = list.find((r) => r.id === c.initial)?.id ?? list[0]?.id ?? null;
      const today = await hifzToday(profile.id).catch(() => null);
      const p = portionRange(today?.nouveau ?? null);
      await openSura(p?.s ?? 1, p ? [p.from, p.to] : null);
      fromCarnet = !!p;
    }
    loaded = true;
  });

  async function openSura(s: number, range: [number, number] | null = null) {
    sura = s;
    const n = meta?.weights[s - 1]?.length ?? 1;
    verses = await loadVerses(s, 1, n).catch(() => []);
    from = range?.[0] ?? 1;
    to = range?.[1] ?? Math.min(n, 5);
    fromCarnet = false;
    await openTracks();
  }
  async function openTracks() {
    pack = null;
    if (!profile || !reciterId) return;
    pack = (await loadTracks(profile.id, reciterId, sura, 'memoriser')).pack;
  }
  const MASKS = [
    { n: 0, icon: 'lire' },
    { n: 1, icon: 'masque' },
    { n: 2, icon: 'masque' },
    { n: 3, icon: 'masque' },
  ];
</script>

<svelte:head><title>{t('app.nom')} — {t('ca.memoriser_titre')}</title></svelte:head>

<h1>{t('ca.memoriser_titre')}</h1>
<CoranTabs current="memoriser" />

{#if !loaded}
  <Loading lines={4} />
{:else if !profile}
  <EmptyState
    icon="personne"
    title={t('ca.memo_sans_profil')}
    text={t('ca.memo_sans_profil_texte')}
  >
    <a class="button primary" href={resolve('/profils')}>{t('auj.choisir_profil')}</a>
  </EmptyState>
{:else}
  <section class="card">
    <p class="muted">{t('ca.memo_intro')}</p>
    {#if fromCarnet}<p class="pill" data-testid="portion-carnet">{t('ca.portion_carnet')}</p>{/if}
    <div class="grid">
      <div class="field">
        <label for="m-sourate">{t('lecteur.sourate')}</label>
        <select
          id="m-sourate"
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
        <label for="m-de">{t('ca.du_verset')}</label>
        <input id="m-de" type="number" min="1" max={count} bind:value={from} data-testid="de" />
      </div>
      <div class="field">
        <label for="m-au">{t('ca.au_verset')}</label>
        <input id="m-au" type="number" min={from} max={count} bind:value={to} data-testid="au" />
      </div>
      <div class="field">
        <label for="m-rn">{t('ca.ecoutes_nouveau')}</label>
        <input
          id="m-rn"
          type="number"
          min="1"
          max="20"
          bind:value={repeatNew}
          data-testid="repeter-nouveau"
        />
      </div>
      <div class="field">
        <label for="m-rc">{t('ca.enchainements')}</label>
        <input
          id="m-rc"
          type="number"
          min="0"
          max="10"
          bind:value={repeatChain}
          data-testid="enchainements"
        />
      </div>
    </div>
    <fieldset class="masks">
      <legend>{t('ca.masquage')}</legend>
      {#each MASKS as m (m.n)}
        <label class="mask" class:on={mask === m.n}
          ><input type="radio" name="masque" value={m.n} bind:group={mask} data-mask={m.n} /><Icon
            name={m.icon}
            size={20}
          />{t(`ca.masque_${m.n}`)}</label
        >
      {/each}
    </fieldset>
  </section>

  {#if list.length === 0}
    <p class="warnbox" data-testid="memo-sans-audio">{t('ca.memo_sans_audio')}</p>
  {:else if reciter}
    <div class="field reciter">
      <label for="m-rec">{t('ca.recitateur_hafs')}</label>
      <select
        id="m-rec"
        bind:value={reciterId}
        onchange={openTracks}
        data-testid="choix-recitateur"
      >
        {#each list as r (r.id)}<option value={r.id}>{r.nameFr}</option>{/each}
      </select>
    </div>
    <AudioPlayer
      {reciter}
      {pack}
      {queue}
      {rate}
      onaya={(a) => (current = a)}
      onindex={(i) => (step = i === null ? null : (steps[i] ?? null))}
    />
    {#if step}
      <p class="etape" role="status" data-testid="etape">
        {step.kind === 'nouveau'
          ? t('ca.etape_nouveau', { aya: fmtNumber(step.aya) })
          : t('ca.etape_enchainer', { de: fmtNumber(from), a: fmtNumber(step.learning) })}
      </p>
    {/if}
  {/if}

  <TajwidBar
    riwaya={HAFS}
    {sura}
    {verses}
    basmala={meta?.basmala ?? ''}
    bind:prefs={tjPrefs}
    bind:data={tjData}
  />
  <QuranText
    {sura}
    {verses}
    basmala={meta?.basmala ?? ''}
    {current}
    {from}
    {to}
    {mask}
    maskFrom={from}
    tajwid={tjPrefs.on ? tjData : null}
    motifs={tjPrefs.motifs}
  />
{/if}

<style>
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
  .reciter {
    margin: var(--space-m) 0 var(--space-s);
    max-width: 420px;
  }
  .masks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: var(--space-m);
  }
  .mask {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 48px;
    padding: 0 12px;
    border: 2px solid var(--line);
    border-radius: var(--radius-pill);
  }
  .mask.on {
    border-color: var(--primary);
    color: var(--primary);
    font-weight: 700;
  }
  .mask input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .mask:has(input:focus-visible) {
    outline: 3px solid var(--focus);
  }
  .etape {
    font-weight: 700;
    color: var(--primary);
  }
</style>
