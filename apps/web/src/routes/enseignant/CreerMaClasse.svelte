<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import { call } from '$lib/session';

  /** Un seul champ : le nom de la classe (route existante POST /teacher/classes, code de la classe donné par le serveur). */
  let { oncree }: { oncree: (classe: { id: string; name: string; joinCode: string }) => void } =
    $props();

  let nom = $state('');
  let erreur = $state('');
  let busy = $state(false);

  async function creer(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    const n = nom.trim();
    if (!n) {
      erreur = t('ens.cree_vide');
      return;
    }
    busy = true;
    erreur = '';
    const r = await call<{ class: { id: string; name: string; joinCode: string } }>(
      'POST',
      '/teacher/classes',
      { name: n },
    );
    busy = false;
    if (!r.ok || !r.data) {
      erreur = t(`erreur.${r.code ?? 'reseau'}`);
      return;
    }
    oncree(r.data.class);
  }
</script>

<section class="creer" data-testid="creer-classe" aria-labelledby="creer-t">
  <h2 id="creer-t">{t('ens.cree_titre')}</h2>
  <p class="aide"><Bidi text={t('ens.cree_aide')} /></p>
  <form onsubmit={creer} novalidate>
    <label for="nom-classe">{t('ens.nom_classe')}</label>
    <input
      id="nom-classe"
      maxlength="60"
      autocomplete="off"
      bind:value={nom}
      aria-invalid={erreur ? 'true' : undefined}
      aria-describedby={erreur ? 'nom-classe-erreur' : undefined}
      data-testid="nom-classe"
    />
    {#if erreur}<p class="alerte" id="nom-classe-erreur" role="alert" data-testid="erreur-classe">
        <Bidi text={erreur} />
      </p>{/if}
    <button type="submit" class="primary" disabled={busy} data-testid="creer-classe-envoi"
      >{t('ens.creer_classe')}</button
    >
  </form>
</section>

<style>
  .creer {
    display: grid;
    gap: 12px;
    max-width: 32rem;
    margin-inline: auto;
    padding: 16px;
  }
  h2 {
    margin: 0;
    font-family: var(--font-title);
  }
  .aide {
    margin: 0;
    color: var(--ink2);
  }
  form {
    display: grid;
    gap: 10px;
  }
  input {
    min-height: 48px;
    padding: 10px 12px;
    border: 2px solid var(--line);
    border-radius: 12px;
    background: var(--card);
    color: var(--ink);
    font: inherit;
  }
  input:focus-visible {
    outline: 3px solid var(--primary);
    outline-offset: 2px;
  }
  input[aria-invalid='true'] {
    border-color: var(--bad-ink);
  }
  .alerte {
    margin: 0;
    color: var(--bad-ink);
  }
  button {
    min-height: 48px;
  }
</style>
