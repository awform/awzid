<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { demoProfileFor } from '$lib/attempts';
  import { hifzToday, loadMeta } from '$lib/hifz';
  import { t } from '$lib/i18n';
  import {
    ecriture,
    etapeCoranFaite,
    etapesCoran,
    juzAmmaShare,
    versetMots,
    type Ecriture,
  } from '$lib/parcours/parcours';
  import type { ProfileInfo } from '$lib/session';
  import Icon from '$lib/ui/Icon.svelte';
  import { tanwinDisplay } from '@awform/content/text';
  import Loading from '$lib/ui/Loading.svelte';

  /**
   * A27 — « J'écris le Coran » : 1. copie du verset (modèle Tanzil), puis comparaison guidée MOT PAR MOT avec une
   * liste à cocher (lettres, points, voyelles, chadda) ; 2. dictée par un récitateur du Complexe (après l'étape 1
   * du verset) ; 3. de mémoire (qc1 terminé et la moitié environ du Juzʾ ʿAmma mémorisée). Le modèle reste caché
   * jusqu'à « Corriger » pendant la dictée et l'écriture de mémoire. L'élève se corrige lui-même : AUCUN verdict
   * automatique, aucune IA.
   */
  const CHECKS = ['lettres', 'points', 'voyelles', 'chadda'] as const;
  const STEPS = [1, 2, 3] as const;
  let profile = $state<ProfileInfo | null>(null);
  let w = $state<Ecriture | null>(null);
  let juz = $state(0);
  let step = $state<1 | 2 | 3>(1);
  let corriger = $state(false);
  let coches = $state<Record<string, boolean>>({});
  let saved = $state(false);
  let loaded = $state(false);
  const ref = $derived(page.url.searchParams.get('ref') ?? '');
  const v = $derived(w?.coran.versets.find((x) => x.ref === ref) ?? null);
  // mots du verset tel qu'affiché (tanwīn du Muṣḥaf de Médine), découpés aux espaces seulement
  const mots = $derived(v?.texte ? versetMots(tanwinDisplay(v.texte)) : []);
  const steps = $derived(
    w
      ? etapesCoran(
          ref,
          [...w.coran.faits, ...(saved ? [`${ref}:${step}`] : [])],
          w.coran.qc1Termine,
          juz,
        )
      : null,
  );
  const allChecked = $derived(
    mots.length > 0 && mots.every((_, i) => CHECKS.every((c) => coches[`${i}:${c}`])),
  );

  onMount(async () => {
    profile = await demoProfileFor('');
    if (profile) {
      const r = await ecriture(profile.id);
      if (r.ok) w = r.data;
      const h = await hifzToday(profile.id).catch(() => null);
      const meta = await loadMeta().catch(() => null);
      if (h && meta)
        juz = juzAmmaShare(
          h.acquis,
          (meta.weights ?? []).map((x) => x.length),
        );
    }
    loaded = true;
  });
  function choose(s: 1 | 2 | 3) {
    step = s;
    corriger = false;
    coches = {};
    saved = false;
  }
  async function finish() {
    if (!profile) return;
    await etapeCoranFaite(profile.id, ref, step, coches);
    saved = true;
  }
  const [sura, aya] = $derived(ref.split(':'));
</script>

<svelte:head><title>{t('app.nom')} — {t('parc.ecris_coran')}</title></svelte:head>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
<p><a href={`${resolve('/')}?onglet=ecriture`}>{t('commun.retour')}</a></p>
<h1>{t('parc.ecris_coran')}</h1>

