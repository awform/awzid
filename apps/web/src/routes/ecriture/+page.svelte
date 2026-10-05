<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { demoProfileFor, enqueue, type DevProfile } from '$lib/attempts';
  import { localIso } from '$lib/hifz';
  import { t } from '$lib/i18n';
  import type { Verdict } from '$lib/trace/evaluate';
  import { formText, LETTERS, type Form } from '$lib/trace/letters';
  import TraceCanvas from '$lib/trace/TraceCanvas.svelte';
  import EcritureNiveau from '$lib/parcours/EcritureNiveau.svelte';

  /**
   * Écriture (cahier § 2.4) : tracé guidé des lettres et de leurs formes, en trois étapes, ou repasser un
   * mot de la leçon (`?mot=`). Le papier reste le mode principal : l'application guide et consigne ;
   * jamais de note. Chaque essai est gardé (file hors ligne) pour le tableau de bord.
   */
  let profile = $state<DevProfile | null>(null);
  let letter = $state(LETTERS[1]!.l);
  let form = $state<Form>('isolee');
  let step = $state<1 | 2 | 3>(1);
  const word = $derived(page.url.searchParams.get('mot'));
  const model = $derived(LETTERS.find((x) => x.l === letter) ?? LETTERS[0]!);
  const text = $derived(word ?? formText(letter, form));
  let done = $state(0);

  onMount(async () => {
    profile = await demoProfileFor('');
    const l = page.url.searchParams.get('lettre');
    if (l && LETTERS.some((x) => x.l === l)) letter = l;
  });

  function pick(l: string) {
    letter = l;
    if (!(LETTERS.find((x) => x.l === l)?.forms ?? []).includes(form)) form = 'isolee';
  }

  async function record(v: Verdict) {
    if (v.ok) done++;
    if (!profile) return;
    await enqueue({
      profileId: profile.id,
      unitId: 'entrainement',
      eventType: 'trace',
      response: {
        item: word ? `mot:${word}`.slice(0, 80) : `${letter}:${form}`,
        ok: v.ok,
        day: localIso(),
        details: { etape: step, motif: v.reason ?? null },
      },
    });
    // une étape réussie : on propose la suivante
    if (v.ok && step < 3) setTimeout(() => (step = (step + 1) as 2 | 3), 900);
  }
  const FORMS: readonly Form[] = ['isolee', 'debut', 'milieu', 'fin'];
</script>

<svelte:head><title>{t('app.nom')} — {t('onglets.ecriture')}</title></svelte:head>

<h1>{t('onglets.ecriture')}</h1>
<!-- A27 : Mon cahier (écriture des leçons de mon niveau) et J'écris le Coran (à partir du premier verset) -->
{#if profile && !word}<EcritureNiveau {profile} />{/if}
<h2 class="trace-titre">{t('parc.tracer_lettres')}</h2>
<p class="muted">{t('ecriture.trace_texte')}</p>

{#if !word}
  <section class="card">
    <h2>{t('trace.choisir_lettre')}</h2>
    <div class="letters" lang="ar" dir="rtl" data-testid="lettres">
      {#each LETTERS as x (x.l)}
        <button
          type="button"
          class="lt"
          class:sel={x.l === letter}
          onclick={() => pick(x.l)}
          aria-pressed={x.l === letter}
          data-lettre={x.l}><Bidi text={x.l} base="ar" /></button
        >
      {/each}
    </div>
    <div class="row" role="group" aria-label={t('trace.forme')}>
      {#each FORMS as f (f)}
        <button
          type="button"
          class:primary={form === f}
          disabled={!model.forms.includes(f)}
          onclick={() => (form = f)}
          data-forme={f}><Bidi text={t(`lecon.forme_${f}`)} /></button
        >
      {/each}
    </div>
  </section>
{:else}
  <p class="card">{t('trace.mot_consigne')}</p>
{/if}

<section class="card">
  <div class="row" role="group" aria-label={t('trace.etape')}>
    {#each [1, 2, 3] as s (s)}
      <button
        type="button"
        class:primary={step === s}
        onclick={() => (step = s as 1 | 2 | 3)}
        data-etape={s}><Bidi text={t(`trace.etape_${s}`)} /></button
      >
    {/each}
  </div>
  <TraceCanvas {text} start={word ? null : model.start} strict={!word} {step} ondone={record} />
  {#if done}<p class="muted small" data-testid="reussis">
      <Bidi text={t('trace.reussis', { n: done })} />
    </p>{/if}
  {#if !profile}<p class="muted small">{t('trace.sans_profil')}</p>{/if}
</section>
<p class="muted">{t('ecriture.en_attendant')}</p>

<style>
  .letters {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
    gap: 6px;
  }
  .lt {
    font-family: 'Noto Naskh Arabic', serif;
    font-size: 1.6rem;
    min-height: 48px;
  }
  .lt.sel {
    border-color: var(--teal);
    background: var(--ok-bg);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 8px 0;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
