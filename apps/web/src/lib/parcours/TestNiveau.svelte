<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount, setContext } from 'svelte';
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import { demoProfileFor } from '$lib/attempts';
  import type { ExamAnswers } from '$lib/epreuves';
  import ExamExercise from '$lib/ExamExercise.svelte';
  import { t } from '$lib/i18n';
  import { levelLabel } from '$lib/levels';
  import { call, type ProfileInfo } from '$lib/session';
  import Sprite from '$lib/Sprite.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import { modeLocal } from './mode';

  /**
   * A27 — test de POSITIONNEMENT (court : deux exercices de l'épreuve de fin de chaque niveau, du premier au
   * niveau qui résiste) ou ÉPREUVE DE PASSAGE (exercices notables de l'épreuve de fin du niveau courant).
   * Uniquement des exercices existants des livres ; la note vient du serveur (aucun corrigé sur l'appareil) ;
   * le niveau fixé peut être corrigé par le maître. Enfant : code parent.
   */
  let { mode, matiere }: { mode: 'positionnement' | 'epreuve'; matiere: 'arabe' | 'sciences' } =
    $props();
  type Obj = Record<string, unknown>;
  interface View {
    unit: string;
    niveau: string;
    titre: string;
    lesson: { lecture: Obj | null; exercices: Obj[] };
    exercises: Array<{ id: string; type: string }>;
    illustrations: Record<string, { viewBox: string; svg: string }>;
  }
  let profile = $state<ProfileInfo | null>(null);
  let niveau = $state<string | null>(null);
  let courant = $state<string | null>(null);
  let view = $state<View | null>(null);
  let answers = $state<ExamAnswers>({});
  let pin = $state('');
  let started = $state(false);
  let busy = $state(false);
  let error = $state('');
  let passes = $state<string[]>([]);
  let result = $state<{
    niveau: string;
    change?: boolean;
    reussi: boolean;
    etoiles?: number;
  } | null>(null);
  // A39 : défi doux (enfants, ados : étoiles, essais libres) ; mode serein : épreuve facultative (certificat)
  const doux = $derived(
    mode === 'epreuve' && profile ? modeLocal(profile.id, profile.kind) : 'verification',
  );
  setContext('illustrations', () => view?.illustrations ?? {});

  const base = $derived(
    profile
      ? `/profiles/${profile.id}/${mode === 'epreuve' ? 'epreuve' : 'positionnement'}/${matiere}`
      : '',
  );
  onMount(async () => {
    profile = await demoProfileFor('');
    if (!profile) return;
    if (mode === 'positionnement') {
      const r = await call<{ aTester: string | null; courant: string | null }>('GET', base);
      if (r.ok && r.data) {
        niveau = r.data.aTester;
        courant = r.data.courant;
      } else error = t(`erreur.${r.code ?? 'reseau'}`);
    }
  });

  async function loadLevel() {
    view = null;
    answers = {};
    const r = await call<View>('GET', mode === 'epreuve' ? base : `${base}/${niveau}`);
    if (r.ok && r.data) view = r.data;
    else error = t(`erreur.${r.code ?? 'reseau'}`);
  }
  async function start() {
    started = true;
    error = '';
    await loadLevel();
  }
  async function send() {
    if (!profile || !view) return;
    busy = true;
    error = '';
    const r = await call<{
      reussi: boolean;
      fini?: boolean;
      suivant?: string;
      niveau?: string;
      change?: boolean;
      etoiles?: number;
    }>(
      'POST',
      mode === 'epreuve' ? base : `${base}/${view.niveau}`,
      { answers },
      profile.kind === 'enfant' && pin ? { 'x-parent-pin': pin } : undefined,
    );
    busy = false;
    if (!r.ok || !r.data) {
      error = t(`erreur.${r.code ?? 'reseau'}`);
      return;
    }
    if (mode === 'positionnement' && r.data.reussi && !r.data.fini && r.data.suivant) {
      passes = [...passes, view.niveau];
      niveau = r.data.suivant;
      await loadLevel();
      window.scrollTo({ top: 0 });
      return;
    }
    result = {
      niveau: r.data.niveau ?? view.niveau,
      change: r.data.change,
      reussi: r.data.reussi,
      etoiles: r.data.etoiles,
    };
  }
  const phrases = $derived(
    (() => {
      const L = (view?.lesson.lecture ?? {}) as Obj;
      const ps = [
        ...((L.phrases as Array<{ ar?: string }> | undefined) ?? []),
        ...((L.paragraphes as Array<string | { ar?: string }> | undefined) ?? []).map((p) =>
          typeof p === 'string' ? { ar: p } : p,
        ),
      ];
      return ps.map((p) => p.ar ?? '').filter(Boolean);
    })(),
  );
</script>