{#if !loaded}
  <Loading lines={3} />
{:else if !w || !w.coran.visible || !v || !v.texte}
  <p class="card" data-testid="coran-ferme">{t('parc.ecris_coran_ferme')}</p>
{:else}
  <section class="card rasm">
    <p><Icon name="info" size={18} /> <Bidi text={t('parc.rasm_texte')} /></p>
  </section>

  <div class="steps" role="group" aria-label={t('parc.etapes')}>
    {#each STEPS as s (s)}
      <button
        type="button"
        class:on={step === s}
        disabled={!steps?.[s]}
        onclick={() => choose(s)}
        data-etape={s}
        ><span class="n"><Bidi text={s} /></span><Bidi text={t(`parc.etape_${s}`)} /></button
      >
    {/each}
  </div>
  {#if !steps?.[3]}<p class="muted small" data-testid="etape3-condition">
      <Bidi text={t('parc.etape3_condition', { pct: Math.round(juz * 100) })} />
    </p>{/if}

  <section class="card work" data-testid="copie-verset" data-ref={ref} data-etape={step}>
    <p class="consigne"><Bidi text={t(`parc.consigne_${step}`)} /></p>
    {#if step === 1 && !corriger}
      <p class="model" lang="ar" dir="rtl">
        <span class="quran-text" data-testid="modele">{tanwinDisplay(v.texte)}</span>
      </p>
    {:else if step === 2 && !corriger}
      <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
      <a
        class="button"
        href={`${resolve('/coran/ecouter')}?s=${sura}&a=${aya}`}
        data-testid="ecouter-recitateur"
        ><Icon name="casque" size={18} />{t('parc.ecouter_recitateur')}</a
      >
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
      <p class="muted small">{t('parc.modele_cache')}</p>
    {:else if step === 3 && !corriger}
      <p class="muted small">{t('parc.modele_cache')}</p>
    {/if}
    <p class="muted small"><Bidi text={t('parc.verset_ref', { ref })} /></p>

    {#if !corriger}
      <button type="button" class="primary" onclick={() => (corriger = true)} data-testid="corriger"
        >{t('parc.corriger')}</button
      >
    {:else}
      <p><Bidi text={t('parc.comparer')} /></p>
      <ol class="words">
        {#each mots as m, i (i)}
          <li data-mot={i}>
            <span class="w quran-text" lang="ar" dir="rtl">{m}</span>
            <div class="checks">
              {#each CHECKS as c (c)}
                <label class:ok={coches[`${i}:${c}`]}
                  ><input
                    type="checkbox"
                    checked={!!coches[`${i}:${c}`]}
                    onchange={(e) =>
                      (coches = { ...coches, [`${i}:${c}`]: e.currentTarget.checked })}
                    data-check={`${i}:${c}`}
                  /><Bidi text={t(`parc.check_${c}`)} /></label
                >
              {/each}
            </div>
          </li>
        {/each}
      </ol>
      {#if saved}
        <p class="card ok" role="status" data-testid="etape-faite">{t('parc.etape_faite')}</p>
      {:else}
        <button type="button" class="primary" onclick={finish} data-testid="terminer-etape"
          ><Bidi text={allChecked ? t('parc.tout_juste') : t('parc.j_ai_corrige')} /></button
        >
        <p class="muted small">{t('parc.pas_de_note')}</p>
      {/if}
    {/if}
  </section>
{/if}

<style>
  .rasm {
    background: var(--info-bg);
  }
  .steps {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    margin: var(--space-m) 0 4px;
  }
  .steps button {
    display: grid;
    justify-items: center;
    gap: 2px;
    min-height: 64px;
    border-radius: var(--radius-md);
    font-size: 0.85rem;
  }
  .steps button.on {
    background: var(--primary);
    color: var(--on-primary);
    border-color: var(--primary);
  }
  .n {
    font-weight: 800;
    font-size: 1.1rem;
  }
  .work {
    display: grid;
    gap: 10px;
    justify-items: stretch;
  }
  .consigne {
    font-weight: 700;
  }
  .model {
    font-family: var(--font-quran);
    font-size: clamp(1.6rem, 7vw, 2.4rem);
    line-height: 2.2;
    text-align: center;
    margin: 0;
    padding: var(--space-m);
    border-radius: var(--radius-md);
    background: var(--paper, var(--surface));
  }
  .words {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .words li {
    display: grid;
    gap: 6px;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    padding: 8px 10px;
  }
  .w {
    font-family: var(--font-quran);
    font-size: 2rem;
    line-height: 2;
    text-align: center;
  }
  .checks {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
  }
  .checks label {
    display: flex;
    gap: 6px;
    align-items: center;
    min-height: 44px;
    padding: 0 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--line);
  }
  .checks label.ok {
    background: var(--ok-bg);
    color: var(--ok-ink);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
