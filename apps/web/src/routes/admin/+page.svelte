<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { fmtDate, t } from '$lib/i18n';
  import { call } from '$lib/session';
  import ActivationAdmin from '$lib/ActivationAdmin.svelte';
  import ModerationAdmin from '$lib/ModerationAdmin.svelte';
  import ContenuAdmin from '$lib/ContenuAdmin.svelte';

  /**
   * Tableau de bord ADMINISTRATEUR minimal, en lecture seule : utilisateurs (e-mails masqués), éditions et
   * contenus importés, questions du tuteur, alertes de protection, abonnements, journal d'audit.
   */
  interface Overview {
    comptes: Array<{ kind: string; n: number }>;
    profils: Array<{ kind: string; n: number }>;
    derniersComptes: Array<{
      id: string;
      kind: string;
      email: string | null;
      country: string | null;
      createdAt: string;
      totp: boolean;
    }>;
    editions: Array<{
      code: string;
      statut: string;
      publiee: string | null;
      creee: string;
      unites: number | null;
      avertissements: number | null;
      hadithsMasques: number | null;
    }>;
    niveaux: Array<{ level: string; n: number }>;
    questions: Array<{
      id: string;
      /** audit MIN-12 : ni texte ni pseudonyme de l'enfant pour l'administrateur */
      kind: string;
      motif: string;
      status: string;
      createdAt: string;
    }>;
    alertes: Array<{ id: string; motif: string; createdAt: string }>;
    abonnements: Array<{ plan: string; status: string; n: number }>;
    audit: Array<{ action: string; target: string | null; at: string; actorKind: string | null }>;
  }
  let data = $state<Overview | null>(null);
  let code = $state('');
  let loaded = $state(false);

  onMount(async () => {
    const r = await call<Overview>('GET', '/admin/overview');
    loaded = true;
    data = r.ok ? r.data : null;
    code = r.ok ? '' : (r.code ?? 'erreur');
  });
</script>

<svelte:head><title>{t('app.nom')} — {t('admin.titre')}</title></svelte:head>

<h1>{t('admin.titre')}</h1>
<p class="muted">{t('admin.intro')}</p>

{#if loaded && code === 'reserve_admin'}
  <p class="card">{t('admin.reserve')}</p>
  <!-- lot F1 : le référent religieux (rôle) traite ici la file des signalements du contenu -->
  <ContenuAdmin />
{:else if loaded && code}
  <p class="card warnbox">
    {t('compte.totp_obligatoire')} <a href={resolve('/compte')}>{t('entete.compte')}</a>
  </p>
{:else if data}
  <div class="grid" data-testid="admin">
    <section class="card">
      <h2 id="t-utilisateurs">{t('admin.utilisateurs')}</h2>
      <table aria-labelledby="t-utilisateurs">
        <tbody>
          {#each data.comptes as c (c.kind)}<tr
              ><th><Bidi text={t(`admin.compte_${c.kind}`)} /></th><td><Bidi text={c.n} /></td></tr
            >{/each}
          {#each data.profils as p (p.kind)}<tr
              ><th><Bidi text={t(`admin.profil_${p.kind}`)} /></th><td><Bidi text={p.n} /></td></tr
            >{/each}
        </tbody>
      </table>
    </section>
    <section class="card">
      <h2 id="t-abonnements">{t('admin.abonnements')}</h2>
      <table aria-labelledby="t-abonnements">
        <tbody>
          {#each data.abonnements as s (s.plan + s.status)}<tr
              ><th
                ><Bidi text={t(`offre.nom_${s.plan}`)} /> · <Bidi
                  text={t(`abo.statut_${s.status}`)}
                /></th
              ><td><Bidi text={s.n} /></td></tr
            >{:else}<tr><td class="muted">{t('admin.aucun')}</td></tr>{/each}
        </tbody>
      </table>
    </section>
  </div>

  <ContenuAdmin />
  <ModerationAdmin />
  <ActivationAdmin />

  <section class="card">
    <h2 id="t-editions">{t('admin.editions')}</h2>
    <div class="scroll">
      <table aria-labelledby="t-editions" data-testid="admin-editions">
        <thead
          ><tr
            ><th>{t('admin.code')}</th><th>{t('admin.statut')}</th><th>{t('admin.creee')}</th><th
              >{t('admin.unites')}</th
            ><th>{t('admin.hadiths_masques')}</th></tr
          ></thead
        >
        <tbody>
          {#each data.editions as e (e.code)}
            <tr
              ><td><Bidi text={e.code} /></td><td><Bidi text={e.statut} /></td><td
                >{fmtDate(e.creee)}</td
              ><td><Bidi text={e.unites ?? ''} /></td><td><Bidi text={e.hadithsMasques ?? ''} /></td
              ></tr
            >
          {/each}
        </tbody>
      </table>
    </div>
    <p class="small">
      {#each data.niveaux as l, i (l.level)}{#if i > 0},
        {/if}<Bidi text={l.level} /> (<Bidi text={l.n} />){/each}
    </p>
  </section>

  <section class="card">
    <h2>{t('admin.questions')} · <Bidi text={t('admin.alertes', { n: data.alertes.length })} /></h2>
    <ul class="list">
      {#each data.questions as q (q.id)}
        <li>
          {fmtDate(q.createdAt)} · <Bidi text={t(`ensq.motif_${q.motif}`)} /> · <Bidi
            text={t(`admin.q_${q.status}`)}
          />
        </li>
      {:else}
        <li class="muted">{t('admin.aucun')}</li>
      {/each}
    </ul>
  </section>

  <section class="card">
    <h2 id="t-comptes">{t('admin.derniers_comptes')}</h2>
    <div class="scroll">
      <table aria-labelledby="t-comptes">
        <tbody>
          {#each data.derniersComptes as a (a.id)}
            <tr
              ><td><Bidi text={t(`admin.compte_${a.kind}`)} /></td><td
                ><Bidi text={a.email ?? ''} /></td
              ><td><Bidi text={a.country ?? ''} /></td><td
                ><Bidi text={a.totp ? t('admin.deux_facteurs') : ''} /></td
              ><td>{fmtDate(a.createdAt)}</td></tr
            >
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section class="card">
    <h2>{t('admin.audit')}</h2>
    <ul class="list small" data-testid="admin-audit">
      {#each data.audit as a, i (i)}<li>
          {fmtDate(a.at)} · <Bidi text={a.actorKind ?? ''} /> · <Bidi text={a.action} />
        </li>{/each}
    </ul>
  </section>
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    text-align: start;
    padding: 4px 6px;
    border-bottom: 1px solid var(--line);
  }
  .scroll {
    overflow-x: auto;
  }
  .list {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
