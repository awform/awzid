<script lang="ts">
  import { localeInfo, t } from '$lib/i18n';
  import RiwayaBadge from './RiwayaBadge.svelte';
  import { mushafChoice, MUSHAF_RIWAYAT, type MushafRiwaya } from './riwayat';

  /**
   * A8 — choix du muṣḥaf affiché (Lire, Écouter) : la riwāya est TOUJOURS écrite en clair, badge marqué hors
   * Ḥafṣ. Ḥafṣ par défaut ; le choix est commun aux onglets (gardé sur l'appareil par la page).
   */
  let {
    value,
    onchange,
    id = 'choix-mushaf',
  }: { value: MushafRiwaya; onchange: (m: MushafRiwaya) => void; id?: string } = $props();
</script>

<div class="rwpick" data-testid="choix-mushaf-bloc">
  <label for={id}>{t('rw.mushaf_affiche')}</label>
  <select
    {id}
    {value}
    onchange={(e) => onchange(e.currentTarget.value as MushafRiwaya)}
    data-testid="choix-mushaf"
  >
    {#each MUSHAF_RIWAYAT as m (m.key)}<option value={m.key}
        >{localeInfo().code === 'ar' ? m.ar : m.fr}</option
      >{/each}
  </select>
  <RiwayaBadge riwaya={value} label={mushafChoice(value).fr} />
</div>

<style>
  .rwpick {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    margin: 4px 0 8px;
  }
  select {
    font: inherit;
    min-height: var(--target);
    max-width: 100%;
  }
</style>
