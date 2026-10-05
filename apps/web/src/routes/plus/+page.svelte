<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';

  /** Lot 26 — « Plus » : les espaces qui ne tiennent pas dans les cinq entrées de la navigation. */
  const ITEMS = [
    // A12 : sciences islamiques (ados et adultes) en attendant la refonte de l'accueil par niveau (A27)
    { href: '/sciences', icon: 'livres', titre: 'nav.sciences', desc: 'plus.d_sciences' },
    { href: '/ecriture', icon: 'plume', titre: 'trace.titre', desc: 'plus.d_ecriture' },
    { href: '/lectures', icon: 'lire', titre: 'onglets.lectures', desc: 'plus.d_lectures' },
    { href: '/revisions', icon: 'revisions', titre: 'revisions.titre', desc: 'plus.d_revisions' },
    { href: '/suivi', icon: 'courbe', titre: 'onglets.suivi', desc: 'plus.d_suivi' },
    {
      href: '/hors-ligne',
      icon: 'telecharger',
      titre: 'entete.telechargements',
      desc: 'plus.d_hors_ligne',
    },
    { href: '/compte', icon: 'personne', titre: 'entete.compte', desc: 'plus.d_compte' },
    { href: '/aide', icon: 'question', titre: 'aide.titre', desc: 'plus.d_aide' },
  ] as const;
</script>

<svelte:head><title>{t('app.nom')} — {t('plus.titre')}</title></svelte:head>

<h1>{t('plus.titre')}</h1>
<p class="muted">{t('plus.intro')}</p>
<ul class="tiles" data-testid="plus">
  {#each ITEMS as x (x.href)}
    <li>
      <a class="tile" href={resolve(x.href)} data-plus={x.href}>
        <span class="tile-ic"><Icon name={x.icon} /></span>
        <strong><Bidi text={t(x.titre)} /></strong>
        <small><Bidi text={t(x.desc)} /></small>
      </a>
    </li>
  {/each}
</ul>
