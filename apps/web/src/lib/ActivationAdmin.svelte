<script lang="ts">
  import { onMount } from 'svelte';
  import { fmtDate, t } from '$lib/i18n';
  import { createLot, listLots, printerCsv, revokeLot, type Lot } from '$lib/activation';

  /**
   * Administration des codes d'activation (lot 23) : un lot par niveau ; les codes en clair ne sont donnés
   * qu'une fois, dans le fichier pour l'imprimeur (le serveur n'en garde que l'empreinte).
   */
  let lots = $state<Lot[]>([]);
  let f = $state({ niveau: 'en1', quantite: 100, mois: 12, libelle: '' });
  let error = $state('');
  let lastFile = $state('');

  async function load() {
    const r = await listLots();
    lots = r.ok && r.data ? r.data.lots : [];
  }
  onMount(load);

  async function create(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    const r = await createLot(f);
    if (!r.ok || !r.data) {
      error = t(`erreur.${r.code ?? 'reseau'}`);
      return;
    }
    const blob = new Blob([printerCsv(f.niveau, f.mois, r.data.codes)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    lastFile = a.download = `codes-${f.niveau}-${r.data.lot.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    await load();
  }
  async function revoke(id: string) {
    if (!confirm(t('act.revoquer_confirmer'))) return;
    await revokeLot(id);
    await load();
  }
</script>

<section class="card">
  <h2>{t('act.admin_titre')}</h2>
  <p class="muted small">{t('act.admin_aide')}</p>
  <form onsubmit={create}>
    <label for="an">{t('act.niveau')}</label>
    <input id="an" bind:value={f.niveau} required />
    <label for="aq">{t('act.quantite')}</label>
    <input id="aq" type="number" min="1" max="5000" bind:value={f.quantite} />
    <label for="am">{t('act.mois')}</label>
    <input id="am" type="number" min="1" max="24" bind:value={f.mois} />
    <label for="al">{t('act.libelle')}</label>
    <input id="al" bind:value={f.libelle} maxlength="120" required />
    <button type="submit" class="primary" data-testid="lot-creer">{t('act.generer')}</button>
  </form>
  {#if lastFile}<p class="ok" role="status">{t('act.fichier', { nom: lastFile })}</p>{/if}
  {#if error}<p class="bad" role="alert">{error}</p>{/if}
  <ul class="list">
    {#each lots as l (l.id)}
      <li>
        {fmtDate(l.creeLe)} — {l.libelle} ({l.niveau}) : {t('act.stats', {
          n: l.quantite,
          u: l.utilises,
          r: l.revoques,
        })}
        {#if l.utilises + l.revoques < l.quantite}
          <button type="button" onclick={() => revoke(l.id)}>{t('act.revoquer')}</button>
        {/if}
      </li>
    {/each}
  </ul>
</section>
