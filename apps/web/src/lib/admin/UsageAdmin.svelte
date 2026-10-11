<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { fmtNumber, t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * F5 — tableau d'USAGE SANS TRACEUR (administrateur ou support) : totaux par jour calculés par le serveur
   * (aucun événement individuel), aucun chiffre sous le seuil d'anonymat ; fonctions jamais utilisées ; leçons où
   * l'on abandonne et temps médian, à partir des données d'apprentissage déjà gardées.
   */
  interface Ligne {
    cle: string;
    personnesJours: number | null;
    ouvertures: number | null;
    sousSeuil: boolean;
  }
  interface Lecon {
    unitId: string;
    titre: string | null;
    niveau: string;
    commencees: number;
    abandonnees: number;
    terminees: number;
    minutesMedianes: number | null;
  }
  interface Data {
    jours: number;
    seuil: number;
    usage: Ligne[];
    jamaisUtilisees: string[];
    lecons: Lecon[];
  }
  let jours = $state(30);
  let data = $state<Data | null>(null);
  async function load() {
    const r = await call<Data>('GET', `/admin/usage?jours=${jours}`);
    data = r.ok ? r.data : null;
  }
  onMount(load);
  const n = (x: number | null, sous: boolean) =>
    sous ? t('usage.sous_seuil', { seuil: data?.seuil ?? 10 }) : fmtNumber(x ?? 0);
</script>

<section class="card" data-testid="admin-usage">
  <h2 id="t-usage">{t('usage.titre')}</h2>
  {#if data}
    <p class="muted"><Bidi text={t('usage.aide', { seuil: data.seuil })} /></p>
    <label
      >{t('usage.periode')}
      <select bind:value={jours} onchange={load}>
        {#each [7, 30, 90] as j (j)}<option value={j}>{t('usage.jours', { n: j })}</option>{/each}
      </select></label
    >
    <div class="table-wrap">
      <table aria-labelledby="t-usage">
        <thead
          ><tr
            ><th>{t('usage.cle')}</th><th>{t('usage.personnes')}</th><th>{t('usage.ouvertures')}</th
            ></tr
          ></thead
        >
        <tbody>
          {#each data.usage.filter((u) => !data!.jamaisUtilisees.includes(u.cle)) as u (u.cle)}
            <tr data-cle={u.cle}>
              <th><Bidi text={u.cle} /></th>
              <td><Bidi text={n(u.personnesJours, u.sousSeuil)} /></td>
              <td><Bidi text={n(u.ouvertures, u.sousSeuil)} /></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <h3>{t('usage.jamais')}</h3>
    <p data-testid="usage-jamais"><Bidi text={data.jamaisUtilisees.join(', ') || '—'} /></p>
    <h3 id="t-lecons">{t('usage.lecons')}</h3>
    {#if !data.lecons.length}
      <p class="muted"><Bidi text={t('usage.aucune', { seuil: data.seuil })} /></p>
    {:else}
      <div class="table-wrap">
        <table aria-labelledby="t-lecons">
          <thead
            ><tr
              ><th>{t('usage.lecon')}</th><th>{t('usage.commencees')}</th><th
                >{t('usage.abandon')}</th
              ><th>{t('usage.terminees')}</th><th>{t('usage.minutes')}</th></tr
            ></thead
          >
          <tbody>
            {#each data.lecons as l (l.unitId)}
              <tr>
                <th><Bidi text={`${l.unitId}${l.titre ? ` — ${l.titre}` : ''}`} /></th>
                <td><Bidi text={l.commencees} /></td>
                <td><Bidi text={l.abandonnees} /></td>
                <td><Bidi text={l.terminees} /></td>
                <td><Bidi text={l.minutesMedianes ?? '—'} /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</section>
