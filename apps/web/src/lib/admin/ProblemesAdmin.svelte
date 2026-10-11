<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { fmtDate, t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * Bêta-support — file des PROBLÈMES SIGNALÉS (administrateur ou support, second facteur) : catégorie, rôle et
   * âge, page d'origine, version de l'application, description (jamais pour un enfant), image sur demande ;
   * statut nouveau → en cours → réglé. Les points religieux à vérifier sont signalés en tête de ligne.
   */
  interface Probleme {
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
  const STATUTS = ['nouveau', 'en_cours', 'regle'] as const;
  let filtre = $state<string>('nouveau');
  let liste = $state<Probleme[]>([]);
  let images = $state<Record<string, string>>({});

  async function load() {
    const r = await call<{ problemes: Probleme[] }>(
      'GET',
      `/admin/problemes${filtre ? `?statut=${filtre}` : ''}`,
    );
    liste = r.ok && r.data ? r.data.problemes : [];
  }
  onMount(load);

  async function statut(id: string, s: string) {
    await call('PUT', `/admin/problemes/${id}`, { statut: s });
    await load();
  }
  async function voir(id: string) {
    const r = await fetch(`/api/v1/admin/problemes/${id}/capture`, { credentials: 'same-origin' });
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

<section class="card" data-testid="admin-problemes">
  <h2>{t('probadm.titre')}</h2>
  <label
    >{t('probadm.filtre')}
    <select bind:value={filtre} onchange={load} data-testid="probadm-filtre">
      <option value="">{t('probadm.tous')}</option>
      {#each STATUTS as s (s)}<option value={s}><Bidi text={t(`probadm.statut.${s}`)} /></option
        >{/each}
    </select></label
  >
  {#if !liste.length}
    <p class="muted">{t('probadm.vide')}</p>
  {:else}
    <ul class="stack">
      {#each liste as p (p.id)}
        <li class="card" data-testid="probadm-signalement" data-statut={p.statut}>
          <p>
            <strong><Bidi text={t(`probleme.cat.${p.categorie}`)} /></strong> ·
            <Bidi
              text={[t(`fn.role.${p.role}`), p.age ? t(`fn.age.${p.age}`) : '']
                .filter(Boolean)
                .join(' · ')}
            />
            · <span class="muted">{fmtDate(p.creeLe)}</span>
          </p>
          {#if p.categorie === 'religieux'}
            <p data-testid="probadm-religieux"><strong>{t('probadm.religieux')}</strong></p>
          {/if}
          {#if p.texte}<p><Bidi text={p.texte} /></p>
          {:else if p.age === 'enfant'}<p class="muted">{t('probadm.enfant')}</p>{/if}
          <p class="muted">
            {#if p.page}<Bidi text={t('probadm.page', { page: p.page })} />{/if}
            {#if p.version}
              · <Bidi text={t('probadm.version', { version: p.version })} />{/if}
          </p>
          {#if p.capture}
            {#if images[p.id]}<img
                src={images[p.id]}
                alt={t('avis.apercu')}
                style="max-width:100%;max-height:50vh"
              />{:else}<button type="button" onclick={() => voir(p.id)}
                >{t('probadm.voir_capture')}</button
              >{/if}
          {/if}
          <p>
            <Bidi text={t('probadm.statut_actuel', { statut: t(`probadm.statut.${p.statut}`) })} />
            {#each STATUTS.filter((s) => s !== p.statut) as s (s)}
              <button type="button" class="ghost" onclick={() => statut(p.id, s)}>
                <Bidi text={t(`probadm.statut.${s}`)} /></button
              >
            {/each}
          </p>
        </li>
      {/each}
    </ul>
  {/if}
</section>
