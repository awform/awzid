<script lang="ts">
  import AvisBouton from '$lib/avis/AvisBouton.svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import { chargerV4, type EcransV4 } from '$lib/design';
  import { fn } from '$lib/fonctions.svelte';

  // refonte 19/10 (interrupteur « design_v4 ») : « Mes activités » chargé à la demande ; impossible → ancien « Plus »
  let V4 = $state<EcransV4['ActivitesV4'] | null>(null);
  let v4Echec = $state(false);
  const v4 = $derived(fn('design_v4') && !v4Echec);
  $effect(() => {
    if (v4 && !V4) void chargerV4().then((m) => (m ? (V4 = m.ActivitesV4) : (v4Echec = true)));
  });

  /**
   * « Plus » (D2) : les espaces hors de la barre du bas, RANGÉS EN FAMILLES, chacun avec son icône et son nom écrit.
   * Emplacements prévus dans « Apprendre plus » : 1 000 mots et Poésie (Madjaliss : ouvert) — ajoutés ici (une ligne
   * chacun) seulement quand leur page existera ; rien n'est affiché avant. Le pied juridique du layout est masqué ici (mêmes liens dans la famille Aide, sans doublon). Les liens juridiques ne sont pas montrés
   * à un enfant (`.juridique`). « Signaler un problème » et « Donner mon avis » s'ouvrent sur place.
   */
  type Lien = { href: string; icon: string; titre: string; juridique?: boolean };
  const FAMILLES: Array<{ id: string; titre: string; liens: Lien[]; avis?: boolean }> = [
    {
      id: 'apprendre',
      titre: 'plus.f_apprendre',
      liens: [
        { href: '/lectures', icon: 'lire', titre: 'onglets.lectures' },
        { href: '/sciences', icon: 'livres', titre: 'nav.sciences' },
        // P3-1 : textes de référence mālikites étudiés en séances (pages et textes gardés au premier usage)
        { href: '/madjaliss', icon: 'etoile', titre: 'plus.madjaliss' },
      ],
    },
    {
      id: 'pratiquer',
      titre: 'plus.f_pratiquer',
      liens: [
        { href: '/ecriture', icon: 'plume', titre: 'trace.titre' },
        { href: '/revisions', icon: 'revisions', titre: 'revisions.titre' },
        { href: '/hors-ligne', icon: 'telecharger', titre: 'entete.telechargements' },
      ],
    },
    {
      id: 'suivi',
      titre: 'plus.f_suivi',
      liens: [
        // D1 : « Ma classe » quitte l'accueil pour « Plus »
        { href: '/ma-classe', icon: 'classe', titre: 'parc.ma_classe' },
        { href: '/suivi', icon: 'courbe', titre: 'onglets.suivi' },
        { href: '/suivi/rapport', icon: 'message', titre: 'rap.titre' },
      ],
    },
    {
      id: 'aide',
      titre: 'aide.titre',
      avis: true,
      liens: [
        { href: '/aide', icon: 'question', titre: 'aide.titre' },
        { href: '/garanties', icon: 'bouclier', titre: 'gar.titre', juridique: true },
        { href: '/legal/mentions', icon: 'info', titre: 'pied.mentions', juridique: true },
        { href: '/legal/cgu', icon: 'info', titre: 'pied.cgu', juridique: true },
        {
          href: '/legal/confidentialite',
          icon: 'info',
          titre: 'pied.confidentialite',
          juridique: true,
        },
        { href: '/legal/cookies', icon: 'info', titre: 'pied.cookies', juridique: true },
      ],
    },
    {
      id: 'compte',
      titre: 'plus.f_compte',
      liens: [{ href: '/compte', icon: 'personne', titre: 'entete.compte' }],
    },
  ];
</script>

<svelte:head><title>{t('app.nom')} — {t('plus.titre')}</title></svelte:head>

{#if v4}
  {#if V4}<V4 />{:else}<Loading lines={4} />{/if}
{:else}
  <h1>{t('plus.titre')}</h1>
  <div data-testid="plus">
    {#each FAMILLES as f (f.id)}
      <h2 class="famille-titre" data-famille={f.id}><Bidi text={t(f.titre)} /></h2>
      <ul class="nav-liste">
        {#each f.liens as x, i (x.href)}
          <li class:juridique={x.juridique}>
            <a href={resolve(x.href as '/')} data-plus={x.href}
              ><span class="ic"><Icon name={x.icon} /></span><span class="nom"
                ><Bidi text={t(x.titre)} /></span
              ><span class="chev"><Icon name="chevron" size={20} /></span></a
            >
          </li>
          <!-- F5 : « Signaler un problème » et « Donner mon avis » (fenêtre chargée à la demande, en ligne) -->
          {#if f.avis && i === 0}<AvisBouton mode="probleme" ligne /><AvisBouton ligne />{/if}
        {/each}
      </ul>
    {/each}
  </div>
{/if}

<style>
  :global([data-public='enfant']) .juridique {
    display: none;
  }
  h1 {
    margin-bottom: 0;
  }
</style>
