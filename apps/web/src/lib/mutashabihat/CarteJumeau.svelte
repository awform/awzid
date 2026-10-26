<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { suraName } from '@awform/hifz';
  import Bidi from '$lib/Bidi.svelte';
  import { suraPack } from '$lib/coran-audio';
  import { loadVerses } from '$lib/hifz';
  import { libelle } from '$lib/hifz-outils/donnees';
  import { t } from '$lib/i18n';
  import MotsJumeau from './MotsJumeau.svelte';
  import { rangsSurlignes, type Jumeau } from './paires';

  /**
   * La carte du jumeau : les deux versets, chacun sur sa ligne (texte Tanzil tel quel), les mots qui changent surlignés,
   * le repère (« proposé par Awzid ») et la source savante, et le bouton d'écoute du verset jumeau — récitation d'AYYŪB
   * seulement, jamais de synthèse vocale (ni pour le verset, ni pour le mot surligné).
   */
  let {
    moi,
    j,
    basmala = '',
  }: { moi: { s: number; a: number; text: string }; j: Jumeau; basmala?: string } = $props();
  const AYYOUB = 'ayyoub-hafs';
  let autre = $state<{ s: number; a: number; text: string } | null>(null);
  let audio: HTMLAudioElement | undefined = $state();
  let joue = $state(false);
  let indispo = $state(false);
  let credit = $state('');

  onMount(async () => {
    const [v] = await loadVerses(j.autre.s, j.autre.a, j.autre.a);
    autre = v ?? null;
  });
  onDestroy(() => audio?.pause());

  /** verset joué : chaque côté de la paire joue SON verset (décision du référent du 26/10/2026) */
  let enCours = $state<'moi' | 'autre' | null>(null);
  async function ecouter(cote: 'moi' | 'autre' = 'autre') {
    if (joue && enCours === cote) {
      audio?.pause();
      joue = false;
      return;
    }
    const v = cote === 'moi' ? moi : j.autre;
    enCours = cote;
    indispo = false;
    const r = await suraPack(AYYOUB, v.s);
    const f =
      r.ok && r.data && r.data.mode !== 'sourate' ? r.data.files.find((x) => x.aya === v.a) : null;
    if (!f || !audio) return void (indispo = true);
    credit = r.data!.credit;
    audio.src = f.url;
    try {
      await audio.play();
      joue = true;
      // le petit lecteur de l'application pilote la récitation (pause, ±5 s, vitesse)
      const a = audio;
      void import('$lib/lecteur/ouvrir').then((m) => m.piloter(a)).catch(() => {});
    } catch {
      indispo = true;
    }
  }
  const ref = (r: { s: number; a: number }) => libelle({ s: r.s, from: r.a, to: r.a });
</script>

<section
  class="carte"
  data-testid="jumeau-carte"
  aria-label={t('mt.alerte', { ref: ref(j.autre) })}
>
  <h3><Bidi text={t('mt.verset_de', { ref: ref(moi) })} /></h3>
  <MotsJumeau v={moi} {basmala} marques={rangsSurlignes(j, 0)} commun={j.commun[0]} />
  <h3><Bidi text={t('mt.verset_de', { ref: ref(j.autre) })} /></h3>
  {#if autre}
    <MotsJumeau v={autre} {basmala} marques={rangsSurlignes(j, 1)} commun={j.commun[1]} />
  {/if}
  <p class="petit muted">
    <Bidi text={t(j.diffs.length ? 'mt.surligne' : 'mt.commun')} />
  </p>
  <div class="actions">
    <button
      type="button"
      onclick={() => ecouter('moi')}
      aria-pressed={joue && enCours === 'moi'}
      data-testid="jumeau-ecouter-moi"
      ><Bidi
        text={joue && enCours === 'moi' ? t('mt.arreter') : t('mt.ecouter', { ref: ref(moi) })}
      /></button
    >
    <button
      type="button"
      onclick={() => ecouter('autre')}
      aria-pressed={joue && enCours === 'autre'}
      data-testid="jumeau-ecouter"
      ><Bidi
        text={joue && enCours === 'autre'
          ? t('mt.arreter')
          : t('mt.ecouter', { ref: ref(j.autre) })}
      /></button
    >
  </div>
  <audio bind:this={audio} onended={() => (joue = false)} preload="none"></audio>
  {#if indispo}<p class="petit" role="status" data-testid="jumeau-sans-audio">
      <Bidi text={t('mt.audio_indispo')} />
    </p>{/if}
  {#if credit}<p class="petit muted"><Bidi text={t('mt.credit', { credit })} /></p>{/if}
  <p class="repere" data-testid="jumeau-repere">
    <strong><Bidi text={t('mt.repere')} /></strong>
    (<Bidi text={t('mt.repere_awzid')} />) :
    <Bidi text={j.repere || t('mt.repere_commun')} />
  </p>
  {#each j.sources as s, i (i)}
    <p class="petit muted" data-testid="jumeau-source">
      <Bidi text={t('mt.source', { ouvrage: s.ouvrage })} />
      {#if s.masala}
        ·
        <Bidi
          text={t('mt.source_masala', { masala: s.masala, sourate: suraName(s.sourate) })}
        />{/if}
      {#if s.page}
        ·
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- adresse externe de l'ouvrage -->
        <a href={s.page} target="_blank" rel="noopener noreferrer">{t('mt.source_page')}</a>{/if}
    </p>
  {/each}
</section>

<style>
  .carte {
    display: grid;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid var(--or-line);
    border-radius: 12px;
    background: var(--card);
  }
  h3 {
    margin: 0;
    font-size: 0.95rem;
    color: var(--ink2);
  }
  .petit {
    margin: 0;
    font-size: 0.9rem;
  }
  .repere {
    margin: 0;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--or-soft);
    color: var(--or-ink);
  }
  .actions button {
    min-height: 44px;
  }
</style>
