<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { activeProfile } from '$lib/attempts';
  import { loadTexts, t } from '$lib/i18n';
  import { call, cachedMe } from '$lib/session';
  import { noter } from '$lib/usage';
  import { chargerModule } from '$lib/charger';

  /**
   * F5 — « Donner mon avis » : catégorie, texte court (jamais pour un enfant : catégorie et image seulement),
   * image FACULTATIVE de l'écran faite sur l'appareil, montrée avant l'envoi. Jamais d'image sur les pages qui
   * montrent d'autres personnes (classe, famille, messages, espaces du personnel) ; ailleurs, les zones marquées
   * `data-prive` (pseudonyme affiché…) sont masquées. Envoi en ligne seulement ; limite par compte côté serveur.
   *
   * Bêta-support — `mode="probleme"` : « Signaler un problème » (bug, contenu à corriger, point religieux à
   * vérifier, autre) vers `/problemes` ; la page d'origine et la version sont jointes (version : par le serveur) ;
   * un enfant n'envoie que la catégorie (ni texte libre, ni image).
   */
  let {
    onclose,
    mode = 'avis',
    categorie: categorieInitiale = '',
  }: { onclose: () => void; mode?: 'avis' | 'probleme'; categorie?: string } = $props();

  const CATS_PAR_MODE = {
    avis: ['idee', 'probleme', 'difficile', 'aime', 'autre'],
    probleme: ['bug', 'contenu', 'religieux', 'autre'],
  } as const;
  const CATS = $derived<readonly string[]>(CATS_PAR_MODE[mode]);
  const P = $derived(mode);
  const PRIVE = [
    '/enseignant',
    '/admin',
    '/messages',
    '/profils',
    '/famille',
    '/suivi',
    '/ma-classe',
    '/ecole',
  ];
  let dlg = $state<HTMLDialogElement | null>(null);
  let pret = $state(false);
  // bêta fermée : catégorie déjà choisie (ex. « Signaler une erreur dans un texte religieux »), si elle existe pour ce mode
  // svelte-ignore state_referenced_locally
  let categorie = $state(
    CATS_PAR_MODE[mode].includes(categorieInitiale as never) ? categorieInitiale : '',
  );
  let texte = $state('');
  let joindre = $state(false);
  let image = $state<string | null>(null);
  let captureErr = $state(false);
  let enfant = $state(false);
  let profil = $state<string | null>(null);
  let envoi = $state(false);
  let fait = $state(false);
  let erreur = $state('');
  const chemin = page.url.pathname;
  // image impossible sur les pages qui montrent d'autres personnes ; et, pour un signalement, jamais pour un enfant
  const imagePage = !PRIVE.some((p) => chemin === p || chemin.startsWith(`${p}/`));
  const imagePossible = $derived(imagePage && !(mode === 'probleme' && enfant));

  onMount(async () => {
    await loadTexts('rares');
    const me = await cachedMe();
    // profil actif, sinon le seul profil du compte (adulte autonome)
    const p = (await activeProfile()) ?? (me?.profiles.length === 1 ? me.profiles[0]! : null);
    profil = p && me ? p.id : null;
    enfant = p?.kind === 'enfant';
    pret = true;
    queueMicrotask(() => dlg?.showModal());
  });

  async function basculerImage() {
    image = null;
    captureErr = false;
    if (!joindre) return;
    try {
      const m = await chargerModule(() => import('./capture'));
      image = await m.captureEcran();
      if (!image) captureErr = true;
    } catch {
      captureErr = true;
    }
    if (!image) joindre = false;
  }

  async function envoyer(e: SubmitEvent) {
    e.preventDefault();
    if (!categorie) return;
    if (!navigator.onLine) {
      erreur = t(`${P}.hors_ligne`);
      return;
    }
    envoi = true;
    erreur = '';
    const r = await call('POST', P === 'probleme' ? '/problemes' : '/avis', {
      categorie,
      ...(texte.trim() && !enfant ? { texte: texte.trim() } : {}),
      page: chemin,
      ...(profil ? { profil } : {}),
      ...(joindre && image ? { capture: image } : {}),
    });
    envoi = false;
    if (r.ok) {
      fait = true;
      if (P === 'avis') noter('avis');
    } else erreur = t(`erreur.${r.code ?? 'reseau'}`);
  }
  function fermer() {
    dlg?.close();
    onclose();
  }
