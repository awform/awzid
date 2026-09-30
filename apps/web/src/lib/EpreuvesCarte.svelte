<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { fmtDate, fmtNumber, t } from '$lib/i18n';
  import type { EpreuveFamille } from '$lib/epreuves';
  import { call } from '$lib/session';

  /**
   * Épreuves de la classe (lot 19) sur « Aujourd'hui » : épreuve ouverte à passer, copie envoyée, note (à la
   * fermeture de la session) et, sous 8/20, les leçons à revoir — dit simplement, sans classement.
   */
  let { profileId }: { profileId: string } = $props();
  let list = $state<EpreuveFamille[]>([]);
  onMount(async () => {
    const r = await call<{ epreuves: EpreuveFamille[] }>('GET', `/profiles/${profileId}/epreuves`);
    list = r.ok ? (r.data?.epreuves ?? []).filter((e) => e.etat !== 'fermee') : [];
  });
</script>

{#if list.length}
  <section class="card" data-testid="epreuves">
    <h2>{t('epreuve.titre')}</h2>
    <ul>
      {#each list as e (e.id)}
        <li data-etat={e.etat}>
          <strong>{e.titleFr ?? e.unitId}</strong>
          {#if e.etat === 'ouverte'}
            <span class="muted small">· {t('epreuve.jusqu_au', { date: fmtDate(e.closesAt) })}</span
            >
            <a class="button" href={resolve('/epreuves/[sid]', { sid: e.id })}
              >{t('epreuve.passer')}</a
            >
          {:else if e.etat === 'a_venir'}
            <span class="muted small"
              >· {t('epreuve.a_partir_du', { date: fmtDate(e.opensAt) })}</span
            >
          {:else if e.etat === 'envoyee'}
            <span class="muted small">· {t('epreuve.envoyee')}</span>
          {:else if e.etat === 'notee' && e.score !== null}
            <span data-testid="note"
              >· {t('epreuve.note', { note: fmtNumber(e.score), bareme: e.bareme })}</span
            >
            {#if e.remediation}
              <p class="small">{t('epreuve.a_revoir')}</p>
              <ul class="revoir">
                {#each e.aRevoir as l (l.id)}<li>
                    <a href={resolve('/lecons/[id]', { id: l.id })}>{l.titleFr}</a>
                  </li>{/each}
              </ul>
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  ul {
    display: grid;
    gap: 8px;
    padding-inline-start: 1.2em;
  }
  .small {
    font-size: 0.9rem;
    margin: 4px 0;
  }
  .revoir {
    padding-inline-start: 1.2em;
  }
</style>
