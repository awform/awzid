<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { fmtDate, t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * Blocage d'un compte, UN PAR UN (administrateur, second facteur) : l'e-mail ou le numéro saisi désigne le compte ;
   * « Bloquer » ferme ses sessions et l'empêche de se connecter, « Débloquer » le rétablit ; rien n'est effacé et
   * l'action est notée au journal d'audit. Le message du résultat s'affiche À CÔTÉ des boutons ; la liste des comptes
   * bloqués (contact masqué) est dessous.
   */
  interface Bloque {
    id: string;
    kind: string;
    contact: string | null;
    bloqueLe: string;
  }
  let identifiant = $state('');
  let message = $state('');
  let erreur = $state(false);
  let occupe = $state(false);
  let visible = $state(true);
  let liste = $state<Bloque[]>([]);

  async function charger() {
    const r = await call<{ comptes: Bloque[] }>('GET', '/admin/comptes/bloques');
    // réservé à l'administrateur : le support ne voit pas ce bloc
    visible = r.ok;
    liste = r.data?.comptes ?? [];
  }
  onMount(charger);

  async function agir(bloquer: boolean) {
    erreur = true;
    if (!identifiant.trim()) {
      message = t('adm.blocage_vide');
      return;
    }
    occupe = true;
    const r = await call<{ change: boolean; bloque: boolean }>('POST', '/admin/comptes/blocage', {
      identifiant: identifiant.trim(),
      bloquer,
    });
    occupe = false;
    if (r.ok) {
      erreur = false;
      message = r.data?.change
        ? t(bloquer ? 'adm.blocage_ok_bloque' : 'adm.blocage_ok_debloque')
        : t(bloquer ? 'adm.blocage_deja_bloque' : 'adm.blocage_deja_actif');
      await charger();
    } else {
      message =
        r.code === 'introuvable'
          ? t('adm.blocage_introuvable')
          : r.code === 'pas_soi_meme'
            ? t('adm.blocage_soi')
            : t('adm.blocage_erreur');
    }
  }
</script>

{#if visible}
  <section class="card" data-testid="blocage">
    <h2 id="t-blocage"><Bidi text={t('adm.blocage_titre')} /></h2>
    <p class="muted small"><Bidi text={t('adm.blocage_aide')} /></p>
    <label class="champ">
      <span><Bidi text={t('adm.blocage_champ')} /></span>
      <input
        type="text"
        dir="ltr"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        bind:value={identifiant}
        data-testid="blocage-id"
      />
    </label>
    <div class="actions">
      <button
        type="button"
        class="primary"
        disabled={occupe}
        onclick={() => agir(true)}
        data-testid="blocage-bloquer"><Bidi text={t('adm.blocage_bloquer')} /></button
      >
      <button
        type="button"
        class="ghost"
        disabled={occupe}
        onclick={() => agir(false)}
        data-testid="blocage-debloquer"><Bidi text={t('adm.blocage_debloquer')} /></button
      >
      <span
        class="msg"
        class:warn={erreur}
        role="status"
        aria-live="polite"
        data-testid="blocage-message"
      >
        {#if message}<Bidi text={message} />{/if}
      </span>
    </div>
    <h3 id="t-blocage-liste">
      <Bidi text={t('adm.blocage_liste')} /> · <Bidi text={liste.length} />
    </h3>
    <ul class="stack small" aria-labelledby="t-blocage-liste" data-testid="blocage-liste">
      {#each liste as c (c.id)}
        <li data-testid="blocage-ligne">
          <strong dir="ltr"><Bidi text={c.contact ?? ''} /></strong> ·
          <span class="muted"
            ><Bidi text={t('adm.blocage_depuis', { date: fmtDate(c.bloqueLe) })} /></span
          >
        </li>
      {:else}
        <li class="muted"><Bidi text={t('adm.blocage_aucun')} /></li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .small {
    font-size: 0.9rem;
  }
  .champ {
    display: grid;
    gap: 4px;
    margin-block: 8px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .msg {
    flex: 1 1 14rem;
  }
  .warn {
    color: var(--danger, #b3261e);
  }
  button {
    min-height: 44px;
  }
</style>
