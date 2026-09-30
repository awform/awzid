<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import type { RenderedDoc } from '@awform/school';
  import { fmtDate, t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * Certificats de niveau et attestations de hifẓ d'une classe (lot 13 ; QUA-3 : repris de la page de la
   * classe sans changement de comportement) : aperçu, délivrance numérotée, registre, export. Jamais une ijāza.
   */
  interface Cert {
    id: string;
    number: string;
    kind: string;
    pupilId: string | null;
    subject: string;
    issuedAt: string;
  }
  interface Pupil {
    id: string;
    displayName: string;
    gender: 'm' | 'f' | null;
  }
  let {
    classId,
    pupils,
    done,
    download,
    clearError,
  }: {
    classId: string;
    pupils: Pupil[];
    done: (ok: boolean, code: string | null | undefined, text: string) => boolean;
    download: (quoi: string) => Promise<unknown>;
    /** efface le message d'erreur de la page (après un aperçu réussi) */
    clearError: () => void;
  } = $props();
  const id = $derived(classId);
  let certs = $state<Cert[]>([]);
  let cert = $state({ pupilId: '', kind: 'niveau', part: '', gender: '' });
  let extra = $state<Record<string, string>>({});
  let preview = $state<{
    eligible: { ok: boolean; raison?: string; aConfirmer?: string };
    document: RenderedDoc;
  } | null>(null);

  onMount(async () => {
    const c = await call<{ certificates: Cert[] }>('GET', `/ecole/classes/${id}/certificats`);
    certs = c.data?.certificates ?? [];
  });

  const certPupil = $derived(pupils.find((p) => p.id === cert.pupilId) ?? null);
  async function certCall(apercu: boolean) {
    if (!cert.pupilId) return;
    const body = {
      kind: cert.kind,
      ...(cert.kind === 'hifz' ? { part: cert.part.trim() } : {}),
      ...(cert.gender ? { gender: cert.gender } : {}),
      fields: Object.fromEntries(Object.entries(extra).filter(([, v]) => v.trim())),
      apercu,
      ...(confirmerCc ? { confirmerCcPartiel: true } : {}),
    };
    return call<{
      eligible: { ok: boolean; raison?: string; aConfirmer?: string };
      document: RenderedDoc;
      certificate: Cert;
    }>('POST', `/ecole/pupils/${cert.pupilId}/certificats`, body);
  }
  /** audit MET-2 : délivrance malgré un contrôle continu partiel, sur confirmation explicite */
  let confirmerCc = $state(false);
  async function doPreview(e?: SubmitEvent) {
    e?.preventDefault();
    const r = await certCall(true);
    if (!r) return;
    if (!r.ok) return done(false, r.code, '');
    preview = { eligible: r.data!.eligible, document: r.data!.document };
    for (const k of preview.document.missing) if (!(k in extra)) extra[k] = '';
    clearError();
  }
  async function issue() {
    const r = await certCall(false);
    if (!r) return;
    if (
      done(r.ok, r.code, t('classe.certificat_ok', { numero: r.data?.certificate.number ?? '' }))
    ) {
      preview = null;
      extra = {};
      const c = await call<{ certificates: Cert[] }>('GET', `/ecole/classes/${id}/certificats`);
      certs = c.data?.certificates ?? [];
    }
  }
  const pupilName = (pid: string | null) =>
    pupils.find((p) => p.id === pid)?.displayName ?? t('classe.retire_de_la_classe');
  /** libellé d'un champ de modèle (clé brute si le libellé n'existe pas encore) */
  const champ = (k: string) => {
    const s = t(`classe.champ_${k}`);
    return s.startsWith('⟦') ? k : s;
  };
  const segText = (l: Array<{ t: string }>) => l.map((s) => s.t).join('');
</script>

