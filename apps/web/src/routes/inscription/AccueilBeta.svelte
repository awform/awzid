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
   * Refonte du 16/10/2026 (avec l'inscription) : carte au bandeau vert de la marque (symbole officiel sur disque crème,
   * motif étoilé discret), titres Lexend, UNE action principale ; vouvoiement (page d'entrée publique).
   */
  let { mode }: { mode: 'ferme' | 'accueil' } = $props();
  let pret = $state(false);
  onMount(async () => {
    await loadTexts('rares');
    pret = true;
  });
</script>

{#snippet bandeau()}
  <div class="bandeau" aria-hidden="true">
    <svg class="motif" focusable="false"
      ><defs
        ><pattern id="acc-motif" width="44" height="44" patternUnits="userSpaceOnUse"
          ><g fill="none" stroke="#FFFFFF" stroke-opacity=".14"
            ><rect x="14" y="14" width="16" height="16" /><rect
              x="14"
              y="14"
              width="16"
              height="16"
              transform="rotate(45 22 22)"
            /></g
          ></pattern
        ></defs
      ><rect width="100%" height="100%" fill="url(#acc-motif)" /></svg
    >
    <span class="disque"><img src="/awzid-symbole.svg" alt="" width="47" height="60" /></span>
  </div>
{/snippet}

{#if pret}
  {#if mode === 'ferme'}
    <section class="carte" data-testid="maintenance" role="status">
      {@render bandeau()}
      <div class="corps">
        <h1><Bidi text={t('ferme.titre')} /></h1>
        <p><Bidi text={t('ferme.texte')} /></p>
      </div>
    </section>
  {:else}
    <section class="carte" data-testid="accueil-visiteur">
      {@render bandeau()}
      <div class="corps">
        <p class="pastille" data-testid="accueil-beta"><Bidi text={t('acc.beta')} /></p>
        <h1>{t('app.nom')}</h1>
        <p class="slogan"><Bidi text={t('app.slogan')} /></p>
        <p class="presentation"><Bidi text={t('acc.presentation')} /></p>
        <p class="texte"><Bidi text={t('acc.beta_texte')} /></p>
        <div class="actions">
          <a class="bouton primaire" href={resolve('/inscription')} data-testid="accueil-code"
            ><Bidi text={t('acc.code')} /></a
          >
          <!-- eslint-disable svelte/no-navigation-without-resolve -->
          <a
            class="bouton secondaire"
            href={resolve('/inscription') + '#attente'}
            data-testid="accueil-demander"><Bidi text={t('acc.demander')} /></a
          >
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
        </div>
        <p class="connexion">
          <a href={resolve('/connexion')} data-testid="accueil-connexion"
            ><Bidi text={t('acc.connexion')} /></a
          >
        </p>
      </div>
    </section>
  {/if}
{/if}

<style>
  .carte {
    max-width: 560px;
    margin: 24px auto;
    overflow: hidden;
    text-align: center;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 24px;
    box-shadow:
      0 1px 2px rgba(16, 24, 40, 0.05),
      0 10px 30px -12px rgba(8, 76, 56, 0.18);
  }
  .bandeau {
    position: relative;
    isolation: isolate;
    display: grid;
    place-items: center;
    padding: 28px 16px;
    background: var(--mp-band);
    box-shadow: inset 0 -4px 0 var(--gold);
  }
  .motif {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
  }
  .disque {
    display: grid;
    place-items: center;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    background: #fbf7ee;
    box-shadow:
      0 0 0 10px rgba(251, 247, 238, 0.12),
      0 0 0 20px rgba(251, 247, 238, 0.06);
  }
  .disque img {
    width: 44px;
    height: auto;
  }
  .corps {
    display: grid;
    gap: 12px;
    justify-items: center;
    padding: 24px 20px 20px;
  }
  .corps p {
    margin: 0;
  }
  h1 {
    margin: 0;
    font-size: 1.9rem;
    letter-spacing: -0.02em;
    color: var(--navy);
  }
  .slogan {
    color: var(--teal);
    font-family: var(--font-title);
    font-weight: 600;
  }
  .presentation {
    font-size: 1.05rem;
  }
  .texte {
    color: var(--ink2);
  }
  .pastille {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 14px 4px 10px;
    border-radius: 999px;
    background: var(--or-soft);
    color: var(--or-ink);
    font-weight: 700;
    font-size: 0.9rem;
  }
  .pastille::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--gold);
  }
  .actions {
    display: grid;
    gap: 10px;
    width: 100%;
    margin-top: 8px;
  }
  .bouton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 52px;
    padding: 8px 20px;
    border-radius: 14px;
    border: 2px solid var(--primary);
    font-family: var(--font-title);
    font-weight: 600;
    text-decoration: none;
  }
  .primaire {
    background: var(--primary);
    color: var(--on-primary);
    box-shadow: 0 8px 20px -10px rgba(8, 76, 56, 0.55);
  }
  .secondaire {
    color: var(--teal);
  }
  .connexion a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    font-weight: 700;
  }
  @media (min-width: 30rem) {
    .actions {
      grid-template-columns: 1fr 1fr;
    }
    .corps {
      padding: 28px 32px 24px;
    }
  }
</style>
