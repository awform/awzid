<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { localIso } from '$lib/hifz';
  import { t } from '$lib/i18n';
  import { levelLabel } from '$lib/levels';
  import type { ProfileInfo } from '$lib/session';
  import Icon from '$lib/ui/Icon.svelte';
  import Progress from '$lib/ui/Progress.svelte';
  import { accueil, nextActivity, type Accueil, type Activite } from './parcours';

  /**
   * A27 — accueil de l'élève : un grand bouton « Ma prochaine activité » choisi selon SON livre, puis ses espaces :
   * Mon arabe (niveau, progression), Mon Coran (piste personnelle), Mes sciences, Au quotidien, Ma classe.
   */
  let { profile, due = 0 }: { profile: ProfileInfo; due?: number } = $props();
  let a = $state<Accueil | null>(null);
  onMount(async () => {
    const r = await accueil(profile.id);
    if (r.ok) a = r.data;
  });
  const act = $derived<Activite | null>(a ? nextActivity(a.arabe, due, localIso(), a.mode) : null);

  const link = (x: Activite): string => {
    switch (x.kind) {
      case 'lecon':
        return resolve('/lecons/[id]', { id: x.unitId });
      case 'ecriture':
        return `${resolve('/')}?onglet=ecriture`;
      case 'revisions':
        return resolve('/revisions');
      case 'epreuve':
      case 'ouvrir':
        // A39 : le récapitulatif bienveillant (espace du niveau) précède le défi, l'épreuve ou l'ouverture
        return resolve('/');
      case 'lectures':
        return `${resolve('/')}?onglet=lectures`;
      default:
        return resolve('/');
    }
  };
  const label = (x: Activite): string => {
    switch (x.kind) {
      case 'lecon':
        return t(x.reprise ? 'parc.act_continuer' : 'parc.act_lecon', { n: x.n, titre: x.titre });
      case 'ecriture':
        return t('parc.act_ecriture', { n: x.n });
      case 'revisions':
        return t('parc.act_revisions', { n: x.mots });
      case 'epreuve':
        return a?.mode === 'douce'
          ? t('ser.defi')
          : t('parc.act_epreuve', { niveau: levelLabel(x.niveau) });
      case 'ouvrir':
        return t('ser.ouvrir');
      case 'lectures':
        return t('parc.act_lectures');
      default:
        return t('parc.act_commencer');
    }
  };
  const ICON: Record<Activite['kind'], string> = {
    lecon: 'alif',
    ecriture: 'plume',
    revisions: 'revisions',
    epreuve: 'coche',
    ouvrir: 'etoile',
    lectures: 'lire',
    commencer: 'etoile',
  };
</script>

{#if a && act}
  <!-- eslint-disable svelte/no-navigation-without-resolve -- chemins résolus dans link() -->
  <a
    class="next"
    href={link(act)}
    data-testid="prochaine-activite"
    data-activite={act.kind}
    data-cible={'unitId' in act ? act.unitId : ''}
  >
    <span class="next-ic"><Icon name={ICON[act.kind]} size={34} /></span>
    <span class="next-txt">
      <small>{t('parc.prochaine')}</small>
      <strong><Bidi text={label(act)} /></strong>
    </span>
    <span class="next-go" aria-hidden="true"><Icon name="fleche" size={26} /></span>
  </a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->

  <ul class="spaces" data-testid="mes-espaces">
    <li>
      <a class="space" href={resolve('/')} data-espace="arabe">
        <span class="sp-ic"><Icon name="alif" /></span>
        <strong>{t('parc.mon_arabe')}</strong>
        {#if a.arabe?.courant}
          <small><Bidi text={levelLabel(a.arabe.courant.code)} /></small>
          {#if a.mode !== 'verification' && a.semaine}<small data-testid="encouragement-accueil"
              ><Bidi text={t('ser.semaine', { n: a.semaine })} /></small
            >{/if}
          <Progress
            value={a.arabe.progression.faites}
            max={a.arabe.progression.total}
            label={t('parc.progression', {
              n: a.arabe.progression.faites,
              total: a.arabe.progression.total,
            })}
          />
        {:else}<small>{t('parc.a_commencer')}</small>{/if}
      </a>
    </li>
    <li>
      <a class="space" href={resolve('/coran')} data-espace="coran">
        <span class="sp-ic"><Icon name="mushaf" /></span>
        <strong>{t('parc.mon_coran')}</strong>
        <small
          ><Bidi
            text={a.coran.plan ? t('parc.coran_plan') : t('parc.coran_libre')}
          />{#if a.coran.niveau?.courant}
            · <Bidi text={levelLabel(a.coran.niveau.courant.code)} />{/if}</small
        >
      </a>
    </li>
    <li>
      <a class="space" href={resolve('/sciences')} data-espace="sciences">
        <span class="sp-ic"><Icon name="livres" /></span>
        <strong>{t('parc.mes_sciences')}</strong>
        <small
          >{#if a.sciences?.courant}<Bidi text={levelLabel(a.sciences.courant.code)} />{:else}{t(
              'parc.a_commencer',
            )}{/if}</small
        >
      </a>
    </li>
    <li>
      <a class="space" href={resolve('/quotidien')} data-espace="quotidien">
        <span class="sp-ic"><Icon name="quotidien" /></span>
        <strong>{t('parc.au_quotidien')}</strong>
        <small>{t('parc.quotidien_texte')}</small>
      </a>
    </li>
    {#if a.classes.length}
      <li>
        <a class="space" href={resolve('/ma-classe')} data-espace="classe">
          <span class="sp-ic"><Icon name="classe" /></span>
          <strong>{t('parc.ma_classe')}</strong>
          <small><Bidi text={a.classes.map((c) => c.name).join(' · ')} /></small>
        </a>
      </li>
    {/if}
  </ul>
{/if}

<style>
  .next {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-m);
    padding: var(--space-m) var(--space-l);
    margin: var(--space-m) 0;
    min-height: 88px;
    border-radius: var(--radius-lg);
    background: var(--primary);
    color: var(--on-primary);
    text-decoration: none;
    box-shadow: var(--shadow-float);
    transition: transform var(--motion-fast) ease;
  }
  .next:hover {
    transform: translateY(-2px);
  }
  .next-ic {
    display: grid;
    place-items: center;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--on-primary) 18%, transparent);
  }
  .next-txt {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .next-txt small {
    opacity: 0.9;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 0.78rem;
  }
  .next-txt strong {
    font-size: 1.2rem;
    line-height: 1.3;
  }
  :global([dir='rtl']) .next-go {
    transform: scaleX(-1);
  }
  .spaces {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--space-l);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr));
    gap: 10px;
  }
  .space {
    display: grid;
    gap: 4px;
    height: 100%;
    padding: var(--space-m);
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    color: var(--ink);
    text-decoration: none;
  }
  .space small {
    color: var(--ink2);
  }
  .sp-ic {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    background: var(--primary-soft);
    color: var(--primary);
  }
</style>
