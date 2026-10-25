<script lang="ts">
  import { onMount } from 'svelte';
  import { suraName } from '@awform/hifz';
  import Bidi from '$lib/Bidi.svelte';
  import { fmtDate, t } from '$lib/i18n';
  import { creerSeance, eleves, portionDe, total, type ElevesEtat } from './donnees';
  import Seance from './Seance.svelte';

  /**
   * Hifẓ en classe (espace enseignant, interrupteur `hifz_classe`) :
   *  - « En direct » : l'élève récite devant le maître, qui coche les erreurs mot par mot sur sa tablette ; AUCUN enregistrement
   *    (c'est le mode des enfants) ;
   *  - « Enregistrements » : récitations envoyées par des ADULTES consentants ; le maître les écoute et les annote plus tard
   *    (effacées automatiquement à l'échéance, 30 jours au plus) ;
   *  - « Séances » : l'historique ; le maître valide la portion, les parents voient le suivi.
   */
  let { classId }: { classId: string } = $props();
  let etat = $state<ElevesEtat | null>(null);
  let onglet = $state<'direct' | 'enregistrements' | 'seances'>('direct');
  let actif = $state<string | null>(null);
  let eleve = $state('');
  let sura = $state(112);
  let de = $state(1);
  let a = $state(4);
  let erreur = $state('');

  async function recharger() {
    const r = await eleves(classId);
    if (r.ok && r.data) {
      etat = r.data;
      eleve ||= r.data.eleves[0]?.id ?? '';
    } else erreur = t('hc.erreur');
  }
  onMount(recharger);

  async function commencer(e: SubmitEvent) {
    e.preventDefault();
    erreur = '';
    if (!eleve) return;
    const r = await creerSeance(classId, {
      profileId: eleve,
      mode: 'direct',
      sura,
      from: de,
      to: a,
    });
    if (r.ok && r.data) actif = r.data.seance.id;
    else erreur = t(r.code === 'portion_trop_longue' ? 'hc.portion_longue' : 'hc.portion_invalide');
  }
  async function annoter(rec: NonNullable<ElevesEtat['enregistrements']>[number]) {
    erreur = '';
    const p = portionDe(rec.part);
    if (!p) return void (erreur = t('hc.portion_invalide'));
    const r = await creerSeance(classId, {
      profileId: rec.profileId,
      mode: 'enregistrement',
      sura: p.s,
      from: p.from,
      to: p.to,
      recitationId: rec.id,
    });
    if (r.ok && r.data) actif = r.data.seance.id;
    else erreur = t('hc.erreur');
  }
  async function retour() {
    actif = null;
    await recharger();
  }
  const issue = (o: string | null) => (o ? t(`hc.issue_${o}`) : t('hc.en_cours'));
</script>

