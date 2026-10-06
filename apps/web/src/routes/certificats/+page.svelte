<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { demoProfileFor } from '$lib/attempts';
  import CertificatDoc, { type Cert } from '$lib/CertificatDoc.svelte';
  import { t } from '$lib/i18n';
  import { levelLabel } from '$lib/levels';
  import { call } from '$lib/session';

  /**
   * A39 (D-A39 4) — certificats de l'ADULTE AUTONOME : facultatifs, délivrés seulement après une épreuve de
   * passage réussie, même modèle et même vérification en ligne (QR) que ceux des écoles, « Awzid — parcours
   * autonome ». Le nom imprimé est donné par l'adulte (rien n'est inventé).
   */
  interface Liste {
    autonome: boolean;
    certificats: Array<{ id: string; numero: string; niveau: string; annule: boolean }>;
    possibles: string[];
  }
  let pid = $state('');
  let l = $state<Liste | null>(null);
  let cert = $state<Cert | null>(null);
  let nom = $state('');
  let civilite = $state('');
  let naissance = $state('');
  let error = $state('');
  const load = async () => {
    const r = await call<Liste>('GET', `/profiles/${pid}/certificats`);
    if (r.ok) l = r.data;
  };
  onMount(async () => {
    pid = (await demoProfileFor(''))?.id ?? '';
    if (pid) await load();
  });
  async function show(id: string) {
    const r = await call<{ certificate: Cert }>(
      'GET',
      `/profiles/${pid}/certificats/${id}?origin=${encodeURIComponent(location.origin)}`,
    );
    if (r.ok) cert = r.data!.certificate;
  }
  async function obtenir(niveau: string) {
    error = '';
    const r = await call<{ certificate: Cert }>('POST', `/profiles/${pid}/certificats`, {
      niveau,
      nom,
      ...(civilite ? { civilite } : {}),
      ...(naissance ? { naissance } : {}),
    });
    if (!r.ok) error = t(`erreur.${r.code ?? 'reseau'}`);
    else {
      await load();
      await show(r.data!.certificate.id);
    }
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('cert.titre')}</title></svelte:head>

<h1 class="noprint">{t('cert.titre')}</h1>
{#if cert}
  <p class="noprint">
    <button type="button" class="primary" onclick={() => window.print()} data-testid="imprimer"
      ><Bidi text={t('classe.imprimer_pdf')} /></button
    >
    <button type="button" onclick={() => (cert = null)}>{t('commun.retour')}</button>
  </p>
  <CertificatDoc {cert} />
{:else if l}
  <p class="muted"><Bidi text={t('cert.aide')} /></p>
  <ul data-testid="mes-certificats">
    {#each l.certificats as c (c.id)}
      <li>
        <button type="button" onclick={() => show(c.id)} data-certificat={c.niveau}
          ><Bidi text={`${levelLabel(c.niveau)} — ${c.numero}`} /></button
        >
      </li>
    {/each}
  </ul>
  {#each l.possibles.filter((n) => !l?.certificats.some((c) => c.niveau === n && !c.annule)) as n (n)}
    <form
      class="card stack"
      data-testid="obtenir-certificat"
      onsubmit={(e) => {
        e.preventDefault();
        void obtenir(n);
      }}
    >
      <h2><Bidi text={t('cert.obtenir', { niveau: levelLabel(n) })} /></h2>
      <label>{t('cert.nom')} <input bind:value={nom} required minlength="2" maxlength="80" /></label
      >
      <label
        >{t('cert.civilite')}
        <select bind:value={civilite}
          ><option value=""></option><option value="M.">{t('cert.m')}</option><option value="Mme"
            >{t('cert.mme')}</option
          ></select
        ></label
      >
      <label>{t('cert.naissance')} <input bind:value={naissance} maxlength="40" /></label>
      <button type="submit" class="primary">{t('cert.delivrer')}</button>
    </form>
  {:else}
    {#if !l.certificats.length}<p data-testid="aucun-certificat">{t('cert.aucun')}</p>{/if}
  {/each}
{/if}
{#if error}<p class="error" role="alert"><Bidi text={error} /></p>{/if}
