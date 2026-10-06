<script lang="ts">
  import { onMount } from 'svelte';
  import Ar from '$lib/Ar.svelte';
  import Bidi from '$lib/Bidi.svelte';
  import ModelesPlus from './ModelesPlus.svelte';
  import { fmtNumber, t } from '$lib/i18n';
  import { audioIdFor, playLessonAudio, stopLessonAudio, type LevelAudio } from '$lib/lecons-audio';
  import type { VivBeat, VivMotion } from '@awform/content/vivante';

  /**
   * Chantier A21 — lecteur d'une animation (« motion ») générée depuis les livres : après une partie de la
   * leçon (10 à 20 s) ou condensé de fin de leçon (1 à 2 min, avec 3 questions éclair).
   *  - images : sans son, elle démarre quand elle arrive à l'écran (jamais le condensé, qui attend un appui) ;
   *    version calme si l'appareil demande moins d'animations (aucun départ seul, simples fondus) ;
   *  - voix : SEULEMENT après un appui sur « Voix » (aucun son sans geste) ; fichiers audio des livres
   *    (même clé que le bouton « écouter »), pas de bouton s'il n'y a aucun fichier ; jamais de musique ;
   *  - l'arabe est toujours du texte (police de l'application) ; aucun personnage (formes géométriques).
   */
  let {
    motion,
    illus,
    audio,
    lettres = [],
    condense = false,
  }: {
    motion: VivMotion;
    illus: Record<string, { viewBox: string }>;
    audio: () => LevelAudio | null;
    lettres?: ReadonlyArray<{ l: string }>;
    condense?: boolean;
  } = $props();

  const beats = $derived(motion.beats);
  const nQ = $derived(beats.filter((b) => b.k === 'question').length);
  let root: HTMLElement | undefined = $state();
  let reduced = $state(false);
  /** -1 : pas encore lancée */
  let i = $state(-1);
  let elapsed = $state(0);
  let paused = $state(false);
  let ended = $state(false);
  let skipped = $state(false);
  let voice = $state(false);
  let holding = $state(false);
  /** condensé : ouvert par un appui */
  let open = $state(false);
  let answers: Record<number, { ok: boolean; v: string }> = $state({});
  const score = $derived(Object.values(answers).filter((a) => a.ok).length);
  const beat = $derived(i >= 0 ? beats[i] : beats[0]);
  const hasVoice = $derived(beats.some((b) => (b.say ?? []).some((s) => !!audioIdFor(s, audio()))));

  const dur = (ms: number) => {
    const s = Math.round(ms / 1000);
    return s < 60
      ? t('viv.duree', { s: fmtNumber(s) })
      : t('viv.duree_min', { m: Math.floor(s / 60), s: s % 60 });
  };
  const total = $derived(dur(motion.ms));

  let token = 0;
  async function speak() {
    const my = ++token;
    stopLessonAudio();
    if (!voice || i < 0) return;
    for (const s of beats[i]?.say ?? []) {
      const id = audioIdFor(s, audio());
      if (!id) continue;
      holding = true;
      try {
        const a = await playLessonAudio(id, false);
        await new Promise<void>((ok) => {
          a.addEventListener('ended', () => ok(), { once: true });
          a.addEventListener('pause', () => ok(), { once: true });
          a.addEventListener('error', () => ok(), { once: true });
        });
      } catch {
        /* lecture refusée ou fichier absent : l'animation continue sans voix */
      }
      if (my !== token) return;
    }
    holding = false;
  }
  function go(n: number) {
    holding = false;
    if (n >= beats.length) {
      ended = true;
      token++;
      return;
    }
    i = n;
    elapsed = 0;
    void speak();
  }
  function start() {
    skipped = false;
    ended = false;
    paused = false;
    answers = {};
    go(0);
  }
  function togglePause() {
    if (i < 0 || ended) return start();
    paused = !paused;
    if (paused) {
      token++;
      holding = false;
      stopLessonAudio();
    }
  }
  function skip() {
    token++;
    stopLessonAudio();
    skipped = true;
    open = false;
  }
  function toggleVoice() {
    voice = !voice;
    if (voice && i >= 0 && !ended && !paused) void speak();
    else {
      token++;
      holding = false;
      stopLessonAudio();
    }
  }
  function answer(v: string, ok: boolean) {
    if (answers[i]) return;
    answers = { ...answers, [i]: { ok, v } };
    elapsed = 0;
  }
  async function listen(text: string) {
    const id = audioIdFor(text, audio());
    if (id) await playLessonAudio(id, false).catch(() => undefined);
  }

  onMount(() => {
    reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = setInterval(() => {
      if (i < 0 || paused || ended || skipped || holding) return;
      // question éclair : on attend la réponse, puis 1,8 s pour lire la correction
      if (beat?.k === 'question') {
        if (!answers[i]) return;
        elapsed += 100;
        if (elapsed >= 1800) go(i + 1);
        return;
      }
      elapsed += 100;
      if (elapsed >= (beat?.ms ?? 0)) go(i + 1);
    }, 100);
    // départ sans son quand l'animation arrive à l'écran (pas en version calme, jamais le condensé)
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting) && i < 0 && !condense && !reduced && !skipped) start();
      },
      { threshold: 0.6 },
    );
    if (root) io.observe(root);
    return () => {
      clearInterval(tick);
      io.disconnect();
      token++;
    };
  });

  const words = (s: string) => s.split(' ');
  const pct = (j: number) =>
    j < i || ended
      ? 100
      : j === i && beats[j]
        ? Math.min(100, (elapsed / (beats[j]!.k === 'question' ? 1800 : beats[j]!.ms)) * 100)
        : 0;
