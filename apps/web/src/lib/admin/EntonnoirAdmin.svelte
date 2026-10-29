<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { fmtNumber, t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * V2-0 — ENTONNOIR de l'inscription et de la connexion (administrateur ou support) : le nombre de fois où chaque
   * étape a été atteinte et son pourcentage de la première étape, sur 7 ou 30 jours. Compteurs anonymes (ni adresse
   * IP, ni identifiant, ni e-mail), conservés 90 jours ; aucun événement individuel.
   */
  interface Ligne {
    etape: string;
    n: number;
    pourcent: number | null;
    cote: boolean;
  }
  interface Data {
    jours: number;
    inscription: Ligne[];
    connexion: Ligne[];
  }
  let jours = $state<7 | 30>(7);
  let data = $state<Data | null>(null);
  async function load() {
    const r = await call<Data>('GET', `/admin/entonnoir?jours=${jours}`);
    data = r.ok ? r.data : null;
  }
  onMount(load);
  const pct = (p: number | null) => (p === null ? '—' : `${fmtNumber(p)} %`);
</script>

{#snippet tableau(parcours: 'inscription' | 'connexion', lignes: Ligne[])}
  <h3 id="t-entonnoir-{parcours}"><Bidi text={t(`entonnoir.${parcours}`)} /></h3>
  <div class="table-wrap">
    <table aria-labelledby="t-entonnoir-{parcours}" data-testid="entonnoir-{parcours}">
      <thead
        ><tr
          ><th>{t('entonnoir.etape')}</th><th>{t('entonnoir.nombre')}</th><th
            >{t('entonnoir.pourcent')}</th
          ></tr
        ></thead
      >
      <tbody>
        {#each lignes as l (l.etape)}
          <tr data-etape={l.etape}>
            <th><Bidi text={t(`entonnoir.e.${l.etape}`)} /></th>
            <td><Bidi text={fmtNumber(l.n)} /></td>
            <td><Bidi text={pct(l.pourcent)} /></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/snippet}

<section class="card" data-testid="admin-entonnoir">
  <h2 id="t-entonnoir">{t('entonnoir.titre')}</h2>
  <p class="muted"><Bidi text={t('entonnoir.aide')} /></p>
  <label
    >{t('entonnoir.periode')}
    <select bind:value={jours} onchange={load} data-testid="entonnoir-periode">
      {#each [7, 30] as j (j)}<option value={j}>{t('entonnoir.jours', { n: j })}</option>{/each}
    </select></label
  >
  {#if data}
    {@render tableau('inscription', data.inscription)}
    {@render tableau('connexion', data.connexion)}
  {/if}
</section>
