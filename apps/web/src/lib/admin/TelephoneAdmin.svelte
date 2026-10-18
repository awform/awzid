<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { fmtDate, t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * Numéros en attente de VALIDATION MANUELLE (bêta, gratuite, sans Meta — AWFORM_TELEPHONE_MANUEL) : la personne a
   * envoyé « AWZID <code> » au WhatsApp Business d'Awzid ; l'administrateur compare le numéro (masqué sauf les 4
   * derniers chiffres) et le code reçus avec cette liste, puis valide ou refuse (journal d'audit). Expiration : 48 h.
   */
  interface Attente {
    id: string;
    numero: string | null;
    code: string | null;
    objet: string;
    creeLe: string;
    expireLe: string;
  }
  let manuel = $state(false);
  let numeros = $state<Attente[]>([]);
  async function charger() {
    const r = await call<{ manuel: boolean; numeros: Attente[] }>(
      'GET',
      '/admin/telephone/attente',
    );
    manuel = !!r.data?.manuel;
    numeros = r.data?.numeros ?? [];
  }
  onMount(charger);
  async function decider(id: string, d: 'valider' | 'refuser') {
    await call('POST', `/admin/telephone/attente/${id}/${d}`, {});
    await charger();
  }
</script>

{#if manuel}
  <h3 data-testid="tel-attente-titre">
    <Bidi text={t('tel.adm_titre')} />
    <span class="muted">· <Bidi text={t('tel.adm_n', { n: numeros.length })} /></span>
  </h3>
  <p class="muted"><Bidi text={t('tel.adm_aide')} /></p>
  <ul class="stack" data-testid="tel-attente">
    {#each numeros as n (n.id)}
      <li class="card" data-testid="tel-attente-ligne">
        <p>
          <strong dir="ltr"><Bidi text={n.numero ?? ''} /></strong> ·
          <Bidi text={t('tel.adm_code')} />
          <code dir="ltr" data-testid="tel-attente-code"><Bidi text={n.code ?? ''} /></code>
          · <span class="muted"><Bidi text={t(`tel.adm_objet_${n.objet}`)} /></span>
        </p>
        <p class="muted small">
          <Bidi
            text={t('tel.adm_dates', { cree: fmtDate(n.creeLe), expire: fmtDate(n.expireLe) })}
          />
        </p>
        <p>
          <button
            type="button"
            class="primary"
            onclick={() => decider(n.id, 'valider')}
            data-testid="tel-valider"><Bidi text={t('tel.adm_valider')} /></button
          >
          <button type="button" class="ghost" onclick={() => decider(n.id, 'refuser')}
            ><Bidi text={t('tel.adm_refuser')} /></button
          >
        </p>
      </li>
    {:else}
      <li class="muted"><Bidi text={t('tel.adm_aucun')} /></li>
    {/each}
  </ul>
{/if}

<style>
  .small {
    font-size: 0.9rem;
  }
  button {
    min-height: 44px;
  }
</style>