<section class="card" aria-labelledby="hc-titre" data-testid="hifz-classe">
  <h2 id="hc-titre">{t('hc.titre')}</h2>
  {#if actif}
    <Seance sid={actif} fini={retour} />
  {:else if etat}
    <div class="onglets" role="tablist">
      {#each ['direct', 'enregistrements', 'seances'] as o (o)}
        <button
          type="button"
          role="tab"
          aria-selected={onglet === o}
          class:actif={onglet === o}
          onclick={() => (onglet = o as typeof onglet)}
          data-testid={`hc-onglet-${o}`}><Bidi text={t(`hc.onglet_${o}`)} /></button
        >
      {/each}
    </div>
    {#if onglet === 'direct'}
      <p class="muted petit"><Bidi text={t('hc.direct_intro')} /></p>
      <form class="form" onsubmit={commencer} data-testid="hc-direct">
        <label
          >{t('hc.eleve')}
          <select bind:value={eleve} data-testid="hc-eleve">
            {#each etat.eleves as e (e.id)}<option value={e.id}>{e.pseudonym}</option>{/each}
          </select></label
        >
        <label
          >{t('hc.sourate')}
          <select bind:value={sura} data-testid="hc-sourate">
            {#each Array.from({ length: 114 }, (_, i) => i + 1) as s (s)}<option value={s}
                >{s} · {suraName(s)}</option
              >{/each}
          </select></label
        >
        <div class="ligne">
          <label
            >{t('hc.du_verset')}
            <input type="number" min="1" max="286" bind:value={de} data-testid="hc-de" /></label
          >
          <label
            >{t('hc.au_verset')}
            <input type="number" min="1" max="286" bind:value={a} data-testid="hc-a" /></label
          >
        </div>
        <button
          type="submit"
          class="primary"
          disabled={!etat.eleves.length}
          data-testid="hc-commencer">{t('hc.commencer')}</button
        >
      </form>
    {:else if onglet === 'enregistrements'}
      <p class="muted petit"><Bidi text={t('hc.enreg_intro')} /></p>
      <ul class="liste" data-testid="hc-enregistrements">
        {#each etat.enregistrements as r (r.id)}
          <li>
            <span
              ><Bidi text={r.pseudonym} /> · <Bidi text={r.part} /> · {fmtDate(r.createdAt, {
                dateStyle: 'medium',
              })}</span
            >
            <small class="muted"
              ><Bidi
                text={t('hc.efface_le', { date: fmtDate(r.expiresAt, { dateStyle: 'medium' }) })}
              /></small
            >
            {#if r.annotee}<small data-testid="hc-annotee">{t('hc.annotee')}</small>{/if}
            <button type="button" onclick={() => annoter(r)} data-testid="hc-annoter"
              >{t('hc.annoter')}</button
            >
          </li>
        {:else}
          <li class="muted">{t('hc.aucun_enreg')}</li>
        {/each}
      </ul>
    {:else}
      <ul class="liste" data-testid="hc-seances">
        {#each etat.seances as s (s.id)}
          <li data-seance={s.id}>
            <span
              ><Bidi text={s.pseudonym} /> · <Bidi
                text={`${suraName(s.sura)} ${s.sura}:${s.from}${s.to !== s.from ? `-${s.to}` : ''}`}
              /></span
            >
            <small class="muted"
              ><Bidi text={t(`hc.mode_${s.mode}`)} /> · <Bidi text={issue(s.outcome)} /> · <Bidi
                text={t('hc.erreurs_n', {
                  n: total(s.erreurs),
                })}
              /> ·
              {fmtDate(s.createdAt, { dateStyle: 'medium' })}</small
            >
            {#if s.status === 'en_cours'}<button type="button" onclick={() => (actif = s.id)}
                >{t('hc.reprendre')}</button
              >{/if}
          </li>
        {:else}
          <li class="muted">{t('hc.aucune_seance')}</li>
        {/each}
      </ul>
    {/if}
  {/if}
  {#if erreur}<p class="bad" role="alert"><Bidi text={erreur} /></p>{/if}
</section>

<style>
  h2 {
    margin: 0 0 6px;
    font-size: 1.1rem;
  }
  .onglets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 6px 0;
  }
  .onglets button {
    min-height: 44px;
  }
  .onglets button.actif {
    background: var(--primary);
    color: var(--on-primary);
  }
  .form {
    display: grid;
    gap: 10px;
  }
  .ligne {
    display: flex;
    gap: 12px;
  }
  label {
    display: grid;
    gap: 4px;
  }
  select,
  input {
    font: inherit;
    min-height: 44px;
  }
  .form button {
    min-height: 48px;
  }
  .liste {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .liste li {
    display: grid;
    gap: 4px;
    padding: 8px 0;
    border-top: 1px solid var(--line);
  }
  .liste button {
    justify-self: start;
    min-height: 44px;
  }
  .petit {
    margin: 0;
    font-size: 0.9rem;
  }
  .bad {
    color: var(--bad-ink);
  }
</style>
