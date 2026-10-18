<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import { call } from '$lib/session';
  import VerifTelephone from './VerifTelephone.svelte';

  /**
   * Mot de passe oublié SANS e-mail (18/10/2026) : (a) par le numéro WhatsApp du compte (vérification inversée,
   * gratuite), ou (b) par un CODE DE RÉCUPÉRATION recopié à l'inscription (aucun envoi). Dans les deux cas, toutes les
   * sessions du compte sont fermées et le changement est journalisé.
   */
  let { voie, envoi = false }: { voie: 'whatsapp' | 'code'; envoi?: boolean } = $props();
  const champMdp = import('$lib/compte/ChampMotDePasse.svelte');
  let defi = $state<{ id: string; jeton: string } | null>(null);
  let identifiant = $state('');
  let code = $state('');
  let password = $state('');
  let identiques = $state(true);
  let erreur = $state('');
  let fait = $state(false);
  let busy = $state(false);

  async function valider(e: SubmitEvent) {
    e.preventDefault();
    if (!identiques) {
      erreur = t('erreur.mots_de_passe_differents');
      return;
    }
    busy = true;
    erreur = '';
    const r =
      voie === 'whatsapp'
        ? await call('POST', '/auth/password-reset/telephone', { defi, password })
        : await call('POST', '/auth/password-reset/secours', { identifiant, code, password });
    busy = false;
    if (r.ok) fait = true;
    else erreur = t(`id.erreur.${r.code ?? 'reseau'}`);
  }
</script>

<div class="oubli-tel" data-testid="oubli-voie-{voie}">
  {#if fait}
    <p class="ok" role="status" data-testid="oubli-ok"><Bidi text={t('acces.reinit_ok')} /></p>
    <p><a class="button primary" href={resolve('/connexion')}>{t('acces.vers_connexion')}</a></p>
  {:else}
    {#if voie === 'whatsapp' && !defi}
      <p><Bidi text={t('id.oubli_wa_aide')} /></p>
      <VerifTelephone
        objet="reinitialisation"
        {envoi}
        onverifie={(v) => (defi = { id: v.id, jeton: v.jeton })}
      />
    {:else}
      <form class="form" onsubmit={valider}>
        {#if voie === 'code'}
          <p><Bidi text={t('id.oubli_code_aide')} /></p>
          <label for="oubli-identifiant"><Bidi text={t('id.email_ou_numero')} /></label>
          <input
            id="oubli-identifiant"
            autocomplete="username"
            autocapitalize="none"
            required
            bind:value={identifiant}
            data-testid="oubli-identifiant"
          />
          <label for="oubli-code"><Bidi text={t('id.code_secours')} /></label>
          <input
            id="oubli-code"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            dir="ltr"
            required
            bind:value={code}
            data-testid="oubli-code"
          />
        {/if}
        {#await champMdp then { default: ChampMotDePasse }}
          <ChampMotDePasse bind:value={password} bind:identiques />
        {/await}
        {#if erreur}<p class="error" role="alert" data-testid="oubli-erreur">
            <Bidi text={erreur} />
          </p>{/if}
        <button type="submit" class="primary" disabled={busy} data-testid="oubli-valider"
          ><Bidi text={t('acces.reinit_bouton')} /></button
        >
      </form>
    {/if}
  {/if}
</div>

<style>
  .oubli-tel,
  .form {
    display: grid;
    gap: 10px;
    max-width: 460px;
  }
  input {
    font: inherit;
    min-height: 48px;
    padding: 6px 10px;
    border-radius: 10px;
  }
  .ok {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--ok-bg);
    color: var(--ok-ink);
    font-weight: 700;
  }
  .error {
    color: var(--bad-ink);
    font-weight: 700;
  }
</style>
