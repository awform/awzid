<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { fmtDate, fmtNumber, t } from '$lib/i18n';
  import { fetchMe, type Me } from '$lib/session';
  import { familyRecitals, type FamilyRecital } from '$lib/recital';

  /**
   * Récital de hifẓ vu par la famille (suite V1-b) : séances des classes du profil, SES passages tirés au sort,
   * résultat officiel une fois publié par l'enseignant. Enfant : l'étoile et une phrase positive ; la note
   * /20 reste repliée « pour le parent » (CDC §2.6-5). Aucun classement ; le texte n'est pas reproduit.
   */
  let me = $state<Me | null>(null);
  let profileId = $state('');
  let recitals = $state<FamilyRecital[]>([]);
  let error = $state('');
  const kind = $derived(me?.profiles.find((p) => p.id === profileId)?.kind ?? '');

  async function load() {
    error = '';
    const r = await familyRecitals(profileId);
    if (!r.ok) error = t(`erreur.${r.code ?? 'reseau'}`);
    recitals = r.ok && r.data ? r.data.recitals : [];
  }
  onMount(async () => {
    me = await fetchMe();
    profileId = me?.profiles[0]?.id ?? '';
    if (profileId) await load();
  });
</script>

<svelte:head><title>{t('app.nom')} — {t('rec.titre')}</title></svelte:head>

<h1>{t('rec.titre')}</h1>
{#if !me}
  <p>
    {t('profils.connexion_requise')} <a href={resolve('/connexion')}>{t('entete.connexion')}</a>
  </p>
{:else}
  {#if me.profiles.length > 1}
    <label
      >{t('rec.profil')}
      <select bind:value={profileId} onchange={load}>
        {#each me.profiles as p (p.id)}<option value={p.id}>{p.pseudonym}</option>{/each}
      </select></label
    >
  {/if}
  <p class="muted small">{t('rec.famille_aide')}</p>
  <p class="muted small">{t('rec.lecteur')}</p>
  {#if error}<p class="card bad" role="alert">{error}</p>{/if}
  <ul class="list">
    {#each recitals as r (r.id)}
      <li class="card" data-testid="recital-famille">
        <h2>{r.titre} — {fmtDate(`${r.jour}T12:00:00`, { dateStyle: 'long' })}</h2>
        <p class="muted small">{r.classe}</p>
        {#if r.passages.length}
          <p class="small">{t('rec.tires')} :</p>
          <ol>
            {#each r.passages as p (p.passage)}<li>{p.libelle}</li>{/each}
          </ol>
        {/if}
        {#if r.resultat}
          {#if kind === 'enfant'}
            <p class="star" data-testid="recital-etoile">
              <span aria-hidden="true">★</span>
              {t('rec.etoile')}
            </p>
            <details>
              <summary>{t('rec.pour_parent')}</summary>
              <p>
                {t('rec.note', {
                  total: fmtNumber(r.resultat.total),
                  mention: t(`hifz.mention_${r.resultat.mention}`),
                  coran: fmtNumber(r.resultat.coran15),
                })}
              </p>
            </details>
          {:else}
            <p data-testid="recital-resultat">
              {t('rec.note', {
                total: fmtNumber(r.resultat.total),
                mention: t(`hifz.mention_${r.resultat.mention}`),
                coran: fmtNumber(r.resultat.coran15),
              })}
            </p>
          {/if}
        {:else}
          <p class="muted">{t('rec.a_venir')}</p>
        {/if}
      </li>
    {:else}
      <li class="muted">{t('rec.aucun_famille')}</li>
    {/each}
  </ul>
{/if}

<style>
  .star {
    font-weight: 600;
  }
  .star span {
    color: var(--accent);
    font-size: 1.4rem;
  }
</style>
