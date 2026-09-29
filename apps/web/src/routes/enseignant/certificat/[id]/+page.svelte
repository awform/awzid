<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import type { RenderedDoc } from '@awform/school';
  import { t } from '$lib/i18n';
  import { call } from '$lib/session';

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
  }
  let cert = $state<Cert | null>(null);
  let error = $state('');
  const id = $derived(page.params.id ?? '');

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
    >{t('classe.imprimer_pdf')}</button
  >
</div>
{#if error}<p class="card" role="alert">{error}</p>{/if}
{#if cert}
  {@const d = cert.document}
  <article class="certificat" data-testid="certificat">
    <div class="cols" class:single={!d.titleAr}>
      <section lang="fr">
        <h1>{d.titleFr}</h1>
        {#each d.fr as line, i (i)}
          <p>
            {#each line as s, j (j)}{#if s.b}<strong>{s.t}</strong>{:else}{s.t}{/if}{/each}
          </p>
        {/each}
      </section>
      {#if d.titleAr}
        <section dir="rtl" lang="ar" class="ar">
          <h1>{d.titleAr}</h1>
          {#each d.ar as line, i (i)}
            <p>
              {#each line as s, j (j)}{#if s.b}<strong>{s.t}</strong>{:else}{s.t}{/if}{/each}
            </p>
          {/each}
        </section>
      {/if}
    </div>
    <div class="signs">
      {#each d.signatures as s, i (i)}<div class="sign">{s}</div>{/each}
    </div>
    <p class="numero" data-testid="numero">{t('classe.numero', { numero: cert.number })}</p>
    {#if d.aValider}<p class="small noprint">{t('classe.modele_a_valider')}</p>{/if}
  </article>
{/if}

<style>
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
