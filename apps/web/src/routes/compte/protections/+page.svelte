<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import { call, fetchMe, type Me } from '$lib/session';

  /**
   * Réglages protecteurs des mineurs (lot 11, étude rec. 5) : l'état de chaque protection pour chaque
   * profil d'enfant ou d'ado, avec les valeurs PAR DÉFAUT les plus protectrices. Ce qui peut changer se
   * change ailleurs (accord du tuteur, classe, rappels) ; le reste n'existe tout simplement pas dans AWFORM.
   */
  interface P {
    mineur: boolean;
    enfant: boolean;
    tuteurIA: boolean;
    texteLibreTuteur: boolean;
    partageEnseignant: boolean;
    rappels: boolean;
    horaireNuit: string | null;
    compteurRegularite: boolean;
    personnalisationComportementale: boolean;
    monnaieVirtuelle: boolean;
    lectureAutomatique: boolean;
    publicite: boolean;
    enregistrementsEnvoyes: boolean;
  }
  let me = $state<Me | null>(null);
  let rows = $state<Record<string, P>>({});
  const KEYS = [
    'tuteurIA',
    'texteLibreTuteur',
    'partageEnseignant',
    'rappels',
    'compteurRegularite',
    'personnalisationComportementale',
    'monnaieVirtuelle',
    'lectureAutomatique',
    'publicite',
    'enregistrementsEnvoyes',
  ] as const;

  onMount(async () => {
    me = await fetchMe();
    for (const p of me?.profiles ?? []) {
      const r = await call<P>('GET', `/profiles/${p.id}/protections`);
      if (r.ok && r.data) rows[p.id] = r.data;
    }
  });
</script>

<svelte:head><title>{t('app.nom')} — {t('prot.titre')}</title></svelte:head>

<p><a href={resolve('/compte')}>{t('ctut.retour')}</a></p>
<h1>{t('prot.titre')}</h1>
<p class="muted">{t('prot.intro')}</p>

{#each me?.profiles ?? [] as p (p.id)}
  {@const r = rows[p.id]}
  {#if r?.mineur}
    <section class="card" data-protections={p.id}>
      <h2><Bidi text={p.pseudonym} /></h2>
      <ul class="list">
        {#each KEYS as k (k)}
          <li data-protection={k} data-actif={r[k]}>
            <span class="state" class:on={r[k]}
              ><Bidi text={r[k] ? t('prot.oui') : t('prot.non')} /></span
            >
            <Bidi text={t(`prot.${k}`)} />
          </li>
        {/each}
        {#if r.horaireNuit}<li>{t('prot.horaire')}</li>{/if}
      </ul>
      <p class="muted small">
        {t('prot.changer')} <a href={resolve('/compte/tuteur')}>{t('compte.tuteur_lien')}</a>
      </p>
    </section>
  {/if}
{/each}

<style>
  .list {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .state {
    display: inline-block;
    min-width: 3.2em;
    font-weight: 700;
    color: var(--ink2);
  }
  .state.on {
    color: var(--ok-ink);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
