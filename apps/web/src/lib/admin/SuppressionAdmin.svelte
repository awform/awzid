<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { fmtDate, t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * Suppression d'un compte À LA DEMANDE DE LA PERSONNE (administrateur, second facteur) : même mécanisme que « Supprimer
   * mon compte » (accès coupé tout de suite, adresse libérée tout de suite, enfants compris, effacement définitif sous
   * 30 jours). Double confirmation : l'adresse retapée (ou les 4 derniers chiffres du numéro) ET le mot de passe de
   * l'administrateur ; motif obligatoire, noté au journal d'audit. Refusé pour le personnel et pour son propre compte.
   */
  let identifiant = $state('');
  let confirmation = $state('');
  let motif = $state('');
  let password = $state('');
  let message = $state('');
  let erreur = $state(false);
  let occupe = $state(false);
  let visible = $state(true);

  const CODES: Record<string, string> = {
    introuvable: 'adm.suppr_introuvable',
    pas_soi_meme: 'adm.suppr_soi',
    compte_personnel: 'adm.suppr_personnel',
    confirmation_incorrecte: 'adm.suppr_confirm_inc',
    mot_de_passe_incorrect: 'adm.suppr_mdp_inc',
    motif_requis: 'adm.suppr_motif_requis',
    verrouille: 'adm.suppr_verrouille',
    reserve_admin: 'adm.suppr_reserve',
  };

  async function supprimer() {
    erreur = true;
    if (!identifiant.trim() || !confirmation.trim() || !motif.trim() || !password) {
      message = t('adm.suppr_vide');
      return;
    }
    occupe = true;
    const r = await call<{ effacementDefinitif: string }>('POST', '/admin/comptes/suppression', {
      identifiant: identifiant.trim(),
      confirmation: confirmation.trim(),
      motif: motif.trim(),
      password,
    });
    occupe = false;
    password = '';
    if (r.ok) {
      erreur = false;
      message = t('adm.suppr_ok', { date: fmtDate(r.data?.effacementDefinitif ?? '') });
      identifiant = confirmation = motif = '';
    } else {
      if (r.code === 'reserve_admin') visible = false;
      message = t(CODES[r.code ?? ''] ?? 'adm.suppr_erreur');
    }
  }
</script>

{#if visible}
  <section class="card" data-testid="suppression">
    <h2 id="t-suppression"><Bidi text={t('adm.suppr_titre')} /></h2>
    <p class="alerte small" role="note"><Bidi text={t('adm.suppr_alerte')} /></p>
    <label class="champ">
      <span><Bidi text={t('adm.blocage_champ')} /></span>
      <input
        type="text"
        dir="ltr"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        bind:value={identifiant}
        data-testid="suppr-id"
      />
    </label>
    <label class="champ">
      <span><Bidi text={t('adm.suppr_confirm')} /></span>
      <input
        type="text"
        dir="ltr"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        bind:value={confirmation}
        data-testid="suppr-confirm"
      />
    </label>
    <label class="champ">
      <span><Bidi text={t('adm.suppr_motif')} /></span>
      <input
        type="text"
        maxlength="500"
        autocomplete="off"
        bind:value={motif}
        data-testid="suppr-motif"
      />
    </label>
    <label class="champ">
      <span><Bidi text={t('adm.suppr_mdp')} /></span>
      <input
        type="password"
        dir="ltr"
        autocomplete="current-password"
        bind:value={password}
        data-testid="suppr-mdp"
      />
    </label>
    <div class="actions">
      <button
        type="button"
        class="danger"
        disabled={occupe}
        onclick={supprimer}
        data-testid="suppr-bouton"><Bidi text={t('adm.suppr_bouton')} /></button
      >
      <span
        class="msg"
        class:warn={erreur}
        role="status"
        aria-live="polite"
        data-testid="suppr-message"
      >
        {#if message}<Bidi text={message} />{/if}
      </span>
    </div>
  </section>
{/if}

<style>
  .small {
    font-size: 0.9rem;
  }
  .alerte {
    border-inline-start: 4px solid var(--danger, #b3261e);
    padding-inline-start: 8px;
  }
  .champ {
    display: grid;
    gap: 4px;
    margin-block: 8px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .msg {
    flex: 1 1 14rem;
  }
  .warn {
    color: var(--danger, #b3261e);
  }
  .danger {
    background: var(--bad-ink);
    border-color: var(--bad-ink);
    color: var(--bad-bg);
  }
  button {
    min-height: 44px;
  }
</style>
