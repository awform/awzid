<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * V2-3 : « Mon espace » — le parent d'un compte « Mes enfants » ajoute son propre profil d'adulte (profil « Moi »,
   * un seul par compte). Un seul champ obligatoire : son année de naissance (majorité vérifiée par le serveur).
   */
  let { oncree }: { oncree: () => void } = $props();

  let ouvert = $state(false);
  let annee = $state<number | undefined>(undefined);
  let nom = $state('');
  let erreur = $state('');
  let busy = $state(false);

  async function creer(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    erreur = '';
    const r = await call('POST', '/profiles/moi', {
      birthYear: Number(annee),
      ...(nom.trim() ? { pseudonym: nom.trim() } : {}),
    });
    busy = false;
    if (!r.ok) {
      erreur = t(`erreur.${r.code ?? 'reseau'}`);
      return;
    }
    ouvert = false;
    oncree();
  }
</script>

{#if !ouvert}
  <p>
    <button type="button" onclick={() => (ouvert = true)} data-testid="moi-ouvrir"
      >{t('profils.moi_ajouter')}</button
    >
  </p>
{:else}
  <form class="card moi" onsubmit={creer} data-testid="moi-form">
    <h2>{t('profils.moi_ajouter')}</h2>
    <p class="muted"><Bidi text={t('profils.moi_aide')} /></p>
    <label for="moi-annee">{t('champ.annee_naissance')}</label>
    <input
      id="moi-annee"
      type="number"
      min="1900"
      max={new Date().getFullYear() - 18}
      required
      bind:value={annee}
      data-testid="moi-annee"
    />
    <label for="moi-nom">{t('champ.pseudonyme')}</label>
    <input id="moi-nom" maxlength="40" bind:value={nom} data-testid="moi-nom" />
    {#if erreur}<p class="error" role="alert" data-testid="moi-erreur">
        <Bidi text={erreur} />
      </p>{/if}
    <div class="row">
      <button type="submit" class="primary" disabled={busy} data-testid="moi-creer"
        >{t('profils.moi_creer')}</button
      >
      <button type="button" onclick={() => (ouvert = false)}>{t('commun.annuler')}</button>
    </div>
  </form>
{/if}

<style>
  .moi {
    display: grid;
    gap: 10px;
    max-width: 32rem;
  }
  h2 {
    margin: 0;
    font-family: var(--font-title);
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  input,
  .row button {
    min-height: 48px;
  }
  .error {
    color: var(--bad-ink);
    font-weight: 700;
  }
</style>
