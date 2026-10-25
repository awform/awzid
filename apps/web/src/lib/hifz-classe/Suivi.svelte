<script lang="ts">
  import { onMount } from 'svelte';
  import { suraName } from '@awform/hifz';
  import Bidi from '$lib/Bidi.svelte';
  import { fmtDate, t } from '$lib/i18n';
  import { suiviFamille, total, type SeanceVue } from './donnees';

  /**
   * Suivi du hifẓ en classe pour la FAMILLE (parents et élève adulte) : pour chaque séance terminée, la portion, le mode, l'issue
   * (validée ou à reprendre), le nombre d'erreurs par type et la remarque du maître. Jamais un enregistrement, jamais de note
   * chiffrée : des repères pour aider à la maison.
   */
  let { profileId }: { profileId: string } = $props();
  let seances = $state<SeanceVue[] | null>(null);
  onMount(async () => {
    const r = await suiviFamille(profileId);
    seances = r.ok && r.data ? r.data.seances : [];
  });
</script>

{#if seances && seances.length}
  <section class="suivi" aria-labelledby={`hc-suivi-${profileId}`} data-testid="hc-suivi">
    <h3 id={`hc-suivi-${profileId}`}>{t('hc.suivi_titre')}</h3>
    <ul>
      {#each seances as s (s.id)}
        <li data-testid="hc-suivi-seance" data-issue={s.outcome}>
          <strong
            ><Bidi
              text={`${suraName(s.sura)} ${s.sura}:${s.from}${s.to !== s.from ? `-${s.to}` : ''}`}
            /></strong
          >
          <span class="muted">
            {fmtDate(s.finishedAt ?? s.createdAt, { dateStyle: 'medium' })} · <Bidi
              text={t(`hc.mode_${s.mode}`)}
            /> ·
            <Bidi text={s.outcome ? t(`hc.issue_${s.outcome}`) : t('hc.en_cours')} />
          </span>
          {#if total(s.erreurs)}
            <span class="petit"
              ><Bidi
                text={t('hc.suivi_erreurs', {
                  oubli: s.erreurs.oubli,
                  ajout: s.erreurs.ajout,
                  changement: s.erreurs.changement,
                  tajwid: s.erreurs.tajwid,
                })}
              /></span
            >
          {:else}<span class="petit">{t('hc.suivi_sans_erreur')}</span>{/if}
          {#if s.remark}<q class="petit"><Bidi text={s.remark} /></q>{/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .suivi {
    display: grid;
    gap: 6px;
  }
  h3 {
    margin: 0;
    font-size: 1.05rem;
  }
  ul {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    gap: 2px;
    padding: 6px 0;
    border-top: 1px solid var(--line);
  }
  .petit {
    font-size: 0.9rem;
  }
</style>
