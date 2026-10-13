<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { loadTexts, t } from '$lib/i18n';

  /**
   * Bêta : écran affiché À LA PLACE de l'application quand elle n'est pas ouverte à la personne.
   *  - `ferme` : page de maintenance sobre (mode fermé ; les administrateurs ne la voient pas) ;
   *  - `accueil` : visiteur non connecté en mode « sur invitation » : présentation courte, « Bêta sur invitation », code
   *    d'invitation, demande d'invitation (liste d'attente) et connexion. L'application et son contenu restent fermés.
   * Chargé après le démarrage et seulement dans ces deux cas (jamais dans le chargement initial de l'élève) ; ses textes
   * (pages rares) sont chargés ici.
   */
  let { mode }: { mode: 'ferme' | 'accueil' } = $props();
  let pret = $state(false);
  onMount(async () => {
    await loadTexts('rares');
    pret = true;
  });
</script>

{#if pret}
  {#if mode === 'ferme'}
    <section class="card centre" data-testid="maintenance" role="status">
      <h1><Bidi text={t('ferme.titre')} /></h1>
      <p><Bidi text={t('ferme.texte')} /></p>
    </section>
  {:else}
    <section class="card centre" data-testid="accueil-visiteur">
      <h1>{t('app.nom')}</h1>
      <p class="slogan"><Bidi text={t('app.slogan')} /></p>
      <p><Bidi text={t('acc.presentation')} /></p>
      <p class="pastille" data-testid="accueil-beta"><Bidi text={t('acc.beta')} /></p>
      <p><Bidi text={t('acc.beta_texte')} /></p>
      <p class="actions">
        <a class="bouton primary" href={resolve('/inscription')} data-testid="accueil-code"
          ><Bidi text={t('acc.code')} /></a
        >
        <!-- eslint-disable svelte/no-navigation-without-resolve -->
        <a class="bouton" href={resolve('/inscription') + '#attente'} data-testid="accueil-demander"
          ><Bidi text={t('acc.demander')} /></a
        >
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      </p>
      <p>
        <a href={resolve('/connexion')} data-testid="accueil-connexion"
          ><Bidi text={t('acc.connexion')} /></a
        >
      </p>
    </section>
  {/if}
{/if}

<style>
  .centre {
    max-width: 560px;
    margin: 32px auto;
    text-align: center;
  }
  .slogan {
    color: var(--muted, inherit);
    font-weight: 600;
  }
  .pastille {
    display: inline-block;
    margin: 8px auto 0;
    padding: 4px 14px;
    border-radius: 999px;
    background: var(--primary-soft);
    font-weight: 700;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }
  .bouton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 48px;
    padding: 6px 18px;
    border: 2px solid var(--line);
    border-radius: 12px;
    text-decoration: none;
  }
</style>
