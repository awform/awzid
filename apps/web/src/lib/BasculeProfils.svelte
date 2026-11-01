<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { setActiveProfile, type DevProfile } from '$lib/attempts';
  import { t } from '$lib/i18n';
  import { call, type Me } from '$lib/session';
  import Sym from '$lib/Sym.svelte';
  import { fautCodeParent, profilsAffiches } from './bascule';

  /**
   * V2-4 : bascule Moi / enfants en un toucher. Feuille en bas de l'écran sur mobile, colonne à gauche sur ordinateur
   * (même composant, mise en forme par la largeur). Chargé à la demande (jamais dans la coquille de l'élève).
   * Règles inchangées : si le parent a un code parent et que le profil actif est celui d'un enfant ou d'un ado, il le
   * saisit avant de changer de profil (retour à l'espace parent compris) ; sans code parent, le changement est libre.
   * Le profil « Moi » apprend en adulte (type `adulte`).
   */
  let { me, actif, onferme }: { me: Me; actif: DevProfile | null; onferme: () => void } = $props();

  const profils = $derived(profilsAffiches(me.profiles));
  const aMoi = $derived(me.profiles.some((p) => p.isOwner));
  let cible = $state<DevProfile | null>(null);
  let pin = $state('');
  let erreur = $state('');
  let boite: HTMLDivElement | undefined = $state();

  onMount(() => {
    boite?.querySelector<HTMLElement>('button')?.focus();
  });

  function toucher(p: DevProfile) {
    if (actif?.id === p.id) return onferme();
    if (fautCodeParent(me.account.hasPin, actif)) {
      cible = p;
      erreur = '';
      return;
    }
    void changer(p);
  }

  async function changer(p: DevProfile) {
    await setActiveProfile(p);
    onferme();
    await goto(resolve('/'), { invalidateAll: true });
  }

  async function verifier(e: SubmitEvent) {
    e.preventDefault();
    const r = await call('POST', '/account/pin/verify', { pin });
    if (r.ok && cible) await changer(cible);
    else {
      erreur = t(`erreur.${r.code ?? 'reseau'}`);
      pin = '';
    }
  }

  function touche(e: KeyboardEvent) {
    if (e.key === 'Escape') return onferme();
    if (e.key !== 'Tab' || !boite) return;
    const f = [...boite.querySelectorAll<HTMLElement>('button, a[href], input')].filter(
      (x) => !x.hasAttribute('disabled'),
    );
    if (!f.length) return;
    const premier = f[0]!;
    const dernier = f[f.length - 1]!;
    if (e.shiftKey && document.activeElement === premier) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault();
      premier.focus();
    }
  }
</script>

<svelte:window onkeydown={touche} />

<button type="button" class="voile" tabindex="-1" aria-label={t('bascule.fermer')} onclick={onferme}
></button>
<div
  class="bascule"
  role="dialog"
  aria-modal="true"
  aria-labelledby="bascule-titre"
  data-testid="bascule"
  bind:this={boite}
>
  <span class="poignee" aria-hidden="true"></span>
  <p class="etiq" id="bascule-titre"><Bidi text={t('bascule.titre')} /></p>
  {#if cible}
    <form class="pin" onsubmit={verifier}>
      <label for="bascule-pin"
        ><Bidi text={t('bascule.code_parent', { nom: cible.pseudonym })} /></label
      >
      <input
        id="bascule-pin"
        inputmode="numeric"
        pattern={'[0-9]{4}'}
        maxlength="4"
        autocomplete="off"
        bind:value={pin}
        data-testid="bascule-pin"
      />
      {#if erreur}<p class="erreur" role="alert"><Bidi text={erreur} /></p>{/if}
      <button type="submit" class="primary" data-testid="bascule-valider"
        ><Bidi text={t('commun.valider')} /></button
      >
    </form>
  {:else}
    <ul>
      {#each profils as p (p.id)}
        <li>
          <button
            type="button"
            class="ligne"
            class:on={actif?.id === p.id}
            aria-current={actif?.id === p.id ? 'true' : undefined}
            onclick={() => toucher(p)}
            data-profile={p.id}
            data-testid={p.isOwner ? 'bascule-moi' : 'bascule-enfant'}
          >
            <Sym id={p.avatar ?? 'etoile'} size={36} />
            <span class="nom"
              ><strong><Bidi text={p.isOwner ? t('bascule.moi') : p.pseudonym} /></strong></span
            >
            {#if actif?.id === p.id}<span class="coche" aria-hidden="true">✓</span>{/if}
          </button>
        </li>
      {/each}
      <li>
        <a class="ligne" href={resolve('/profils')} onclick={onferme} data-testid="bascule-ajouter">
          <span class="plus" aria-hidden="true">+</span>
          <span class="nom"
            ><strong
              ><Bidi text={t(aMoi ? 'bascule.ajouter_enfant' : 'bascule.mon_espace')} /></strong
            ></span
          >
        </a>
      </li>
    </ul>
    {#if !aMoi}<p class="petit"><Bidi text={t('bascule.aide_mon_espace')} /></p>{/if}
  {/if}
</div>

<style>
  .voile {
    position: fixed;
    inset: 0;
    z-index: 60;
    border: 0;
    border-radius: 0;
    background: color-mix(in srgb, var(--ink) 40%, transparent);
    cursor: default;
  }
  .bascule {
    position: fixed;
    z-index: 61;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 80vh;
    overflow-y: auto;
    padding: var(--space-m) var(--space-l) max(var(--space-l), env(safe-area-inset-bottom));
    background: var(--card);
    border-top: 1px solid var(--line);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    box-shadow: var(--shadow-float);
  }
  .poignee {
    display: block;
    width: 40px;
    height: 4px;
    margin: 0 auto 10px;
    border-radius: 2px;
    background: var(--line);
  }
  .etiq {
    margin: 0 0 8px;
    font-weight: 700;
  }
  ul {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ligne {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 56px;
    padding: 8px 12px;
    border: 2px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--card);
    color: inherit;
    text-align: start;
    text-decoration: none;
    font: inherit;
  }
  .ligne.on {
    border-color: var(--primary);
  }
  .nom {
    flex: 1;
  }
  .coche {
    color: var(--primary);
    font-weight: 700;
  }
  .plus {
    display: grid;
    place-items: center;
    width: 36px;
    font-size: 1.5rem;
    color: var(--primary);
  }
  .petit {
    margin: 10px 0 0;
    font-size: 0.85rem;
    color: var(--ink2);
  }
  .pin {
    display: grid;
    gap: 8px;
  }
  .pin input {
    font: inherit;
    min-height: 48px;
    padding: 6px 10px;
    border: 2px solid var(--line);
    border-radius: 10px;
  }
  .erreur {
    margin: 0;
    color: var(--bad-ink);
    font-weight: 700;
  }
  /* ordinateur : une colonne à gauche, sous l'en-tête */
  @media (min-width: 900px) {
    .voile {
      background: transparent;
    }
    .bascule {
      top: 64px;
      right: auto;
      width: 300px;
      max-height: none;
      border: 0;
      border-inline-end: 1px solid var(--line);
      border-radius: 0;
      padding-bottom: var(--space-l);
    }
    .poignee {
      display: none;
    }
  }
</style>
