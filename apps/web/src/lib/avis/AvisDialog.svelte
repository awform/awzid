<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { activeProfile } from '$lib/attempts';
  import { loadTexts, t } from '$lib/i18n';
  import { call, cachedMe } from '$lib/session';
  import { noter } from '$lib/usage';

  /**
   * F5 — « Donner mon avis » : catégorie, texte court (jamais pour un enfant : catégorie et image seulement),
   * image FACULTATIVE de l'écran faite sur l'appareil, montrée avant l'envoi. Jamais d'image sur les pages qui
   * montrent d'autres personnes (classe, famille, messages, espaces du personnel) ; ailleurs, les zones marquées
   * `data-prive` (pseudonyme affiché…) sont masquées. Envoi en ligne seulement ; limite par compte côté serveur.
   */
  let { onclose }: { onclose: () => void } = $props();

  const CATS = ['idee', 'probleme', 'difficile', 'aime', 'autre'] as const;
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
  let categorie = $state<(typeof CATS)[number] | ''>('');
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
  const imagePossible = !PRIVE.some((p) => chemin === p || chemin.startsWith(`${p}/`));

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
      const m = await import('./capture');
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
      erreur = t('avis.hors_ligne');
      return;
    }
    envoi = true;
    erreur = '';
    const r = await call('POST', '/avis', {
      categorie,
      ...(texte.trim() && !enfant ? { texte: texte.trim() } : {}),
      page: chemin,
      ...(profil ? { profil } : {}),
      ...(joindre && image ? { capture: image } : {}),
    });
    envoi = false;
    if (r.ok) {
      fait = true;
      noter('avis');
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
    aria-labelledby="avis-titre"
    data-testid="avis-dialogue"
    data-avis-exclu
    {onclose}
  >
    <h2 id="avis-titre">{t('avis.titre')}</h2>
    {#if fait}
      <p role="status" data-testid="avis-merci">{t('avis.merci')}</p>
      <button type="button" class="primary" onclick={fermer}>{t('avis.fermer')}</button>
    {:else}
      <p class="muted"><Bidi text={enfant ? t('avis.intro_enfant') : t('avis.intro')} /></p>
      <form onsubmit={envoyer}>
        <fieldset>
          <legend>{t('avis.categorie')}</legend>
          <div class="cats">
            {#each CATS as c (c)}
              <label class="cat" class:on={categorie === c}>
                <input type="radio" name="avis-cat" value={c} bind:group={categorie} />
                <Bidi text={t(`avis.cat.${c}`)} />
              </label>
            {/each}
          </div>
        </fieldset>
        {#if !enfant}
          <label for="avis-texte">{t('avis.texte')}</label>
          <textarea id="avis-texte" bind:value={texte} maxlength="500" rows="3"></textarea>
          <p class="muted">{t('avis.texte_aide')}</p>
        {/if}
        {#if imagePossible}
          <label class="row">
            <input
              type="checkbox"
              bind:checked={joindre}
              onchange={basculerImage}
              data-testid="avis-image"
            />
            {t('avis.capture')}
          </label>
          <p class="muted">{t('avis.capture_aide')}</p>
          {#if image}
            <figure>
              <img src={image} alt={t('avis.apercu')} data-testid="avis-apercu" />
              <figcaption class="muted">{t('avis.apercu')}</figcaption>
            </figure>
          {/if}
          {#if captureErr}<p class="muted" role="status">{t('avis.capture_impossible')}</p>{/if}
        {:else}
          <p class="muted" data-testid="avis-image-interdite">{t('avis.capture_interdite')}</p>
        {/if}
        {#if erreur}<p class="error" role="alert"><Bidi text={erreur} /></p>{/if}
        <p class="row">
          <button
            type="submit"
            class="primary"
            disabled={!categorie || envoi}
            data-testid="avis-envoyer">{t('avis.envoyer')}</button
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
