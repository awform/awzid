<script lang="ts">
  import { onMount } from 'svelte';
  import {
    profileReciters,
    profileSuraTracks,
    type Reciter,
    type SuraPack,
  } from '$lib/coran-audio';
  import { loadVerses } from '$lib/hifz';
  import { loadTexts, t } from '$lib/i18n';
  import AudioPlayer from '$lib/quran/AudioPlayer.svelte';
  import { listenQueue } from '$lib/quran/player';
  import VerseText from '$lib/VerseText.svelte';
  import { chargerCarnet, libelle } from './donnees';
  import type { Plage } from './outils';

  /**
   * Hifẓ complet — ÉCRAN ENFANT : DEUX réglages seulement (le passage, le nombre de répétitions) ; le texte en
   * grand, puis « Écouter » : chaque verset est récité par le récitateur choisi par le parent (jamais une voix de
   * synthèse), répété le nombre de fois choisi, avec un silence pour le redire après lui.
   */
  let { profileId }: { profileId: string } = $props();
  type Verse = { s: number; a: number; text: string };
  const FOIS = [1, 2, 3, 5, 7, 10] as const;
  let passages = $state<Plage[]>([]);
  let basmala = $state('');
  let choisi = $state(0);
  let fois = $state(3);
  let textes = $state<Verse[]>([]);
  let reciter = $state<Reciter | null>(null);
  let pack = $state<SuraPack | null>(null);
  let charge = $state(false);

  onMount(async () => {
    await loadTexts('coran');
    const c = await chargerCarnet(profileId);
    basmala = c?.basmala ?? '';
    // d'abord le passage de la semaine (à apprendre), puis ceux déjà appris
    const tous: Plage[] = [
      ...(c?.view.weekTasks ?? []).map((w) => ({ s: w.sura, from: w.from, to: w.to })),
      ...(c?.passages ?? []).flatMap((p) => p.ref),
    ].filter((r, i, l) => l.findIndex((x) => libelle(x) === libelle(r)) === i);
    passages = tous;
    const r = await profileReciters(profileId, 'memoriser').catch(() => null);
    if (r?.ok && r.data)
      reciter =
        r.data.reciters.find((x) => x.id === r.data!.preference.effectif) ??
        r.data.reciters[0] ??
        null;
    charge = true;
    await changer();
  });

  async function changer() {
    const p = passages[choisi];
    if (!p) return;
    textes = await loadVerses(p.s, p.from, p.to);
    pack = null;
    if (reciter) {
      const r = await profileSuraTracks(profileId, p.s, reciter.id, 'memoriser').catch(() => null);
      pack = r?.ok ? r.data : null;
    }
  }
  const p = $derived(passages[choisi] ?? null);
  const queue = $derived(
    p ? listenQueue({ from: p.from, to: p.to, repeatVerse: fois, repeatRange: 1 }) : [],
  );
</script>

{#if charge && !passages.length}
  <p class="card muted" data-testid="enfant-vide">{t('hz.enfant_vide')}</p>
{:else if charge && p}
  <section class="card reglages" data-testid="enfant-reglages">
    <label for="hz-passage">{t('hz.enfant_passage')}</label>
    <select
      id="hz-passage"
      value={choisi}
      onchange={(e) => {
        choisi = Number(e.currentTarget.value);
        void changer();
      }}
      data-testid="enfant-passage"
    >
      {#each passages as r, i (libelle(r))}<option value={i}>{libelle(r)}</option>{/each}
    </select>
    <label for="hz-fois">{t('hz.enfant_fois')}</label>
    <select id="hz-fois" bind:value={fois} data-testid="enfant-fois">
      {#each FOIS as n (n)}<option value={n}>{t('hz.n_fois', { n })}</option>{/each}
    </select>
  </section>
  <section class="card texte">
    <VerseText verses={textes} {basmala} />
  </section>
  <div class="card lecteur" data-testid="enfant-lecteur">
    {#if reciter && pack}
      <AudioPlayer {reciter} {pack} {queue} silence={1} simple />
    {:else}
      <p class="muted" data-testid="enfant-sans-audio">{t('hz.enfant_sans_audio')}</p>
    {/if}
  </div>
{/if}

<style>
  .reglages {
    display: grid;
    gap: 6px;
  }
  select {
    font: inherit;
    font-size: 1.1rem;
    min-height: 48px;
    padding: 4px 8px;
    border: 2px solid var(--line);
    border-radius: 12px;
    max-width: 100%;
  }
  .texte :global(.verse) {
    font-size: 2rem;
  }
</style>
