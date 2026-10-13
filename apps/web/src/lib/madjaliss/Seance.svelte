<script lang="ts">
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { chargerNotes, type Matn, type NotesEnseignant, type Seance } from './donnees';
  import Memoriser from './Memoriser.svelte';
  import { aMemoriser } from './memo';
  import { lien } from './liens';
  import Phrase from './Phrase.svelte';
  import Quiz from './Quiz.svelte';
  import { genererQuiz } from './quiz';
  import { marquerFaite, ouvrir, type Progres } from './progression';

  /**
   * Une séance (majlis), PAR ÉTAPES, une action principale par écran : Lire (l'arabe sur sa ligne, la traduction
   * dessous), Mots difficiles, Mémoriser, Quiz, Fin (« Séance faite »). Mode enseignant (personnel seulement) :
   * vocalisations à vérifier, variantes et mots réservés, chargés en ligne.
   */
  let {
    matn,
    seance,
    pid,
    enseignant = false,
    suivante = null,
    progres,
  }: {
    matn: Matn;
    seance: Seance;
    pid: string | null;
    enseignant?: boolean;
    suivante?: number | null;
    progres: Progres;
  } = $props();

  const ETAPES = ['lire', 'mots', 'memo', 'quiz', 'fin'] as const;
  let etape = $state(0);
  let memoFini = $state(false);
  let quizFini = $state<{ bonnes: number; total: number } | null>(null);
  // svelte-ignore state_referenced_locally
  let faite = $state(progres.faites.includes(seance.n));
  let envoi = $state(false);
  let modeEns = $state(false);
  let notes = $state<NotesEnseignant | null>(null);
  let notesErreur = $state(false);

  const de = $derived(new Map(matn.phrases.map((p) => [p.id, p])));
  const phrases = $derived(seance.phrases.map((id) => de.get(id)).filter((p) => !!p));
  const memo = $derived(aMemoriser(phrases));
  const questions = $derived(genererQuiz(matn, seance.n));
  const noteDe = $derived(new Map((notes?.phrases ?? []).map((x) => [x.id, x])));
  const motsReserves = $derived((notes?.mots ?? []).filter((m) => m.n === seance.n));
  /** l'action « Suivant » n'est l'action principale que si l'étape n'en a pas d'autre en cours */
  const suivantPrincipal = $derived(
    ETAPES[etape] === 'memo'
      ? memoFini
      : ETAPES[etape] === 'quiz'
        ? quizFini !== null || questions.length === 0
        : true,
  );

  $effect(() => {
    void ouvrir(pid, matn.id, seance.n);
  });

  async function basculerEns() {
    modeEns = !modeEns;
    if (modeEns && !notes) {
      notes = await chargerNotes(matn.id);
      notesErreur = !notes;
    }
  }

  function aller(k: number) {
    etape = k;
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }

  async function terminer() {
    envoi = true;
    await marquerFaite(pid, matn.id, seance.n, {
      quiz: quizFini?.bonnes ?? 0,
      sur: quizFini?.total ?? questions.length,
    });
    faite = true;
    envoi = false;
  }
</script>

<header class="tete">
  <p class="surtitre"><Bidi text={t('mj.seance', { n: seance.n })} /></p>
  <h1><Bidi text={seance.titre} /></h1>
</header>

