<script lang="ts" module>
  import type { RenderedDoc } from '@awform/school';
  export interface Cert {
    id: string;
    number: string;
    classId?: string | null;
    document: RenderedDoc & { number: string; issuedOn: string };
    verifCode: string | null;
    revokedAt: string | null;
    revokeReason: string | null;
    /** QR de vérification publique (lot 20), calculé par l'API pour l'adresse du site (A39 : poids) */
    qr?: { size: number; d: string } | null;
  }
</script>

<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';

  /**
   * Certificat délivré, IMPRIMABLE (A4 paysage, texte français à gauche, arabe à droite, numéro du registre et QR
   * de vérification en bas) — document FIGÉ à la délivrance. Partagé par l'espace enseignant (certificats d'école)
   * et l'adulte autonome (A39, D-A39 4). Jamais une ijāza.
   */
  let { cert }: { cert: Cert } = $props();
  const d = $derived(cert.document);
  const qr = $derived(cert.qr ?? null);
</script>

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
</article>

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
  @page {
    size: A4 landscape;
    margin: 10mm;
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
    :global(.noprint),
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
