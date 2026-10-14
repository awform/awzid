<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { fmtDate, t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * Lot 6 — groupe « bêta fermée » (administrateur, second facteur) : ses membres voient tout le contenu différé de
   * Madjaliss (séances de croyance d'Ibn ʿĀshir, Risāla complète, vers non confirmés de la Lāmiyya) avec le bandeau
   * « Contenu en relecture : ne pas diffuser », tant que l'interrupteur `beta_contenu_differe_visible` est allumé.
   * Ajout par l'adresse du compte, retrait en un clic (le droit est perdu à la requête suivante) ; chaque changement
   * est journalisé. Une invitation peut aussi inscrire dans le groupe (case du formulaire d'invitation).
   */
  interface Membre {
    id: string;
    adresse: string | null;
    depuis: string;
  }
  let membres = $state<Membre[]>([]);
  let adresse = $state('');
  let erreur = $state('');

  async function charger() {
    const r = await call<{ membres: Membre[] }>('GET', '/admin/groupe-beta');
    membres = r.ok && r.data ? r.data.membres : [];
  }
  onMount(charger);

  async function ajouter(e: SubmitEvent) {
    e.preventDefault();
    erreur = '';
    const r = await call('POST', '/admin/groupe-beta', { adresse: adresse.trim() });
    if (!r.ok) {
      erreur = r.code === 'compte_inconnu' ? t('gb.compte_inconnu') : t('gb.erreur');
      return;
    }
    adresse = '';
    await charger();
  }
  async function retirer(id: string) {
    await call('DELETE', `/admin/groupe-beta/${id}`);
    await charger();
  }
</script>

<h3><Bidi text={t('gb.titre')} /></h3>
<p class="muted"><Bidi text={t('gb.intro')} /></p>
<form class="ajout" onsubmit={ajouter}>
  <label for="gb-adresse"><Bidi text={t('gb.adresse')} /></label>
  <input
    id="gb-adresse"
    type="email"
    maxlength="254"
    required
    bind:value={adresse}
    data-testid="gb-adresse"
  />
  <button type="submit" class="primary" data-testid="gb-ajouter"
    ><Bidi text={t('gb.ajouter')} /></button
  >
</form>
{#if erreur}<p class="error" role="alert" data-testid="gb-erreur"><Bidi text={erreur} /></p>{/if}
<ul class="stack" data-testid="gb-liste">
  {#each membres as m (m.id)}
    <li class="card" data-testid="gb-membre">
      <p>
        <strong><Bidi text={m.adresse ?? '—'} /></strong>
        · <span class="muted">{fmtDate(m.depuis)}</span>
      </p>
      <button type="button" class="ghost" onclick={() => retirer(m.id)} data-testid="gb-retirer"
        ><Bidi text={t('gb.retirer')} /></button
      >
    </li>
  {:else}
    <li class="muted"><Bidi text={t('gb.aucun')} /></li>
  {/each}
</ul>

<style>
  .ajout {
    display: grid;
    gap: 8px;
    max-width: 520px;
  }
  .ajout input {
    font: inherit;
    min-height: 44px;
    padding: 6px 10px;
    border: 2px solid var(--line);
    border-radius: 10px;
  }
  .stack {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 8px;
  }
</style>
