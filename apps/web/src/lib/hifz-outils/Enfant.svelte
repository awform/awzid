<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import {
    profileReciters,
    profileSuraTracks,
    type Reciter,
    type SuraPack,
  } from '$lib/coran-audio';
  import { loadVerses } from '$lib/hifz';
  import { fmtNumber, loadTexts, t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { chargerCarnet, libelle } from './donnees';
  import MotsVerset from './MotsVerset.svelte';
  import type { Plage } from './outils';

  /**
   * Hifẓ complet — ÉCRAN ENFANT : DEUX réglages seulement (le passage, le nombre de répétitions) ; le texte en
   * grand, puis « Écouter » : chaque verset est récité par le récitateur choisi par le parent (jamais une voix de
   * synthèse), répété le nombre de fois choisi, avec un silence (la durée du verset) pour le redire après lui.
   * Lecteur propre à cet écran, très simple (aucun module du lecteur du Coran n'est chargé : budget de l'appareil).
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
  /** pistes du récitateur en cours de chargement (rien n'est annoncé tant qu'elles n'ont pas répondu) */
  let pistes = $state(true);
  // lecteur : position dans la file, lecture en cours, silence « à toi »
  let audio: HTMLAudioElement | undefined = $state();
  let idx = $state(-1);
  let joue = $state(false);
  let silence = $state(false);
  let minuteur: ReturnType<typeof setTimeout> | null = null;

  onMount(async () => {
    // textes de l'écran enfant (en ligne) hors des textes préchargés de l'élève : chargés avec lui
    const [c] = await Promise.all([chargerCarnet(profileId), loadTexts('rares')]);
    basmala = c?.basmala ?? '';
    // d'abord le passage de la semaine (à apprendre), puis ceux déjà appris
    passages = [
      ...(c?.view.weekTasks ?? []).map((w) => ({ s: w.sura, from: w.from, to: w.to })),
      ...(c?.passages ?? []).flatMap((p) => p.ref),
    ].filter((r, i, l) => l.findIndex((x) => libelle(x) === libelle(r)) === i);
    const r = await profileReciters(profileId, 'memoriser').catch(() => null);
    if (r?.ok && r.data)
      reciter =
        r.data.reciters.find((x) => x.id === r.data!.preference.effectif) ??
        r.data.reciters[0] ??
        null;
    charge = true;
    await changer();
  });
  onDestroy(arreter);

  async function changer() {
    arreter();
    const p = passages[choisi];
    if (!p) return;
    textes = await loadVerses(p.s, p.from, p.to);
    pack = null;
    pistes = true;
    if (reciter) {
      const r = await profileSuraTracks(profileId, p.s, reciter.id, 'memoriser').catch(() => null);
      // un fichier par verset seulement (une sourate en un seul fichier ne se répète pas verset par verset)
      pack = r?.ok && r.data && r.data.mode !== 'sourate' ? r.data : null;
    }
    pistes = false;
  }
  const p = $derived(passages[choisi] ?? null);
  /** chaque verset `fois` fois, dans l'ordre */
  const file = $derived(
    p
      ? Array.from({ length: p.to - p.from + 1 }, (_, i) => p.from + i).flatMap((a) =>
          Array<number>(fois).fill(a),
        )
      : [],
  );

  async function jouer(i: number) {
    const f = pack?.files.find((x) => x.aya === file[i]);
    if (!audio || i >= file.length || !f) return arreter();
    idx = i;
    silence = false;
    audio.src = f.url;
    try {
      await audio.play();
      joue = true;
    } catch {
      arreter();
    }
  }
  function fini() {
    const f = pack?.files.find((x) => x.aya === file[idx]);
    // silence « à toi » : au moins la durée du verset
    silence = true;
    minuteur = setTimeout(() => void jouer(idx + 1), Math.max(1500, f?.durationMs ?? 0));
  }
  function bouton() {
    if (joue) arreter();
    else void jouer(Math.max(0, idx));
  }
  function arreter() {
    if (minuteur) clearTimeout(minuteur);
    minuteur = null;
    audio?.pause();
    joue = false;
    silence = false;
  }
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
        idx = -1;
        void changer();
      }}
      data-testid="enfant-passage"
    >
      {#each passages as r, i (libelle(r))}<option value={i}>{libelle(r)}</option>{/each}
    </select>
    <label for="hz-fois">{t('hz.enfant_fois')}</label>
    <select
      id="hz-fois"
      bind:value={fois}
      onchange={() => (arreter(), (idx = -1))}
      data-testid="enfant-fois"
    >
      {#each FOIS as n (n)}<option value={n}>{t('hz.n_fois', { n })}</option>{/each}
    </select>
  </section>
  <section class="card">
    {#each textes as v (v.a)}<MotsVerset {v} {basmala} grand />{/each}
  </section>
  <div class="card lecteur" data-testid="enfant-lecteur">
    {#if reciter && pack}
      <audio bind:this={audio} onended={fini} preload="none"></audio>
      <button type="button" class="primary jouer" onclick={bouton} data-testid="jouer"
        ><Icon name={joue ? 'pause' : 'lecture'} filled={!joue} size={24} /><Bidi
          text={t(joue ? 'hz.pause' : 'hz.ecouter')}
        /></button
      >
      <p class="where" aria-live="polite" data-testid="position">
        {#if joue && silence}<Bidi text={t('hz.a_toi')} />{:else if joue}<Bidi
            text={t('hz.enfant_position', {
              aya: fmtNumber(file[idx] ?? 0),
              n: fmtNumber(idx + 1),
              total: fmtNumber(file.length),
            })}
          />{:else}<Bidi text={t('hz.enfant_pret', { n: file.length })} />{/if}
      </p>
    {:else if !pistes}
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
    min-height: 56px;
    padding: 4px 8px;
    border: 2px solid var(--line);
    border-radius: 12px;
    max-width: 100%;
  }
  .lecteur {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
  /* icône À GAUCHE du mot, sur une ligne ; cible de 56 px au moins */
  .jouer {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    min-height: 56px;
    min-width: 56px;
    padding: 0 22px;
    border-radius: 999px;
    font-size: 1.15rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .where {
    margin: 0;
  }
</style>