</script>

{#snippet img(k: string | undefined, cls = 'pic')}
  {#if k && illus[k]}<svg class={cls} viewBox={illus[k].viewBox} aria-hidden="true"
      ><use href="#i-{k}" /></svg
    >{/if}
{/snippet}

{#snippet show(b: VivBeat, n: number)}
  {#if b.k === 'lettre'}
    <div class="b lettre" style="--k: var(--c{b.c})">
      <svg class="draw" viewBox="0 0 220 200" aria-hidden="true"
        ><text x="110" y="135" text-anchor="middle" lang="ar">{b.l}</text></svg
      >
      <div class="meta">
        <span class="arl" dir="rtl"
          >{#if b.nom}<span class="ar nom"><Ar text={b.nom} /></span>{/if}
          {#if b.points}<span class="ar pts"><Ar text={b.points} /></span>{/if}</span
        >
        {#if b.pointsFr}<span class="fr"><Bidi text={b.pointsFr} /></span>{/if}
      </div>
      {#if b.formes?.length}<div class="formes" dir="rtl" lang="ar">
          {#each b.formes as f, j (j)}<span style="--d: {j}"><Bidi text={f} base="ar" /></span
            >{/each}
        </div>{/if}
    </div>
  {:else if b.k === 'mot'}
    <div class="b mot">
      {@render img(b.img)}
      <span class="wipe ar"><Ar text={b.ar} {lettres} /></span>
      {#if b.fr}<span class="fr up"><Bidi text={b.fr} /></span>{/if}
    </div>
  {:else if b.k === 'harakat'}
    <div class="b harakat" dir="rtl" lang="ar">
      {#each b.items as s, j (j)}<span class="syl" style="--d: {j}"
          ><span class="hk"><Bidi text={s} base="ar" /></span></span
        >{/each}
    </div>
  {:else if b.k === 'phrase'}
    <div class="b phrase">
      <p class="ws" dir="rtl" lang="ar">
        {#each words(b.ar) as w, j (j)}<span class="w" style="--d: {j}"
            ><Ar text={w} {lettres} /></span
          >
        {/each}
      </p>
      {#if b.fr}<span class="fr up late"><Bidi text={b.fr} /></span>{/if}
    </div>
  {:else if b.k === 'bulle'}
    <div class="b dlg">
      {#if n > 0 && beats[n - 1]?.k === 'bulle'}
        {@const p = beats[n - 1] as Extract<VivBeat, { k: 'bulle' }>}
        <div class="bl s{p.side} prev">
          <span class="av" aria-hidden="true"></span>
          <div class="bub"><Ar text={p.ar} {lettres} /></div>
        </div>
      {/if}
      <div class="bl s{b.side} now">
        <span class="av" aria-hidden="true"></span>
        <div class="bub">
          {#if b.qui}<span class="qui"><Ar text={b.qui} /></span>{/if}
          <Ar text={b.ar} {lettres} />
          {#if b.fr}<span class="fr"><Bidi text={b.fr} /></span>{/if}
        </div>
      </div>
    </div>
  {:else if b.k === 'schema'}
    <div class="b schema">
      <span class="tag">{t('viv.structure')}</span>
      {#each b.parts as p, j (j)}
        <div class="row" dir="rtl" style="--d: {j}">
          <span class="fixe"><Ar text={p.fixe} /></span>
          {#if p.slot}<span class="plus" aria-hidden="true">+</span><span class="case"
              ><span class="fill"><Ar text={p.slot} /></span></span
            >{/if}
        </div>
      {/each}
    </div>
  {:else if b.k === 'regle'}
    <div class="b regle" style="--k: var(--c{b.c ?? 1})">
      {#if b.signe}<span class="signe" lang="ar" dir="rtl"><Bidi text={b.signe} base="ar" /></span
        >{/if}
      {#if b.l}<span class="lt" lang="ar"><Bidi text={b.l} base="ar" /></span>{/if}
      {#if b.ar}<span class="ar rule"><Ar text={b.ar} {lettres} /></span>{/if}
      {#if b.fr}<span class="fr up late"><Bidi text={b.fr} /></span>{/if}
    </div>
  {:else if b.k === 'racine' || b.k === 'conj' || b.k === 'nombre' || b.k === 'heure'}
    <!-- A21b : racine et schème, conjugaison, nombres, heure (même morceau à la demande que le lecteur) -->
    <ModelesPlus {b} {lettres} />
  {:else if b.k === 'question'}
    {@const a = answers[n]}
    <div class="b question" data-testid="question-eclair" data-kind={b.q.kind}>
      <span class="tag"
        ><Bidi
          text={t('viv.question', {
            n: beats.slice(0, n + 1).filter((x) => x.k === 'question').length,
            total: nQ,
          })}
        /></span
      >
      {#if b.q.kind === 'premiere_lettre'}
        {@const q = b.q}
        <p class="qt">{t('viv.q_premiere_lettre')}</p>
        <div class="qrow">
          {@render img(q.img, 'pic sm')}
          <span class="ar big" dir="rtl" lang="ar"
            ><span class="gap" aria-hidden="true"
              ><Bidi text={a ? q.reponse : '?'} base="ar" /></span
            ><Bidi text={q.suite} base="ar" /></span
          >
        </div>
        <div class="opts" dir="rtl">
          {#each q.options as o (o)}<button
              type="button"
              class="opt ar"
              lang="ar"
              class:ok={a && o === q.reponse}
              class:ko={a && a.v === o && !a.ok}
              disabled={!!a}
              onclick={() => answer(o, o === q.reponse)}><Bidi text={o} base="ar" /></button
            >{/each}
        </div>
      {:else if b.q.kind === 'contient'}
        {@const q = b.q}
        <p class="qt"><Bidi text={t('viv.q_contient', { l: q.cible })} /></p>
        <span class="ar big"><Ar text={q.ar} /></span>
        <div class="opts">
          {#each [true, false] as o (o)}<button
              type="button"
              class="opt"
              class:ok={a && o === q.oui}
              class:ko={a && a.v === String(o) && !a.ok}
              disabled={!!a}
              onclick={() => answer(String(o), o === q.oui)}
              ><Bidi text={o ? t('viv.oui') : t('viv.non')} /></button
            >{/each}
        </div>
      {:else}
        {@const q = b.q}
        <p class="qt">{t('viv.q_ecoute')}</p>
        <button type="button" class="opt listen" onclick={() => listen(q.dit)}
          >{t('viv.q_ecouter')}</button
        >
        <div class="opts" dir="rtl">
          {#each q.options as o (o)}<button
              type="button"
              class="opt ar"
              lang="ar"
              class:ok={a && o === q.dit}
              class:ko={a && a.v === o && !a.ok}
              disabled={!!a}
              onclick={() => answer(o, o === q.dit)}><Bidi text={o} base="ar" /></button
            >{/each}
        </div>
      {/if}
      {#if a}<p class="verdict" class:good={a.ok} role="status">
          <Bidi text={a.ok ? t('viv.juste') : t('viv.faux')} />
        </p>{/if}
    </div>
  {/if}
{/snippet}

<section
  class="viv"
  class:calme={reduced}
  class:cond={condense}
  bind:this={root}
  data-testid={condense ? 'vivante-condense' : 'vivante'}
  data-slot={motion.slot}
  data-model={motion.model}
  data-state={skipped
    ? 'passee'
    : ended
      ? 'finie'
      : i < 0
        ? 'attente'
        : paused
          ? 'pause'
          : 'lecture'}
  aria-label={condense ? t('viv.condense_titre') : t('viv.etiquette')}
>
  {#if condense && !open && !skipped}
    <div class="intro">
      <span class="badge" aria-hidden="true"
        ><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg></span
      >
      <div>
        <h2 class="ttl">{t('viv.condense_titre')}</h2>
        <p class="fr"><Bidi text={t('viv.condense_desc', { duree: total, n: nQ })} /></p>
      </div>
      <button
        type="button"
        class="primary go"
        data-testid="condense-lancer"
        onclick={() => ((open = true), start())}>{t('viv.condense_lancer')}</button
      >
    </div>
  {:else if skipped || ended}
    <div class="mini">
      {#if ended && condense && nQ}<p class="fr score" role="status">
          <Bidi text={`${t('viv.fin_condense')} ${t('viv.score', { ok: score, n: nQ })}`} />
        </p>{/if}
      <button
        type="button"
        class="again"
        data-testid="vivante-revoir"
        onclick={() => ((open = true), start())}
        ><svg viewBox="0 0 24 24" aria-hidden="true"
          ><path
            d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
          /></svg
        ><Bidi text={`${t('viv.revoir_mouvement')} · ${total}`} /></button
      >
    </div>
  {:else}
    <div class="bars" aria-hidden="true">
      {#each beats as _b, j (j)}<span><i style="width: {pct(j)}%"></i></span>{/each}
    </div>
    <div class="stage" class:paused class:attente={i < 0}>
      <svg class="deco" viewBox="0 0 200 200" aria-hidden="true"
        ><circle cx="30" cy="40" r="26" /><circle cx="176" cy="160" r="40" /><path
          class="star"
          d="M100 62l11 27 27-11-11 27 27 11-27 11 11 27-27-11-11 27-11-27-27 11 11-27-27-11 27-11-11-27 27 11z"
        /></svg
      >
      <span class="tag top"
        ><Bidi
          text={condense ? t(`viv.m_${motion.model}`) : `${t(`viv.m_${motion.model}`)} · ${total}`}
        /></span
      >
      {#if beat && i >= 0}{#key i}{@render show(beat, i)}{/key}{/if}
      {#if i < 0}<button
          type="button"
          class="play"
          data-testid="vivante-lire"
          aria-label={t('viv.lecture')}
          onclick={start}
          ><svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d="M8 5v14l11-7z" fill="currentColor" /></svg
          ></button
        >{/if}
    </div>
    <div class="ctl">
      <button
        type="button"
        class="ic"
        data-testid="vivante-pause"
        aria-label={i < 0 || paused ? t('viv.lecture') : t('viv.pause')}
        onclick={togglePause}
        ><svg viewBox="0 0 24 24" aria-hidden="true"
          >{#if i < 0 || paused}<path d="M8 5v14l11-7z" fill="currentColor" />{:else}<path
              d="M7 5h4v14H7zM13 5h4v14h-4z"
              fill="currentColor"
            />{/if}</svg
        ></button
      >
      <button
        type="button"
        class="ic"
        data-testid="vivante-recommencer"
        aria-label={t('viv.revoir')}
        onclick={start}
        ><svg viewBox="0 0 24 24" aria-hidden="true"
          ><path
            d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
          /></svg
        ></button
      >
      {#if hasVoice}<button
          type="button"
          class="voice"
          aria-pressed={voice}
          data-testid="vivante-voix"
          title={t('viv.voix_aria')}
          onclick={toggleVoice}
          ><svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor" />{#if voice}<path
                d="M15.5 8.5a5 5 0 0 1 0 7"
                stroke="currentColor"
                stroke-width="2"
                fill="none"
                stroke-linecap="round"
              />{/if}</svg
          >{t('viv.voix')}</button
        >{/if}
      <span class="sp"></span>
      <button type="button" class="skip" data-testid="vivante-passer" onclick={skip}
        >{t('viv.passer')}<svg viewBox="0 0 24 24" aria-hidden="true"
          ><path d="M6 5l9 7-9 7zM17 5h2v14h-2z" fill="currentColor" /></svg
        ></button
      >
    </div>
    {#if reduced}<p class="fr calm-note">{t('viv.calme')}</p>{/if}
  {/if}
</section>

<style>
  .viv {
    --v1: color-mix(in srgb, var(--primary) 14%, var(--card));
    --v2: color-mix(in srgb, var(--accent) 12%, var(--card));
    margin: 14px 0 22px;
    border-radius: 22px;
    background: linear-gradient(135deg, var(--v1), var(--v2));
    border: 1px solid color-mix(in srgb, var(--primary) 22%, var(--line));
    box-shadow: var(--shadow-float);
    padding: 10px 12px 8px;
    overflow: hidden;
    color: var(--ink);
  }
  .bars {
    display: flex;
    gap: 4px;
    direction: ltr;
  }
  .bars span {
    flex: 1;
    height: 4px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--ink) 12%, transparent);
    overflow: hidden;
  }
  .bars i {
    display: block;
    height: 100%;
    background: var(--primary);
    transition: width 100ms linear;
  }
  .stage {
    position: relative;
    min-height: 236px;
    display: grid;
    place-items: center;
    padding: 26px 4px 6px;
  }
  .deco {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    fill: none;
    stroke: color-mix(in srgb, var(--primary) 12%, transparent);
    stroke-width: 1;
    pointer-events: none;
  }
  .deco .star {
    transform-origin: 100px 100px;
    animation: spin 40s linear infinite;
    stroke: color-mix(in srgb, var(--accent) 16%, transparent);
  }
  .arl {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 2px 12px;
    align-items: baseline;
    width: 100%;
  }
  .tag {
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    color: var(--primary);
    background: color-mix(in srgb, var(--card) 75%, transparent);
    border-radius: 99px;
    padding: 2px 10px;
  }
  .tag.top {
    position: absolute;
    top: 6px;
    inset-inline-start: 4px;
  }
  .b {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
    width: 100%;
    animation: rise 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  .ar,
  .ws,
  .harakat,
  .formes,
  .signe,
  .lt,
  .opt.ar,
  .draw text {
    font-family: var(--font-ar);
  }
  .fr {
    color: var(--ink2);
    font-size: 0.95rem;
    max-width: 34ch;
  }
  .up {
    animation: rise 500ms 600ms both;
  }
  .up.late {
    animation-delay: 1200ms;
  }
  /* lettre qui se dessine : contour tracé, puis remplissage */
  .draw {
    width: 150px;
    height: 136px;
  }
  .draw text {
    font-size: 150px;
    fill: var(--k);
    fill-opacity: 0;
    stroke: var(--k);
    stroke-width: 1.6;
    stroke-dasharray: 900;
    stroke-dashoffset: 900;
    animation:
      trace 1600ms ease-out forwards,
      fill 600ms 1300ms forwards;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 2px 12px;
    align-items: baseline;
    animation: rise 500ms 900ms both;
  }
  .nom {
    font-size: calc(var(--ar-size) * 1.15);
    color: var(--k);
    font-weight: 700;
  }
  .pts {
    font-size: var(--ar-size);
  }
  .formes {
    display: flex;
    gap: 14px;
    font-size: calc(var(--ar-size) * 1.3);
  }
  .formes span {
    background: var(--card);
    border-radius: 12px;
    padding: 0 10px;
    animation: pop 380ms calc(1700ms + var(--d) * 220ms) both;
  }
  .pic {
    width: 96px;
    height: 96px;
    animation: pop 520ms cubic-bezier(0.3, 1.5, 0.5, 1) both;
  }
  .pic.sm {
    width: 64px;
    height: 64px;
  }
  /* mot qui s'écrit de droite à gauche */
  .wipe {
    font-size: calc(var(--ar-size) * 1.7);
    line-height: 1.6;
    animation: wipe 900ms 250ms ease-out both;
  }
  .harakat {
    display: flex;
    flex-direction: row;
    justify-content: center;
    gap: 14px;
    font-size: calc(var(--ar-size) * 2.4);
    line-height: 1.5;
  }
  .syl {
    background: var(--card);
    border-radius: 18px;
    padding: 0 18px;
    box-shadow: var(--shadow-card);
    animation: pop 420ms calc(var(--d) * 650ms) both;
  }
  /* syllabe lue à son tour : lueur (la voyelle brève est mise en relief par la notion, temps précédent) */
  .hk {
    animation: glow 1400ms calc(300ms + var(--d) * 650ms) ease-in-out 2;
  }
  .ws {
    margin: 0;
    font-size: calc(var(--ar-size) * 1.45);
    line-height: 1.8;
  }
  .w {
    display: inline-block;
    animation: rise 420ms calc(200ms + var(--d) * 320ms) both;
  }
  .dlg {
    gap: 8px;
  }
  .bl {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    width: 100%;
  }
  .bl.s1 {
    flex-direction: row-reverse;
  }
  /* réplique précédente : plus petite, sur fond de surface (texte au contraste plein, WCAG AA) */
  .bl.prev {
    transform: scale(0.94);
  }
  .bl.prev .bub {
    background: var(--surface);
    box-shadow: none;
  }
  .bl.now {
    animation: slide 520ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  .av {
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--c1);
    opacity: 0.85;
  }
  .s1 .av {
    border-radius: 9px;
    transform: rotate(45deg) scale(0.8);
    background: var(--c2);
  }
  .bub {
    flex: 1;
    background: var(--card);
    border-radius: 18px;
    padding: 6px 12px;
    text-align: right;
    font-size: calc(var(--ar-size) * 1.05);
    box-shadow: var(--shadow-card);
  }
  .bub .fr {
    display: block;
    text-align: left;
    font-size: 0.88rem;
  }
  .qui {
    display: block;
    font-size: 0.7em;
    color: var(--primary);
  }
  .schema {
    gap: 10px;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: center;
    font-size: calc(var(--ar-size) * 1.15);
    animation: rise 420ms calc(var(--d) * 900ms) both;
  }
  .fixe {
    background: var(--primary);
    color: var(--on-primary);
    border-radius: 12px;
    padding: 0 12px;
  }
  .plus {
    color: var(--ink2);
    font-weight: 800;
  }
  .case {
    min-width: 80px;
    border: 2px dashed var(--accent);
    border-radius: 12px;
    padding: 0 12px;
    background: var(--card);
  }
  .fill {
    display: inline-block;
    animation: pop 420ms calc(700ms + var(--d) * 900ms) both;
  }
  .signe {
    font-size: calc(var(--ar-size) * 2.6);
    line-height: 1.2;
    color: var(--c0);
    animation: glow 1600ms 300ms ease-in-out 2;
  }
  .lt {
    font-size: calc(var(--ar-size) * 2.4);
    color: var(--k);
    animation: pop 500ms both;
  }
  .rule {
    font-size: calc(var(--ar-size) * 1.3);
    animation: wipe 900ms 300ms ease-out both;
  }
  .qt {
    margin: 0;
    font-weight: 700;
  }
  .qrow {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .big {
    font-size: calc(var(--ar-size) * 1.8);
  }
  .gap {
    color: var(--accent);
  }
  .opts {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .opt {
    min-width: 64px;
    min-height: 48px;
    border-radius: 14px;
    border: 2px solid var(--line);
    background: var(--card);
    color: var(--ink);
    font-size: 1rem;
    cursor: pointer;
  }
  .opt.ar {
    font-size: calc(var(--ar-size) * 1.2);
  }
  .opt.ok {
    border-color: var(--good);
    background: var(--ok-bg);
    color: var(--ok-ink);
  }
  .opt.ko {
    border-color: var(--bad-ink);
    background: var(--bad-bg);
    color: var(--bad-ink);
  }
  .verdict {
    margin: 0;
    font-weight: 700;
    color: var(--bad-ink);
  }
  .verdict.good {
    color: var(--ok-ink);
  }
  .play {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    border: 0;
    background: var(--primary);
    color: var(--on-primary);
    box-shadow: var(--shadow-float);
    cursor: pointer;
  }
  .play svg {
    width: 34px;
    height: 34px;
  }
  .ctl {
    display: flex;
    gap: 6px;
    align-items: center;
    padding-top: 6px;
    direction: ltr;
  }
  .ctl button,
  .again,
  .go {
    min-height: 44px;
    border-radius: 99px;
    border: 1px solid color-mix(in srgb, var(--primary) 30%, var(--line));
    background: var(--card);
    color: var(--primary);
    font: inherit;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    cursor: pointer;
  }
  .ctl .ic {
    width: 44px;
    padding: 0;
    justify-content: center;
  }
  .ctl svg,
  .again svg {
    width: 20px;
    height: 20px;
  }
  .voice[aria-pressed='true'] {
    background: var(--primary);
    color: var(--on-primary);
  }
  .sp {
    flex: 1;
  }
  .skip {
    color: var(--ink2) !important;
  }
  button:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  .mini {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  }
  .mini .score {
    margin: 0;
    font-weight: 700;
    color: var(--ink);
  }
  .intro {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 12px;
    align-items: center;
  }
  .intro .ttl {
    margin: 0;
    font-size: 1.05rem;
    border: 0;
    padding: 0;
  }
  .intro p {
    margin: 2px 0 0;
  }
  .badge {
    width: 48px;
    height: 48px;
    border-radius: 16px;
    background: var(--primary);
    color: var(--on-primary);
    display: grid;
    place-items: center;
  }
  .badge svg {
    width: 26px;
    height: 26px;
  }
  .go {
    grid-column: 1 / -1;
    justify-content: center;
    background: var(--primary);
    color: var(--on-primary);
  }
  .calm-note {
    margin: 4px 0 0;
    font-size: 0.8rem;
  }
  /* pause : tout s'arrête là où il en est */
  .paused :global(*),
  .paused {
    animation-play-state: paused !important;
  }
  /* version calme (appareil : moins d'animations) : simples fondus, aucun mouvement */
  .calme .b,
  .calme .b :global(*),
  .calme :global(.plus),
  .calme :global(.plus *) {
    animation: fade 500ms ease both !important;
  }
  .calme .draw text {
    stroke-dashoffset: 0;
    fill-opacity: 1;
  }
  .calme .deco .star {
    animation: none !important;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }
  @keyframes slide {
    from {
      opacity: 0;
      transform: translateY(16px) scale(0.96);
    }
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.6);
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes wipe {
    from {
      clip-path: inset(0 0 0 100%);
    }
    to {
      clip-path: inset(0 0 0 0);
    }
  }
  @keyframes trace {
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes fill {
    to {
      fill-opacity: 1;
    }
  }
  @keyframes glow {
    50% {
      text-shadow: 0 0 14px color-mix(in srgb, var(--c0) 70%, transparent);
    }
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
