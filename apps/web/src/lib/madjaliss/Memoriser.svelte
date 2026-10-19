<script lang="ts">
  import { onMount } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import { audioDe, ecouter } from './audio';
  import { arSimple, type Phrase, type Public } from './donnees';
  import {
    apresEval,
    chargerMoteur,
    masques,
    motsDe,
    noter,
    PALIERS,
    type AutoEval,
    type Moteur,
  } from './memo';
  import { jourLocal } from './progression';

  /**
   * Mémoriser (moteur du hifẓ, chargé à l'ouverture de l'étape) : une phrase à la fois ; on la lit, puis on la
   * MASQUE PEU À PEU (« Masquer davantage ») et on la récite ; un mot caché se révèle d'un toucher. Tout masqué :
   * auto-évaluation juste / hésitant / oublié (notes du hifẓ ; « oublié » : la phrase revient en fin de séance).
   * « Écouter » (lot 9) : voix de synthèse PROVISOIRE des textes de fiqh des cycles 1 et 2 (décision du client des 13 et
   * 14/10/2026 ; jamais pour le Coran) ; bouton seulement si la phrase a un audio que ce profil peut entendre (`audioDe`).
   */
  let {
    phrases,
    pid,
    texte,
    kind = null,
    onfin,
  }: {
    phrases: Phrase[];
    pid: string | null;
    texte: string;
    /** profil (enfant, ado, adulte) : l'audio d'une phrase « adulte » n'est jamais proposé aux autres */
    kind?: Public | null;
    onfin: () => void;
  } = $props();

  // file initiale, figée à l'ouverture de l'étape
  // svelte-ignore state_referenced_locally
  let file = $state<Phrase[]>(phrases.filter((p) => arSimple(p) !== null));
  let palier = $state(0);
  let vus = $state<Record<number, boolean>>({});
  // svelte-ignore state_referenced_locally
  const total = file.length;
  let faites = $state(0);

  let moteur = $state<Moteur | null>(null);
  onMount(() => {
    void chargerMoteur().then((m) => (moteur = m));
  });

  const courante = $derived(file[0] ?? null);
  /** audio de la phrase courante (voix de synthèse provisoire), ou null : pas de bouton */
  const audio = $derived(courante ? audioDe(courante, kind) : null);
  const mots = $derived(courante ? motsDe(arSimple(courante)!) : []);
  /** un vers : le second hémistiche commence sur une nouvelle ligne */
  const coupure = $derived(courante?.h ? motsDe(courante.h[0]).length : -1);
  const caches = $derived(moteur ? masques(mots.length, palier, moteur.amorce) : []);
  const toutMasque = $derived(palier >= PALIERS - 1);

  $effect(() => {
    if (!courante) onfin();
  });

  async function evaluer(e: AutoEval) {
    if (!courante) return;
    await noter(pid, texte, courante.id, e, jourLocal());
    if (e !== 'oublie') faites += 1;
    file = apresEval(file, e);
    palier = 0;
    vus = {};
  }
</script>

<div class="memo" data-testid="mj-memo" data-palier={palier}>
  {#if !moteur}
    <Loading lines={2} />
  {:else if courante}
    <p class="muted"><Bidi text={t('mj.memo_aide')} /></p>
    <p class="rang">
      <Bidi text={t('mj.memo_phrase', { i: Math.min(faites + 1, total), n: total })} />
    </p>
    <p class="ar matn" lang="ar" dir="rtl" data-memo={courante.id}>
      {#each mots as w, i (i)}{#if caches[i] && !vus[i]}<button
            type="button"
            class="mot cache"
            aria-label={t('mj.mot_cache')}
            data-cache={i}
            onclick={() => (vus[i] = true)}
            ><span aria-hidden="true"><Bidi text={w} base="ar" /></span></button
          >{:else}<span class="mot"><Bidi text={w} base="ar" /></span>{/if}<Bidi
          text={i < mots.length - 1 ? ' ' : ''}
          base="ar"
        />{#if i === coupure - 1}<br />{/if}{/each}
    </p>
    {#if audio}
      <!-- voix de synthèse provisoire, en attendant l'enregistrement humain -->
      <p class="ecoute">
        <button
          type="button"
          data-testid="mj-ecouter"
          data-audio={audio}
          data-lecteur="m"
          onclick={(e) => void ecouter(e.currentTarget).catch(() => undefined)}
          ><Icon name="oreille" /><Bidi text={t('audio.ecouter')} /></button
        >
      </p>
    {/if}
    {#if !toutMasque}
      <div class="actions">
        <button type="button" class="primary" data-testid="mj-masquer" onclick={() => (palier += 1)}
          ><Icon name="masque" /><Bidi text={t('mj.masquer_plus')} /></button
        >
        {#if palier > 0}<button type="button" onclick={() => ((palier = 0), (vus = {}))}
            ><Bidi text={t('mj.tout_voir')} /></button
          >{/if}
      </div>
    {:else}
      <fieldset class="eval">
        <legend><Bidi text={t('mj.eval_question')} /></legend>
        {#each moteur?.AUTO_EVALS ?? [] as e (e)}
          <button
            type="button"
            class:primary={e === 'juste'}
            data-eval={e}
            onclick={() => evaluer(e)}><Bidi text={t(`mj.eval_${e}`)} /></button
          >
        {/each}
      </fieldset>
    {/if}
    <button type="button" class="ghost passer" data-testid="mj-memo-passer" onclick={onfin}
      ><Bidi text={t('mj.memo_passer')} /></button
    >
  {:else}
    <p class="card ok" data-testid="mj-memo-fini"><Bidi text={t('mj.memo_fini')} /></p>
  {/if}
</div>

<style>
  .ecoute {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-s);
    margin: 0;
  }
  .memo {
    display: grid;
    gap: var(--space-s);
  }
  .rang {
    margin: 0;
    font-weight: 600;
  }
  .matn {
    margin: 0;
    display: block;
    text-align: right;
    line-height: 2.3;
  }
  .mot.cache {
    all: unset;
    display: inline-block;
    min-width: 2.5em;
    min-height: 44px;
    cursor: pointer;
    border-radius: 6px;
    background: var(--surface);
  }
  .mot.cache span {
    filter: blur(7px);
  }
  .mot.cache:focus-visible {
    outline: 3px solid var(--focus);
  }
  .actions,
  .eval {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-s);
  }
  .eval legend {
    font-weight: 600;
    margin-bottom: 4px;
  }
  .passer {
    justify-self: start;
  }
</style>
