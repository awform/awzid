<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { locale, t } from '$lib/i18n';
  import { call } from '$lib/session';
  import { onMount } from 'svelte';
  import { chargerStatut } from '$lib/acces';
  import { retenirSource } from '$lib/provenance';

  /**
   * Bêta fermée : demande d'invitation (liste d'attente validée à la main). L'adresse n'est gardée qu'avec l'accord
   * de la personne ; la réponse est toujours la même, que l'adresse soit déjà dans la liste ou non.
   */
  let email = $state('');
  let nom = $state('');
  let mot = $state('');
  let consentement = $state(false);
  let busy = $state(false);
  let envoye = $state(false);
  let erreur = $state('');
  /** anti-robots (réglage « antibot ») : jeton signé reçu à l'ouverture + champ piège que seul un robot remplit */
  let jeton = $state('');
  let piege = $state('');
  async function nouveauJeton() {
    const j = await call<{ jeton: string }>('GET', '/acces/jeton');
    jeton = j.ok && j.data ? j.data.jeton : '';
  }
  let source: string | null = null;
  onMount(async () => {
    source = retenirSource(new URLSearchParams(location.search));
    if ((await chargerStatut())?.antibot === 'on') await nouveauJeton();
  });

  async function envoyer(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    erreur = '';
    const r = await call('POST', '/acces/liste-attente', {
      email: email.trim(),
      ...(nom.trim() ? { nom: nom.trim() } : {}),
      ...(mot.trim() ? { mot: mot.trim() } : {}),
      langue: locale(),
      consentement,
      ...(jeton ? { jeton } : {}),
      ...(piege ? { site_web: piege } : {}),
      // provenance des affiches (?src=), retenue pour la session de l'onglet
      ...(source ? { src: source } : {}),
    });
    busy = false;
    if (r.ok) envoye = true;
    else {
      erreur = t(`erreur.${r.code ?? 'reseau'}`);
      if (r.code === 'antibot_echec') await nouveauJeton();
    }
  }
</script>

<div class="attente" data-testid="liste-attente">
  {#if envoye}
    <p class="card ok" role="status" data-testid="attente-ok">
      <Bidi text={t('inv.attente_ok')} />
    </p>
  {:else}
    <p><Bidi text={t('inv.attente_intro')} /></p>
    <form onsubmit={envoyer}>
      <!-- champ piège anti-robots : invisible et hors du parcours au clavier -->
      <div class="piege" aria-hidden="true">
        <input name="site_web" type="text" tabindex="-1" autocomplete="off" bind:value={piege} />
      </div>
      <label for="att-email"><Bidi text={t('inv.attente_email')} /></label>
      <input
        id="att-email"
        type="email"
        autocomplete="email"
        required
        bind:value={email}
        data-testid="attente-email"
      />
      <label for="att-nom"><Bidi text={t('inv.attente_nom')} /></label>
      <input id="att-nom" maxlength="80" bind:value={nom} />
      <label for="att-mot"><Bidi text={t('inv.attente_mot')} /></label>
      <textarea id="att-mot" rows="3" maxlength="500" bind:value={mot}></textarea>
      <label class="check"
        ><input
          type="checkbox"
          bind:checked={consentement}
          required
          data-testid="attente-consentement"
        />
        <span><Bidi text={t('inv.attente_consent')} /></span></label
      >
      {#if erreur}<p class="error" role="alert"><Bidi text={erreur} /></p>{/if}
      <button type="submit" class="primary" disabled={busy} data-testid="attente-envoyer"
        ><Bidi text={t('inv.attente_envoyer')} /></button
      >
    </form>
  {/if}
</div>

<style>
  form {
    display: grid;
    gap: 8px;
  }
  input:not([type='checkbox']),
  textarea {
    font: inherit;
    min-height: 48px;
    padding: 6px 10px;
    border: 2px solid var(--line);
    border-radius: 10px;
  }
  .check {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .check input {
    width: 24px;
    height: 24px;
    flex: none;
  }
  .piege {
    position: absolute;
    inset-inline-start: -10000px;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }
  .error {
    color: var(--bad-ink);
    font-weight: 700;
  }
  .ok {
    background: var(--primary-soft);
  }
</style>
