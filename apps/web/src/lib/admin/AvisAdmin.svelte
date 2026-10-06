<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { fmtDate, t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * F5 — file des AVIS reçus (administrateur ou support, second facteur) : catégorie, rôle et âge, page, texte
   * (jamais pour un enfant), image de l'écran sur demande ; statut nouveau → lu → traité (ou rejeté).
   */
  interface Avis {
    id: string;
    role: string;
    age: string | null;
    categorie: string;
    texte: string | null;
    page: string | null;
    version: string | null;
    capture: boolean;
    statut: string;
    creeLe: string;
  }
  const STATUTS = ['nouveau', 'lu', 'traite', 'rejete'] as const;
  let filtre = $state<string>('nouveau');
  let avis = $state<Avis[]>([]);
  let images = $state<Record<string, string>>({});

  async function load() {
    const r = await call<{ avis: Avis[] }>(
      'GET',
      `/admin/avis${filtre ? `?statut=${filtre}` : ''}`,
    );
    avis = r.ok && r.data ? r.data.avis : [];
  }
  onMount(load);

  async function statut(id: string, s: string) {
    await call('PUT', `/admin/avis/${id}`, { statut: s });
    await load();
  }
  async function voir(id: string) {
    const r = await fetch(`/api/v1/admin/avis/${id}/capture`, { credentials: 'same-origin' });
    if (!r.ok) return;
    // adresse data: (la politique de sécurité n'autorise pas les images blob:)
    const b = await r.blob();
    const url = await new Promise<string>((ok) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result));
      fr.readAsDataURL(b);
    });
    images = { ...images, [id]: url };
  }
</script>

<section class="card" data-testid="admin-avis">
  <h2>{t('avisadm.titre')}</h2>
  <label
    >{t('avisadm.filtre')}
    <select bind:value={filtre} onchange={load} data-testid="avisadm-filtre">
      <option value="">{t('avisadm.tous')}</option>
      {#each STATUTS as s (s)}<option value={s}><Bidi text={t(`avisadm.statut.${s}`)} /></option
        >{/each}
    </select></label
  >
  {#if !avis.length}
    <p class="muted">{t('avisadm.vide')}</p>
  {:else}
    <ul class="stack">
      {#each avis as a (a.id)}
        <li class="card" data-testid="avisadm-avis" data-statut={a.statut}>
          <p>
            <strong><Bidi text={t(`avis.cat.${a.categorie}`)} /></strong> ·
            <Bidi
              text={[t(`fn.role.${a.role}`), a.age ? t(`fn.age.${a.age}`) : '']
                .filter(Boolean)
                .join(' · ')}
            />
            · <span class="muted">{fmtDate(a.creeLe)}</span>
          </p>
          {#if a.texte}<p><Bidi text={a.texte} /></p>{/if}
          {#if a.page}<p class="muted"><Bidi text={t('avisadm.page', { page: a.page })} /></p>{/if}
          {#if a.capture}
            {#if images[a.id]}<img
                src={images[a.id]}
                alt={t('avis.apercu')}
                style="max-width:100%;max-height:50vh"
              />{:else}<button type="button" onclick={() => voir(a.id)}
                >{t('avisadm.voir_capture')}</button
              >{/if}
          {/if}
          <p>
            <Bidi text={t('avisadm.statut_actuel', { statut: t(`avisadm.statut.${a.statut}`) })} />
            {#each STATUTS.filter((s) => s !== a.statut) as s (s)}
              <button type="button" class="ghost" onclick={() => statut(a.id, s)}>
                <Bidi text={t(`avisadm.statut.${s}`)} /></button
              >
            {/each}
          </p>
        </li>
      {/each}
    </ul>
  {/if}
</section>
