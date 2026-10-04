<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import type { RenderedDoc } from '@awform/school';
  import { t } from '$lib/i18n';
  import { call } from '$lib/session';
  import { qrPath, verifyUrl } from '$lib/qrsvg';

  /**
   * Certificat ou attestation délivré, IMPRIMABLE (A4 paysage, texte français à gauche, arabe à droite,
   * numéro du registre en bas) — « Enregistrer au format PDF » du navigateur. Le document est celui FIGÉ
   * au moment de la délivrance. Jamais une ijāza.
   */
  interface Cert {
    id: string;
    number: string;
    kind: string;
    classId: string | null;
    document: RenderedDoc & { number: string; issuedOn: string };
    verifCode: string | null;
    signature: string | null;
    revokedAt: string | null;
    revokeReason: string | null;
  }
  let cert = $state<Cert | null>(null);
  let error = $state('');
  const id = $derived(page.params.id ?? '');
  /** QR de vérification publique (lot 20) : numéro + code aléatoire, adresse du site */
  const qr = $derived(
    cert?.verifCode ? qrPath(verifyUrl(location.origin, cert.number, cert.verifCode)) : null,
  );
  let motif = $state('');
  async function annuler(e: SubmitEvent) {
    e.preventDefault();
    if (!cert || !confirm(t('verif.annuler_confirmer'))) return;
    const r = await call('POST', `/ecole/certificats/${cert.id}/annuler`, { motif });
    if (!r.ok) {
      error = t(`erreur.${r.code ?? 'reseau'}`);
      return;
    }
    const again = await call<{ certificate: Cert }>('GET', `/ecole/certificats/${id}`);
    if (again.ok) cert = again.data!.certificate;
  }

  onMount(async () => {
    const r = await call<{ certificate: Cert }>('GET', `/ecole/certificats/${id}`);
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
  {@const d = cert.document}
  <article class="certificat" data-testid="certificat">
    <div class="cols" class:single={!d.titleAr}>
      <section lang="fr">
        <h1><Bidi text={d.titleFr} /></h1>
        {#each d.fr as line, i (i)}
          <p>
            {#each line as s, j (j)}{#if s.b}<strong><Bidi text={s.t} /></strong>{:else}<Bidi
                  text={s.t}
                />{/if}{/each}
          </p>
        {/each}
      </section>
      {#if d.titleAr}
        <section dir="rtl" lang="ar" class="ar">
          <h1><Bidi text={d.titleAr} base="ar" /></h1>
          {#each d.ar as line, i (i)}
            <p>
              {#each line as s, j (j)}{#if s.b}<strong><Bidi text={s.t} base="ar" /></strong
                  >{:else}<Bidi text={s.t} base="ar" />{/if}{/each}
            </p>
          {/each}
        </section>
      {/if}
    </div>
    <div class="signs">
      {#each d.signatures as s, i (i)}<div class="sign"><Bidi text={s} /></div>{/each}
    </div>
    <div class="foot">
      <p class="numero" data-testid="numero">
        <Bidi text={t('classe.numero', { numero: cert.number })} />
      </p>
      {#if qr && cert.verifCode}
        <figure class="qr" data-testid="qr-verification">
          <svg viewBox="0 0 {qr.size} {qr.size}" role="img" aria-label={t('verif.qr_aria')}
            ><rect width={qr.size} height={qr.size} fill="#fff" /><path d={qr.d} fill="#000" /></svg
          >
          <figcaption><Bidi text={t('verif.qr_legende', { code: cert.verifCode })} /></figcaption>
        </figure>
      {/if}
    </div>
    {#if cert.revokedAt}<p class="annule" role="status">
        <Bidi text={t('verif.annule_court', { motif: cert.revokeReason ?? '' })} />
      </p>{/if}
    {#if d.aValider}<p class="small noprint">{t('classe.modele_a_valider')}</p>{/if}
  </article>
{/if}

<style>
  .foot {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 12px;
  }
  .qr {
    margin: 0;
    width: 28mm;
    text-align: center;
    font-size: 8pt;
  }
  .qr svg {
    width: 28mm;
    height: 28mm;
  }
  .annule {
    color: var(--bad-ink);
    font-weight: 700;
  }
  .annuler {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: end;
    margin: 12px 0;
  }
  @page {
    size: A4 landscape;
    margin: 10mm;
  }
  .row {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 12px;
  }
  .certificat {
    background: var(--card);
    color: var(--ink);
    border: 6px double var(--gold);
    outline: 3px solid var(--teal);
    outline-offset: -14px;
    border-radius: var(--radius-md);
    padding: 28px 32px;
    max-width: calc(100vw - 32px);
    box-sizing: border-box;
    display: grid;
    gap: 16px;
  }
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 28px;
  }
  .cols.single {
    grid-template-columns: 1fr;
  }
  h1 {
    font-size: 1.35rem;
    text-align: center;
    color: var(--navy);
  }
  .ar {
    font-family: var(--font-ar);
    font-size: 1.2rem;
    line-height: 2.1;
  }
  .signs {
    display: flex;
    justify-content: space-around;
    gap: 16px;
    margin-top: 24px;
  }
  .sign {
    border-top: 1px solid var(--ink2);
    padding-top: 6px;
    min-width: 180px;
    text-align: center;
  }
  .numero {
    text-align: center;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.05em;
  }
  .small {
    font-size: 0.85rem;
  }
  @media (max-width: 700px) {
    .cols {
      grid-template-columns: 1fr;
    }
    .certificat {
      padding: 20px 16px;
    }
    .sign {
      min-width: 0;
      flex: 1;
    }
  }
  @media print {
    .noprint,
    :global(header.top),
    :global(nav.tabs) {
      display: none !important;
    }
    :global(body) {
      background: var(--card);
    }
    .cols {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
