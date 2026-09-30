<script lang="ts">
  import { onMount } from 'svelte';
  import { suraName } from '@awform/hifz';
  import { t } from '$lib/i18n';
  import { classSuras, validateSura, type SuraRow } from '$lib/carnet';

  /** Suivi des sourates de la classe (lot 22) : l'enseignant valide après avoir écouté l'élève. */
  let { classId }: { classId: string } = $props();
  let eleves = $state<Array<{ profileId: string; pseudonym: string; suivi: SuraRow[] }>>([]);
  let error = $state('');

  async function load() {
    const r = await classSuras(classId);
    eleves = r.ok && r.data ? r.data.eleves : [];
  }
  onMount(load);
  async function valider(profileId: string, sura: number) {
    error = '';
    const r = await validateSura(classId, profileId, sura);
    if (!r.ok) error = t(`erreur.${r.code ?? 'reseau'}`);
    await load();
  }
</script>

{#if error}<p class="card bad" role="alert">{error}</p>{/if}
{#each eleves as e (e.profileId)}
  <section class="card">
    <h2>{e.pseudonym}</h2>
    <ul class="list">
      {#each e.suivi as s (s.sura)}
        <li data-testid="sourate-eleve">
          <span lang="ar" dir="rtl">{suraName(s.sura)}</span> —
          {s.etape ? t(`sour.${s.etape}`) : t('sour.pas_commence')}
          {#if s.etape !== 'valide'}
            <button type="button" onclick={() => valider(e.profileId, s.sura)}
              >{t('sour.valider')}</button
            >
          {/if}
        </li>
      {:else}<li class="muted">{t('sour.aucune')}</li>{/each}
    </ul>
  </section>
{:else}
  <p class="muted">{t('sour.aucun_eleve')}</p>
{/each}
