<script lang="ts">
  import { forceMotDePasse } from '@awform/school/mot-de-passe';
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';

  /**
   * Lot 11 — champ « nouveau mot de passe » (inscription, réinitialisation, changement dans le compte) :
   *  - bouton « œil » afficher / masquer (aria-pressed, libellé) pour les deux champs ;
   *  - champ « Confirmer le mot de passe » : `identiques` (lié) dit au formulaire si les deux sont égaux ;
   *  - consigne courte et indicateur rouge / orange / vert qui applique EXACTEMENT la règle du serveur
   *    (`@awform/school`, mot-de-passe.ts : la même fonction contrôle l'API).
   * Pas de refonte visuelle (elle viendra avec les maquettes validées) : les champs restent ceux du formulaire.
   */
  let {
    value = $bindable(''),
    identiques = $bindable(),
    id = 'password',
    label = '',
    email = '',
    personnel = false,
  }: {
    value?: string;
    identiques?: boolean;
    id?: string;
    label?: string;
    email?: string;
    personnel?: boolean;
  } = $props();

  let confirmation = $state('');
  let visible = $state(false);
  const force = $derived(forceMotDePasse(value, email, { personnel }));
  const ecart = $derived(confirmation.length > 0 && confirmation !== value);
  $effect(() => {
    const egaux = value === confirmation;
    if (identiques !== egaux) identiques = egaux;
  });
  // formulaire remis à zéro par la page (changement réussi) : la confirmation suit
  $effect(() => {
    if (value === '') confirmation = '';
  });
</script>

<label for={id}><Bidi text={label || t('champ.mot_de_passe')} /></label>
<div class="mdp">
  <input
    {id}
    type={visible ? 'text' : 'password'}
    autocomplete="new-password"
    autocapitalize="none"
    spellcheck="false"
    required
    bind:value
    aria-describedby="{id}-aide {id}-force"
  />
  <button
    type="button"
    class="ghost oeil"
    aria-pressed={visible}
    aria-label={t('mdp.afficher')}
    title={t('mdp.afficher')}
    data-testid="mdp-oeil"
    onclick={() => (visible = !visible)}
  >
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2" />
      {#if visible}<path d="M4 4l16 16" stroke="currentColor" stroke-width="2" />{/if}
    </svg>
    <!-- texte visible (règle du projet : aucun bouton sans texte écrit), contenu dans le nom accessible -->
    <Bidi text={t('mdp.voir')} />
  </button>
</div>
<p id="{id}-aide" class="muted small">
  <Bidi text={t(personnel ? 'mdp.consigne_personnel' : 'mdp.consigne')} />
</p>
<p
  id="{id}-force"
  class="force small"
  data-force={force}
  data-testid="mdp-force"
  aria-live="polite"
>
  {#if force !== 'vide'}<span class="barre" aria-hidden="true"
      ><span></span><span></span><span></span></span
    >
    <Bidi text={t(`mdp.force_${force}`)} />{/if}
</p>

<label for="{id}-confirmer"><Bidi text={t('mdp.confirmer')} /></label>
<input
  id="{id}-confirmer"
  type={visible ? 'text' : 'password'}
  autocomplete="new-password"
  autocapitalize="none"
  spellcheck="false"
  required
  bind:value={confirmation}
  aria-invalid={ecart}
  data-testid="mdp-confirmer"
/>
{#if ecart}<p class="error small" role="alert" data-testid="mdp-differents">
    <Bidi text={t('mdp.differents')} />
  </p>{/if}

<style>
  .mdp {
    display: flex;
    gap: var(--space-xs, 0.25rem);
    align-items: stretch;
  }
  .mdp input {
    flex: 1;
    min-width: 0;
  }
  .oeil {
    min-width: 44px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
  }
  .force {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-height: 1.4em;
    margin: 0;
  }
  .barre {
    display: inline-flex;
    gap: 3px;
  }
  .barre span {
    width: 1.6rem;
    height: 0.35rem;
    border-radius: 2px;
    background: currentColor;
    opacity: 0.2;
  }
  [data-force='refuse'] {
    color: var(--bad-ink);
  }
  [data-force='correct'] {
    color: var(--warn-ink);
  }
  [data-force='fort'] {
    color: var(--ok-ink);
  }
  [data-force='refuse'] .barre span:nth-child(1),
  [data-force='correct'] .barre span:nth-child(-n + 2),
  [data-force='fort'] .barre span {
    opacity: 1;
  }
</style>