<form class="card form" onsubmit={doPreview} data-testid="certificat-form">
  <h2>{t('classe.delivrer')}</h2>
  <p class="muted small">{t('classe.certificat_aide')}</p>
  <label
    >{t('classe.eleve')}
    <select
      bind:value={cert.pupilId}
      required
      data-testid="cert-eleve"
      onchange={() => (preview = null)}
    >
      <option value="" disabled>—</option>
      {#each pupils as p (p.id)}<option value={p.id}>{p.displayName}</option>{/each}
    </select></label
  >
  <label
    >{t('classe.type')}
    <select bind:value={cert.kind} data-testid="cert-type" onchange={() => (preview = null)}>
      <option value="niveau">{t('classe.cert_niveau')}</option>
      <option value="hifz">{t('classe.cert_hifz')}</option>
    </select></label
  >
  {#if cert.kind === 'hifz'}
    <label
      >{t('classe.passage_aide')}
      <input bind:value={cert.part} required data-testid="cert-passage" /></label
    >
  {/if}
  <label
    >{t('classe.genre')}
    <select bind:value={cert.gender}>
      <option value="">{certPupil?.gender ? t(`classe.genre_${certPupil.gender}`) : '—'}</option>
      <option value="f">{t('classe.genre_f')}</option>
      <option value="m">{t('classe.genre_m')}</option>
    </select></label
  >
  <label
    >{t('classe.nom_complet')}
    <input bind:value={extra.prenom_nom} maxlength="120" data-testid="cert-nom" /></label
  >
  {#each Object.keys(extra).filter((k) => k !== 'prenom_nom') as k (k)}
    <label>{champ(k)} <input bind:value={extra[k]} maxlength="200" data-champ={k} /></label>
  {/each}
  <button type="submit" data-testid="cert-apercu">{t('classe.apercu')}</button>
</form>

{#if preview}
  <section class="card" data-testid="cert-preview">
    {#if !preview.eligible.ok}
      <p class="warnbox" data-testid="cert-non-eligible">
        {t('classe.non_eligible', { raison: preview.eligible.raison ?? '' })}
      </p>
      {#if preview.eligible.aConfirmer === 'cc_partiel'}
        <label class="check" data-testid="confirmer-cc"
          ><input type="checkbox" bind:checked={confirmerCc} onchange={() => doPreview()} />
          {t('classe.confirmer_cc_partiel')}</label
        >
      {/if}
    {/if}
    {#if preview.document.missing.length}
      <p class="warnbox small">
        {t('classe.champs_manquants', { champs: preview.document.missing.join(', ') })}
      </p>
    {/if}
    {#if preview.document.aValider}<p class="muted small">
        {t('classe.modele_a_valider')}
      </p>{/if}
    <div class="doc">
      <div>
        <h3>{preview.document.titleFr}</h3>
        {#each preview.document.fr as l, i (i)}<p>{segText(l)}</p>{/each}
      </div>
      {#if preview.document.titleAr}
        <div dir="rtl" lang="ar" class="ar">
          <h3>{preview.document.titleAr}</h3>
          {#each preview.document.ar as l, i (i)}<p>{segText(l)}</p>{/each}
        </div>
      {/if}
    </div>
    <button
      type="button"
      class="primary"
      disabled={!preview.eligible.ok || preview.document.missing.length > 0}
      onclick={issue}
      data-testid="cert-delivrer">{t('classe.delivrer_numero')}</button
    >
  </section>
{/if}

<section class="card">
  <h2>{t('classe.registre')}</h2>
  <ul class="plain" data-testid="registre">
    {#each certs as c (c.id)}
      <li>
        <strong>{c.number}</strong> · {pupilName(c.pupilId)} · {c.kind === 'hifz'
          ? c.subject
          : c.subject.toUpperCase()} · {fmtDate(c.issuedAt, { dateStyle: 'medium' })}
        <a
          href={resolve('/enseignant/certificat/[id]', { id: c.id })}
          data-testid="imprimer-{c.number}">{t('classe.imprimer')}</a
        >
      </li>
    {:else}
      <li class="muted">{t('classe.aucun_certificat')}</li>
    {/each}
  </ul>
  <button type="button" onclick={() => download('certificats')} data-testid="export-registre"
    >{t('classe.export_registre')}</button
  >
</section>

<style>
  .form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    max-width: 640px;
  }
  .form label > input,
  .form label > select {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }
  .form label {
    display: grid;
    gap: 4px;
  }
  .plain {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  input,
  select {
    font: inherit;
    min-height: 44px;
    padding: 4px 8px;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--card);
    color: var(--ink);
    max-width: calc(100vw - 72px);
  }
  section,
  form {
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }
  .doc {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 16px;
    border: 2px solid var(--gold);
    border-radius: var(--radius-md);
    padding: 12px;
    margin: 8px 0;
  }
  .ar {
    font-family: var(--font-ar);
    font-size: 1.15rem;
    line-height: 2;
  }
  .warnbox {
    background: var(--warn-bg);
    padding: 6px 8px;
    border-radius: var(--radius-sm);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
