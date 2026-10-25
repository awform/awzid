<script lang="ts">
  import { onMount } from 'svelte';
  import { tanwinDisplay } from '@awform/content/text';
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import {
    chargerTajwid,
    ciblesDe,
    demanderMadd,
    type Cible,
    type CiblesVerset,
    type Indication,
  } from './cibles';

  /**
   * Indication des MADD LONGS d'un verset (interrupteur `tajwid_madd`, adultes, bêta fermée), chargée à la demande depuis le panneau
   * « Réciter et vérifier » : l'enregistrement du verset reste EN MÉMOIRE (jamais gardé par le serveur) et part au service d'écoute
   * du mode « madd ». Une indication (« trop court ») ou rien : jamais « correct », jamais de note, jamais de chiffre ; le message
   * rappelle que l'indication est automatique, en cours de validation par des maîtres, et que le maître reste la référence.
   */
  let {
    profileId,
    verset,
    audio,
  }: { profileId: string; verset: { s: number; a: number; text: string }; audio: Blob } = $props();

  let madd = $state<CiblesVerset | null>(null);
  let encours = $state<number | null>(null);
  let resultats = $state<Record<number, { indication: Indication } | { code: string }>>({});

  onMount(async () => {
    const d = await chargerTajwid(verset.s);
    madd = d ? ciblesDe(verset.text, d.a[verset.a - 1]) : null;
  });

  const CODES: Record<string, string> = {
    madd_indisponible: 'md.err_indisponible',
    fonction_coupee: 'md.err_indisponible',
    trop_de_demandes: 'md.err_quota',
    audio_invalide: 'md.err_audio',
    audio_trop_long: 'md.err_audio',
    reference_absente: 'md.err_reference',
    reseau: 'md.err_reseau',
  };

  async function verifier(c: Cible) {
    if (!madd || encours !== null) return;
    encours = c.k;
    const r = await demanderMadd(profileId, verset, c, madd.n, audio);
    resultats[c.k] = r.ok ? { indication: r.indication } : { code: r.code };
    encours = null;
  }
</script>

{#if madd}
  <section class="madd" aria-labelledby="md-titre" data-testid="madd">
    <h3 id="md-titre"><Bidi text={t('md.titre')} /></h3>
    <p class="muted petit"><Bidi text={t('md.intro')} /></p>
    <ul>
      {#each madd.cibles as c (c.k)}
        {@const r = resultats[c.k]}
        <li data-testid="madd-cible">
          <span class="type"
            ><Bidi text={t(c.type === 'lazim' ? 'md.type_lazim' : 'md.type_muttasil')} /></span
          >
          <span class="mot quran-text" lang="ar" dir="rtl">{tanwinDisplay(c.mot)}</span>
          <button
            type="button"
            onclick={() => verifier(c)}
            disabled={encours !== null}
            data-testid="madd-verifier"
            ><Bidi text={t(encours === c.k ? 'md.en_cours' : 'md.verifier')} /></button
          >
          {#if r}
            <p class="reponse" role="status" data-testid="madd-reponse">
              {#if 'code' in r}
                <Bidi text={t(CODES[r.code] ?? 'md.err_reseau')} />
              {:else if r.indication === 'trop_court'}
                <Bidi text={t('md.trop_court')} />
              {:else}
                <Bidi text={t('md.rien')} />
              {/if}
            </p>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="notice petit" data-testid="madd-notice"><Bidi text={t('md.notice')} /></p>
  </section>
{/if}

<style>
  .madd {
    display: grid;
    gap: 8px;
    margin-top: 12px;
    padding: 10px 12px;
    border: 1px solid var(--or-line);
    border-radius: 12px;
    background: var(--card);
  }
  h3 {
    margin: 0;
    font-size: 1rem;
  }
  p {
    margin: 0;
  }
  .petit {
    font-size: 0.9rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
  }
  .mot {
    font-family: var(--font-quran);
    font-size: 1.5rem;
    line-height: 2;
  }
  .reponse {
    flex-basis: 100%;
  }
  button {
    min-height: 44px;
    padding: 6px 14px;
    border-radius: 999px;
  }
</style>
