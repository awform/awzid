<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import CertificatDoc, { type Cert } from '$lib/CertificatDoc.svelte';
  import { t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * Certificat ou attestation délivré, IMPRIMABLE (A4 paysage, texte français à gauche, arabe à droite,
   * numéro du registre en bas) — « Enregistrer au format PDF » du navigateur. Le document est celui FIGÉ
   * au moment de la délivrance (rendu partagé : `CertificatDoc`, A39). Jamais une ijāza.
   */
  let cert = $state<Cert | null>(null);
  let error = $state('');
  const id = $derived(page.params.id ?? '');
  // QR de vérification calculé par l'API pour l'adresse de ce site
  const path = $derived(`/ecole/certificats/${id}?origin=${encodeURIComponent(location.origin)}`);
  let motif = $state('');
  async function annuler(e: SubmitEvent) {
    e.preventDefault();
    if (!cert || !confirm(t('verif.annuler_confirmer'))) return;
    const r = await call('POST', `/ecole/certificats/${cert.id}/annuler`, { motif });
    if (!r.ok) {
      error = t(`erreur.${r.code ?? 'reseau'}`);
      return;
    }
    const again = await call<{ certificate: Cert }>('GET', path);
    if (again.ok) cert = again.data!.certificate;
  }

  onMount(async () => {
    const r = await call<{ certificate: Cert }>('GET', path);
    if (r.ok) cert = r.data!.certificate;
    else error = t(`erreur.${r.code ?? 'reseau'}`);
  });
</script>

<svelte:head><title>{t('app.nom')} — {cert?.number ?? t('classe.registre')}</title></svelte:head>

<div class="noprint row">
  {#if cert?.classId}<a href={resolve('/enseignant/classe/[id]', { id: cert.classId })}
      >{t('classe.retour_classe')}</a
    >{/if}
  <button type="button" class="primary" onclick={() => window.print()} data-testid="imprimer"
    ><Bidi text={t('classe.imprimer_pdf')} /></button
  >
</div>
{#if error}<p class="card" role="alert"><Bidi text={error} /></p>{/if}
{#if cert && !cert.revokedAt}
  <form class="noprint annuler" onsubmit={annuler}>
    <label
      >{t('verif.annuler_motif')}
      <input bind:value={motif} minlength="3" maxlength="200" required /></label
    >
    <button type="submit">{t('verif.annuler')}</button>
  </form>
{/if}
{#if cert}
  <CertificatDoc {cert} />
  {#if cert.document.aValider}<p class="small noprint">{t('classe.modele_a_valider')}</p>{/if}
{/if}

<style>
  .annuler {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: end;
    margin: 12px 0;
  }
  .row {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 12px;
  }
  .small {
    font-size: 0.85rem;
  }
</style>
