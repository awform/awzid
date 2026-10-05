<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { askPosition, type GeoError } from './lieu';
  import type { Place } from './reglages';
  import { CITIES, COUNTRIES } from './villes';

  /**
   * A12 — choix du lieu : une ville de la liste intégrée (aucun service externe), ou la position de l'appareil
   * APRÈS un accord explicite (bouton + autorisation du navigateur). La position reste sur l'appareil.
   */
  let { onchange }: { onchange: (p: Place) => void } = $props();
  let city = $state('');
  let asking = $state(false);
  let consent = $state(false);
  let error = $state<GeoError | null>(null);

  const groups = COUNTRIES.map((c) => ({ c, cities: CITIES.filter((x) => x.country === c) }));

  async function locate() {
    error = null;
    asking = true;
    try {
      onchange(await askPosition());
    } catch (e) {
      error = e as GeoError;
    } finally {
      asking = false;
    }
  }
</script>

<section class="card lieu" data-testid="qt-lieu-choix" aria-labelledby="qt-lieu-titre">
  <h2 id="qt-lieu-titre"><Icon name="lieu" size={22} /> {t('qt.lieu_titre')}</h2>
  <p class="muted">{t('qt.lieu_intro')}</p>
  <form
    class="pick"
    onsubmit={(e) => {
      e.preventDefault();
      if (city) onchange({ kind: 'ville', id: city });
    }}
  >
    <label class="field">
      <span>{t('qt.lieu_ville')}</span>
      <select bind:value={city} data-testid="qt-ville" required>
        <option value="" disabled>{t('qt.lieu_ville_choisir')}</option>
        {#each groups as g (g.c)}
          <optgroup label={t(`qt.pays_${g.c}`)}>
            {#each g.cities as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
          </optgroup>
        {/each}
      </select>
    </label>
    <button type="submit" class="primary" disabled={!city} data-testid="qt-ville-ok"
      >{t('qt.lieu_valider')}</button
    >
  </form>

  <div class="ou"><span>{t('qt.ou')}</span></div>

  {#if !consent}
    <button type="button" class="button" onclick={() => (consent = true)} data-testid="qt-geo">
      <Icon name="boussole" size={20} />{t('qt.geo_bouton')}
    </button>
  {:else}
    <div class="consent" data-testid="qt-geo-accord">
      <p><Icon name="bouclier" size={18} /> <span>{t('qt.geo_accord')}</span></p>
      <div class="actions">
        <button
          type="button"
          class="primary"
          onclick={locate}
          disabled={asking}
          data-testid="qt-geo-ok">{t('qt.geo_accepter')}</button
        >
        <button type="button" class="ghost" onclick={() => (consent = false)}
          >{t('qt.geo_refuser')}</button
        >
      </div>
    </div>
  {/if}
  {#if error}<p class="warnbox" role="alert"><Bidi text={t(`qt.geo_${error}`)} /></p>{/if}
</section>

<style>
  .lieu h2 {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pick {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    align-items: end;
  }
  .field {
    display: grid;
    gap: 4px;
  }
  select {
    min-height: 48px;
    width: 100%;
  }
  .ou {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: var(--space-m) 0;
    color: var(--ink2);
    font-size: 0.9rem;
  }
  .ou::before,
  .ou::after {
    content: '';
    flex: 1;
    border-top: 1px solid var(--line);
  }
  .consent {
    padding: var(--space-s) var(--space-m);
    border-radius: var(--radius-md);
    background: var(--info-bg);
    color: var(--info);
  }
  .consent p {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    margin: 0 0 8px;
    font-weight: 600;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  @media (max-width: 480px) {
    .pick {
      grid-template-columns: 1fr;
    }
  }
</style>