{#if view}<Sprite illustrations={view.illustrations} />{/if}

<p><a href={resolve(matiere === 'sciences' ? '/sciences' : '/')}>{t('commun.retour')}</a></p>
<h1>
  <Bidi
    text={mode === 'epreuve'
      ? t(doux === 'douce' ? 'ser.defi' : 'parc.epreuve_titre')
      : t('parc.positionnement_titre')}
  />
</h1>

{#if !profile}
  <p class="card">
    {t('auj.sans_profil')} <a href={resolve('/profils')}>{t('auj.choisir_profil')}</a>
  </p>
{:else if result}
  <section
    class="card result"
    class:ok={result.reussi || result.change}
    data-testid="resultat-test"
  >
    <span class="r-ic"
      ><Icon name={result.reussi || result.change ? 'etoile' : 'revisions'} size={36} /></span
    >
    {#if mode === 'positionnement'}
      <h2><Bidi text={t('parc.niveau_fixe', { niveau: levelLabel(result.niveau) })} /></h2>
      <p>
        <Bidi
          text={result.change ? t('parc.positionnement_change') : t('parc.positionnement_garde')}
        />
      </p>
    {:else if result.reussi}
      <h2><Bidi text={t('parc.epreuve_reussie', { niveau: levelLabel(result.niveau) })} /></h2>
      {#if doux === 'serein'}<p data-testid="certificat-possible">{t('ser.certif_ok')}</p>{/if}
    {:else}
      <h2>{t('parc.epreuve_pas_encore')}</h2>
      <p><Bidi text={t(doux === 'verification' ? 'parc.epreuve_conseil' : 'ser.defi_encore')} /></p>
    {/if}
    {#if result.etoiles}
      <!-- A39 : des étoiles, jamais de note chiffrée -->
      <p
        class="stars"
        data-testid="etoiles"
        data-n={result.etoiles}
        aria-label={t('ser.etoiles', { n: result.etoiles })}
      >
        <Bidi text={'★'.repeat(result.etoiles) + '☆'.repeat(3 - result.etoiles)} />
      </p>
    {/if}
    <p class="muted small">{t('parc.maitre_corrige')}</p>
    <a
      class="button primary"
      href={resolve(matiere === 'sciences' ? '/sciences' : '/')}
      data-testid="vers-niveau">{t('parc.vers_mon_niveau')}</a
    >
  </section>
{:else if !started}
  <section class="card intro" data-testid="test-intro">
    <p>
      <Bidi
        text={mode === 'epreuve'
          ? t(
              doux === 'douce'
                ? 'ser.defi_intro'
                : doux === 'serein'
                  ? 'ser.facultative_intro'
                  : 'parc.epreuve_intro',
            )
          : t('parc.positionnement_intro')}
      />
    </p>
    {#if mode === 'positionnement' && courant}
      <p class="muted small">
        <Bidi text={t('parc.niveau_actuel', { niveau: levelLabel(courant) })} />
      </p>
    {/if}
    {#if profile.kind === 'enfant'}
      <label
        >{t('libre.code_parent')}
        <input
          type="password"
          inputmode="numeric"
          autocomplete="off"
          maxlength="8"
          bind:value={pin}
          data-testid="code-parent"
        /></label
      >
    {/if}
    <button
      type="button"
      class="primary"
      onclick={start}
      disabled={mode === 'positionnement' && !niveau}
      data-testid="commencer-test">{t('parc.commencer_test')}</button
    >
  </section>
{:else if view}
  <p class="step" data-testid="niveau-teste" data-niveau={view.niveau}>
    <Bidi text={t('parc.niveau_teste', { niveau: levelLabel(view.niveau) })} />
    {#each passes as p (p)}<span class="pass"><Icon name="coche" size={14} /><Bidi text={p} /></span
      >{/each}
  </p>
  {#if phrases.length}
    <section class="card texte">
      {#each phrases as p, i (i)}<Ar tag="p" text={p} />{/each}
    </section>
  {/if}
  {#each view.lesson.exercices as ex, i (i)}
    {@const id = view.exercises[i]?.id}
    {#if id}
      <ExamExercise
        {ex}
        n={i + 1}
        bind:value={() => answers[id] ?? {}, (v) => (answers = { ...answers, [id]: v })}
      />
    {/if}
  {/each}
  <button
    type="button"
    class="primary send"
    disabled={busy}
    onclick={send}
    data-testid="valider-test">{t('parc.valider_test')}</button
  >
{:else if !error}
  <Loading lines={3} />
{/if}
{#if error}<p class="error" role="alert"><Bidi text={error} /></p>{/if}

<style>
  .intro,
  .result {
    display: grid;
    gap: 8px;
    justify-items: start;
  }
  .result.ok {
    border-inline-start: 6px solid var(--good);
  }
  .r-ic {
    color: var(--primary);
  }
  .step {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    font-weight: 700;
  }
  .pass {
    display: inline-flex;
    gap: 2px;
    align-items: center;
    font-size: 0.8rem;
    padding: 1px 8px;
    border-radius: var(--radius-pill);
    background: var(--ok-bg);
    color: var(--ok-ink);
  }
  .texte :global(p.ar) {
    font-size: 1.3rem;
    margin: 4px 0;
  }
  .send {
    margin-top: var(--space-m);
  }
  .stars {
    font-size: 2rem;
    color: var(--primary);
    margin: 0;
  }
  .error {
    color: var(--bad-ink);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