</script>

{#if pret}
  <dialog
    bind:this={dlg}
    class="card avis"
    aria-labelledby="{P}-titre"
    data-testid="{P}-dialogue"
    data-avis-exclu
    {onclose}
  >
    <h2 id="{P}-titre"><Bidi text={t(`${P}.titre`)} /></h2>
    {#if fait}
      <p role="status" data-testid="{P}-merci"><Bidi text={t(`${P}.merci`)} /></p>
      <button type="button" class="primary" onclick={fermer}>{t('avis.fermer')}</button>
    {:else}
      <p class="muted"><Bidi text={enfant ? t(`${P}.intro_enfant`) : t(`${P}.intro`)} /></p>
      <form onsubmit={envoyer}>
        <fieldset>
          <legend><Bidi text={t(`${P}.categorie`)} /></legend>
          <div class="cats">
            {#each CATS as c (c)}
              <label class="cat" class:on={categorie === c}>
                <input type="radio" name="{P}-cat" value={c} bind:group={categorie} />
                <Bidi text={t(`${P}.cat.${c}`)} />
              </label>
            {/each}
          </div>
        </fieldset>
        {#if !enfant}
          <label for="{P}-texte"><Bidi text={t(`${P}.texte`)} /></label>
          <textarea id="{P}-texte" bind:value={texte} maxlength="500" rows="3"></textarea>
          <p class="muted"><Bidi text={t(`${P}.texte_aide`)} /></p>
        {/if}
        {#if imagePossible}
          <label class="row">
            <input
              type="checkbox"
              bind:checked={joindre}
              onchange={basculerImage}
              data-testid="{P}-image"
            />
            {t('avis.capture')}
          </label>
          <p class="muted">{t('avis.capture_aide')}</p>
          {#if image}
            <figure>
              <img src={image} alt={t('avis.apercu')} data-testid="{P}-apercu" />
              <figcaption class="muted">{t('avis.apercu')}</figcaption>
            </figure>
          {/if}
          {#if captureErr}<p class="muted" role="status">{t('avis.capture_impossible')}</p>{/if}
        {:else if imagePage}
          <!-- enfant (signalement) : catégorie seulement, aucune image -->
        {:else}
          <p class="muted" data-testid="{P}-image-interdite">{t('avis.capture_interdite')}</p>
        {/if}
        {#if P === 'probleme'}
          <p class="muted" data-testid="probleme-joint">{t('probleme.joint')}</p>
        {/if}
        {#if erreur}<p class="error" role="alert"><Bidi text={erreur} /></p>{/if}
        <p class="row">
          <button
            type="submit"
            class="primary"
            disabled={!categorie ||
              envoi ||
              (P === 'probleme' && !enfant && texte.trim().length < 3)}
            data-testid="{P}-envoyer"><Bidi text={t(`${P}.envoyer`)} /></button
          >
          <button type="button" onclick={fermer}>{t('avis.annuler')}</button>
        </p>
      </form>
    {/if}
  </dialog>
{/if}

<style>
  .avis {
    max-width: min(34rem, calc(100vw - 32px));
    width: 100%;
  }
  .avis::backdrop {
    background: rgb(0 0 0 / 0.4);
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0 0 var(--space-m);
  }
  .cats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-s);
  }
  .cat {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: var(--target, 44px);
    padding: 0 var(--space-m);
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    cursor: pointer;
  }
  .cat.on {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, transparent);
  }
  textarea {
    width: 100%;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-s);
  }
  figure {
    margin: var(--space-s) 0;
  }
  img {
    max-width: 100%;
    max-height: 40vh;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
  }
</style>