<ol class="etapes" aria-label={t('mj.etapes_label')}>
  {#each ETAPES as e, k (e)}
    <li class:fait={k < etape} aria-current={k === etape ? 'step' : undefined} data-etape={e}>
      <span class="pt" aria-hidden="true"
        >{#if k < etape}<Icon name="coche" size={14} />{:else}<Bidi text={k + 1} />{/if}</span
      >
      <span class="nom"><Bidi text={t(`mj.etape_${e}`)} /></span>
    </li>
  {/each}
</ol>

<section class="corps" data-testid="mj-etape" data-etape={ETAPES[etape]}>
  <h2 class="sr"><Bidi text={t(`mj.etape_${ETAPES[etape]}`)} /></h2>
  {#if ETAPES[etape] === 'lire'}
    <div class="texte" data-testid="mj-texte">
      {#each phrases as p (p.id)}<Phrase
          {p}
          statut={matn.statut}
          note={modeEns ? (noteDe.get(p.id) ?? null) : null}
        />{/each}
    </div>
    {#if seance.renvois?.length}
      <p class="renvois" data-testid="mj-renvois">
        <Bidi text={t('mj.voir_aussi')} />
        {#each seance.renvois as r, i (i)}<a
            href={resolve('/madjaliss/[[texte]]/[[n]]', lien(r.texte, r.n))}
            data-renvoi={`${r.texte}/${r.n}`}
            ><Bidi
              text={t('mj.renvoi', { texte: t(`mj.t_${r.texte.replace('-', '_')}`), n: r.n })}
            /></a
          >{/each}
      </p>
    {/if}
  {:else if ETAPES[etape] === 'mots'}
    {#if seance.mots.length}
      <ul class="mots" data-testid="mj-mots">
        {#each seance.mots as m, i (i)}
          <li>
            <span class="ar" lang="ar" dir="rtl"><Bidi text={m.ar} base="ar" /></span>
            <span class="fr"><Bidi text={m.fr} /></span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted"><Bidi text={t('mj.mots_vide')} /></p>
    {/if}
    {#if modeEns && motsReserves.length}
      <div class="ens" data-testid="mj-mots-reserves">
        <p><strong><Bidi text={t('mj.ens_mots')} /></strong></p>
        <ul class="mots">
          {#each motsReserves as m, i (i)}
            <li>
              <span class="ar" lang="ar" dir="rtl"><Bidi text={m.ar} base="ar" /></span>
              <span class="fr"><Bidi text={`${m.fr} (${t(`mj.ens_motif_${m.motif}`)})`} /></span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {:else if ETAPES[etape] === 'memo'}
    <Memoriser phrases={memo} {pid} texte={matn.id} onfin={() => (memoFini = true)} />
  {:else if ETAPES[etape] === 'quiz'}
    {#if questions.length}
      <Quiz {questions} onfin={(bonnes, total) => (quizFini = { bonnes, total })} />
    {:else}
      <p class="muted" data-testid="mj-quiz-vide"><Bidi text={t('mj.quiz_vide')} /></p>
    {/if}
  {:else}
    <div class="fin" data-testid="mj-fin">
      <p class="titre-fin"><Icon name="etoile" /><Bidi text={t('mj.fin_titre')} /></p>
      {#if quizFini}<p><Bidi text={t('mj.q_score', quizFini)} /></p>{/if}
      {#if faite}
        <p class="card ok" data-testid="mj-faite"><Bidi text={t('mj.faite_message')} /></p>
        {#if suivante !== null}
          <a
            class="button primary"
            data-testid="mj-suivante"
            href={resolve('/madjaliss/[[texte]]/[[n]]', lien(matn.id, suivante))}
            ><Bidi text={t('mj.seance_suivante')} /></a
          >
        {/if}
        <a class="button" href={resolve('/madjaliss/[[texte]]/[[n]]', lien(matn.id))}
          ><Bidi text={t('mj.retour_sommaire')} /></a
        >
      {:else}
        <p class="muted"><Bidi text={t('mj.fin_texte')} /></p>
        <button
          type="button"
          class="primary"
          data-testid="mj-seance-faite"
          disabled={envoi}
          onclick={terminer}><Icon name="coche" /><Bidi text={t('mj.seance_faite')} /></button
        >
      {/if}
    </div>
  {/if}
</section>

{#if ETAPES[etape] !== 'fin'}
  <nav class="navigation" aria-label={t('mj.etapes_label')}>
    {#if etape > 0}<button type="button" onclick={() => aller(etape - 1)}
        ><Bidi text={t('mj.precedent')} /></button
      >{/if}
    <button
      type="button"
      class:primary={suivantPrincipal}
      data-testid="mj-suivant"
      onclick={() => aller(etape + 1)}
      ><Bidi text={t('mj.suivant', { nom: t(`mj.etape_${ETAPES[etape + 1]}`) })} /><Icon
        name="fleche"
        size={18}
      /></button
    >
  </nav>
{/if}

{#if enseignant}
  <div class="mode-ens">
    <label
      ><input
        type="checkbox"
        checked={modeEns}
        onchange={basculerEns}
        data-testid="mj-mode-enseignant"
      />
      <span><Bidi text={t('mj.enseignant')} /></span></label
    >
    {#if modeEns}<p class="muted">
        <Bidi text={t(notesErreur ? 'mj.ens_erreur' : 'mj.ens_aide')} />
      </p>{/if}
    {#if modeEns && notes?.publication}<p class="muted" data-testid="mj-ens-publication">
        <strong><Bidi text={t('mj.ens_publication')} /></strong>
        <Bidi text={notes.publication} />
      </p>{/if}
    {#each (notes?.comite ?? []).filter((c) => modeEns && c.n === seance.n) as c (c.id)}<p
        class="muted"
        data-testid="mj-ens-comite"
      >
        <strong><Bidi text={t('mj.ens_comite')} /></strong>
        <Bidi text={c.motif} />
      </p>{/each}
  </div>
{/if}

<style>
  .tete h1 {
    margin: 0;
    font-size: 1.4rem;
  }
  .surtitre {
    margin: 0;
    color: var(--ink2);
    font-weight: 600;
  }
  .etapes {
    list-style: none;
    display: flex;
    gap: 4px;
    padding: 0;
    margin: var(--space-m) 0;
    overflow-x: auto;
  }
  .etapes li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    flex: 1;
    min-width: 58px;
    font-size: 0.78rem;
    color: var(--ink2);
    text-align: center;
  }
  .etapes .pt {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid var(--line);
    font-weight: 700;
  }
  .etapes li[aria-current='step'] {
    color: var(--ink);
    font-weight: 700;
  }
  .etapes li[aria-current='step'] .pt {
    border-color: var(--gold);
    border-width: 3px;
  }
  .etapes li.fait .pt {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-primary);
  }
  .corps {
    padding: var(--space-m);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--card);
    box-shadow: var(--shadow-card);
  }
  .mots {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: var(--space-s);
  }
  .mots li {
    display: grid;
    gap: 2px;
    padding-bottom: var(--space-s);
    border-bottom: 1px solid var(--line);
  }
  .mots .ar {
    display: block;
    text-align: right;
  }
  .renvois {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-s);
    align-items: center;
    margin: var(--space-m) 0 0;
    font-size: 0.9rem;
  }
  .renvois a {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }
  .ens {
    margin-top: var(--space-m);
    padding: var(--space-s);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .fin {
    display: grid;
    gap: var(--space-s);
    justify-items: start;
  }
  .titre-fin {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 0;
    font-size: 1.2rem;
    font-weight: 700;
  }
  .navigation {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-s);
    margin-top: var(--space-m);
  }
  .navigation button:last-child {
    margin-inline-start: auto;
  }
  .mode-ens {
    margin-top: var(--space-l, 24px);
    padding-top: var(--space-s);
    border-top: 1px dashed var(--line);
  }
  .mode-ens label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
  }
</style>
