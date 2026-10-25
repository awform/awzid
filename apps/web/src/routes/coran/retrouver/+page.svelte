<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { resolve } from '$app/paths';
  import { suraName } from '@awform/hifz';
  import Bidi from '$lib/Bidi.svelte';
  import { demoProfileFor } from '$lib/attempts';
  import { loadVerses } from '$lib/hifz';
  import { fmtNumber, loadTexts, t, texteExiste } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { etatEcoute } from '$lib/ecoute/etat';
  import { causeMicro, coupe, donnerAccord, Enregistreur, micro } from '$lib/ecoute/ecoute';
  import {
    cartes,
    requeteLecteur,
    retrouver,
    RETROUVER_MAX_S,
    RETROUVER_MIN_S,
    type Carte,
    type Retrouve,
  } from '$lib/ecoute/retrouver';

  /**
   * « RETROUVE CE VERSET » (interrupteur `shazam_coran`, coupé par défaut) : l'élève récite 5 à 15 s d'un passage,
   * l'application montre où il se trouve dans le Coran — ou TOUS les versets au même texte (ex æquo) — au-dessus du
   * seuil validé ; un toucher ouvre le verset, récité par Muḥammad Ayyūb. Moins de 3 s : « récite un peu plus
   * longtemps ». Jamais de jugement de la récitation. Accord « analyse vocale par IA » au premier usage (enfant :
   * code parent) ; la voix n'est jamais gardée. Page rare (en ligne seulement), jamais préchargée.
   */
  type Etape = 'charge' | 'ferme' | 'accord' | 'pret' | 'ecoute' | 'recherche' | 'resultat';
  let etape = $state<Etape>('charge');
  let profileId = $state<string | null>(null);
  let enfant = $state(false);
  let pin = $state('');
  let erreur = $state('');
  let secondes = $state(0);
  let res = $state<Retrouve | null>(null);
  let textes = $state<Record<string, string>>({});
  let titreRes = $state<HTMLElement>();
  let flux: MediaStream | null = null;
  let rec: Enregistreur | null = null;
  let horloge: ReturnType<typeof setInterval> | null = null;

  const vue = $derived(res ? cartes(res) : { principales: [], autres: [] });

  onMount(async () => {
    await loadTexts('ecoute');
    const p = await demoProfileFor('').catch(() => null);
    if (!p) return void (etape = 'ferme');
    profileId = p.id;
    const e = await etatEcoute(p.id, true);
    if (!e.shazam) return void (etape = 'ferme');
    enfant = p.kind === 'enfant' || e.enfant === true;
    etape = e.accord ? 'pret' : 'accord';
  });
  onDestroy(arret);

  function arret() {
    if (horloge) clearInterval(horloge);
    horloge = null;
    rec?.arreter();
    coupe(flux);
    flux = null;
  }

  const MESSAGES: Record<string, string> = {
    ecoute_indisponible: 'ec.err_indisponible',
    ecoute_occupee: 'ec.err_occupee',
    audio_trop_long: 'rv.err_trop_long',
    audio_invalide: 'ec.err_audio',
    micro: 'ec.err_micro',
    micro_https: 'ec.err_micro_https',
    micro_refuse: 'ec.err_micro_refuse',
    micro_absent: 'ec.err_micro_absent',
    trop_de_demandes: 'ec.err_quota',
    reseau: 'ec.err_reseau',
    fonction_fermee: 'rv.ferme',
  };
  function message(code: string): string {
    if (MESSAGES[code]) return t(MESSAGES[code]!);
    return texteExiste(`erreur.${code}`) ? t(`erreur.${code}`) : t('ec.err_reseau');
  }

  async function accepter() {
    if (!profileId) return;
    erreur = '';
    const e = await donnerAccord(profileId, pin);
    if (e) return void (erreur = message(e));
    pin = '';
    etape = 'pret';
  }

  async function commencer() {
    erreur = '';
    res = null;
    try {
      flux = await micro();
    } catch (e) {
      return void (erreur = message(causeMicro(e)));
    }
    rec = new Enregistreur();
    secondes = 0;
    horloge = setInterval(
      () =>
        (secondes = Math.min(
          RETROUVER_MAX_S,
          Math.floor((Date.now() - (rec?.debut ?? Date.now())) / 1000),
        )),
      250,
    );
    // arrêt automatique à 15 s
    await rec.demarrer(flux, (b) => void fini(b), RETROUVER_MAX_S);
    etape = 'ecoute';
  }

  async function fini(b: Blob) {
    const duree = (Date.now() - (rec?.debut ?? Date.now())) / 1000;
    arret();
    if (duree < RETROUVER_MIN_S) {
      // trop court : on ne cherche pas, on ne devine jamais
      res = { statut: 'trop_court', resultats: [], egaux: [] };
      etape = 'resultat';
      return;
    }
    etape = 'recherche';
    const r = await retrouver(profileId!, b);
    if (!r.ok) {
      erreur = message(r.code);
      etape = r.code === 'accord_requis' ? 'accord' : 'pret';
      return;
    }
    res = r.r;
    // texte Tanzil des versets montrés (copie locale d'abord)
    const { principales, autres } = cartes(r.r);
    const t2: Record<string, string> = {};
    await Promise.all(
      [...principales, ...autres].map(async (c) => {
        const [v] = await loadVerses(c.s, c.principal, c.principal).catch(() => []);
        if (v) t2[`${c.s}:${c.principal}`] = v.text;
      }),
    );
    textes = t2;
    etape = 'resultat';
    await tick();
    titreRes?.focus();
  }

  const libelle = (c: Carte) =>
    c.a1 > c.a
      ? t('rv.versets', { sourate: suraName(c.s), de: fmtNumber(c.a), a: fmtNumber(c.a1) })
      : t('rv.verset', { sourate: suraName(c.s), n: fmtNumber(c.a) });
  const mmss = (n: number) => `0:${String(n).padStart(2, '0')}`;
</script>

{#snippet carte(c: Carte)}
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi de paramètres -->
  <a class="carte" href={`${resolve('/coran/lecteur')}${requeteLecteur(c)}`} data-testid="rv-carte">
    <span class="ref"><Bidi text={libelle(c)} /></span>
    <!-- texte Tanzil tel quel, sur sa propre ligne -->
    <span class="txt quran-text" lang="ar" dir="rtl">{textes[`${c.s}:${c.principal}`] ?? ''}</span>
    <span class="ouvrir"
      ><Icon name="casque" size={18} /><Bidi text={t('rv.ecouter_ayyoub')} /></span
    >
  </a>
{/snippet}

<svelte:head><title>{t('app.nom')} — {t('rv.titre')}</title></svelte:head>

<section class="rv" class:enfant data-testid="retrouver">
  <h1><Icon name="oreille" size={26} /> {t('rv.titre')}</h1>

  {#if etape === 'charge'}
    <p class="muted" role="status">{t('ec.chargement')}</p>
  {:else if etape === 'ferme'}
    <p class="card" role="status" data-testid="rv-ferme"><Bidi text={t('rv.ferme')} /></p>
  {:else if etape === 'accord'}
    <section class="card" data-testid="rv-accord" aria-labelledby="rv-accord-titre">
      <h2 id="rv-accord-titre">{t('ec.accord_titre')}</h2>
      <p><Bidi text={t('rv.accord_texte')} /></p>
      <p class="small muted"><Bidi text={t('ec.accord_garanties')} /></p>
      {#if enfant}
        <p class="small"><Bidi text={t('ec.accord_parent')} /></p>
        <label class="pin"
          >{t('profils.code_parent')}
          <input
            type="password"
            inputmode="numeric"
            maxlength="8"
            autocomplete="off"
            bind:value={pin}
            data-testid="rv-pin"
          /></label
        >
      {/if}
      <button type="button" class="primary" onclick={accepter} data-testid="rv-accepter"
        >{t('ec.accord_ok')}</button
      >
    </section>
  {:else}
    <p class="intro"><Bidi text={t(enfant ? 'rv.intro_enfant' : 'rv.intro')} /></p>

    {#if etape === 'pret' || etape === 'resultat'}
      <button type="button" class="primary micro" onclick={commencer} data-testid="rv-commencer"
        ><Icon name="oreille" size={28} /><span
          ><Bidi text={t(etape === 'resultat' ? 'rv.encore' : 'rv.commencer')} /></span
        ></button
      >
    {:else if etape === 'ecoute'}
      <div class="enreg" role="status" data-testid="rv-en-cours">
        <span class="point" aria-hidden="true"></span>
        <span><Bidi text={t('rv.je_t_ecoute')} /></span>
        <span class="temps"><Bidi text={`${mmss(secondes)} / ${mmss(RETROUVER_MAX_S)}`} /></span>
        <button
          type="button"
          class="primary"
          onclick={() => rec?.arreter()}
          data-testid="rv-chercher">{t('rv.chercher')}</button
        >
      </div>
    {:else if etape === 'recherche'}
      <p class="muted" role="status" data-testid="rv-recherche">{t('rv.recherche')}</p>
    {/if}

    {#if etape === 'resultat' && res}
      <div class="resultat" data-testid="rv-resultat">
        {#if res.statut === 'trop_court'}
          <p class="doux" role="status" data-testid="rv-trop-court">
            <Bidi text={t('rv.trop_court')} />
          </p>
        {:else if res.statut === 'pas_trouve' || !vue.principales.length}
          <p class="doux" role="status" data-testid="rv-pas-trouve">
            <Bidi text={t('rv.pas_trouve')} />
          </p>
        {:else}
          <h2 tabindex="-1" bind:this={titreRes} data-testid="rv-titre-resultat">
            <Bidi
              text={vue.principales.length > 1
                ? t('rv.ex_aequo', { n: vue.principales.length })
                : t('rv.trouve')}
            />
          </h2>
          <ul class="cartes" data-testid="rv-principales">
            {#each vue.principales as c (`${c.s}:${c.principal}`)}<li>{@render carte(c)}</li>{/each}
          </ul>
          {#if vue.autres.length}
            <h3>{t('rv.autres')}</h3>
            <ul class="cartes" data-testid="rv-autres">
              {#each vue.autres as c (`${c.s}:${c.principal}`)}<li>{@render carte(c)}</li>{/each}
            </ul>
          {/if}
        {/if}
      </div>
    {/if}

    {#if erreur}<p role="alert" class="bad" data-testid="rv-erreur"><Bidi text={erreur} /></p>{/if}

    <p class="small muted garanties"><Bidi text={t('rv.garanties')} /></p>
  {/if}
</section>

<style>
  .rv {
    display: grid;
    gap: 14px;
    max-width: 680px;
    margin: 0 auto;
    padding: 8px 16px 32px;
  }
  h1 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0 0;
    font-size: 1.5rem;
  }
  h2 {
    font-size: 1.15rem;
    margin: 0;
  }
  h3 {
    font-size: 1rem;
    margin: 6px 0 0;
  }
  .intro {
    margin: 0;
  }
  .micro {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 56px;
    font-size: 1.1rem;
    border-radius: 999px;
  }
  .enfant .micro {
    min-height: 64px;
    font-size: 1.25rem;
  }
  .enreg {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .point {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--bad-ink);
    animation: pulse 1.2s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .point {
      animation: none;
    }
  }
  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
  .temps {
    font-variant-numeric: tabular-nums;
  }
  .resultat {
    display: grid;
    gap: 10px;
  }
  .resultat :focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .cartes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .carte {
    display: grid;
    gap: 6px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    color: inherit;
    text-decoration: none;
    background: var(--card);
  }
  .carte:hover,
  .carte:focus-visible {
    border-color: var(--accent);
  }
  .carte:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .ref {
    font-weight: 700;
  }
  .txt {
    font-family: var(--font-quran);
    font-size: 1.45rem;
    line-height: 2.1;
    text-align: right;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .ouvrir {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--primary);
    font-weight: 600;
  }
  .doux {
    font-weight: 600;
    margin: 0;
  }
  .bad {
    color: var(--bad-ink);
  }
  .pin {
    display: grid;
    gap: 4px;
    max-width: 220px;
  }
  .small {
    font-size: 0.9rem;
  }
  .garanties {
    border-inline-start: 3px solid var(--accent);
    padding-inline-start: 8px;
    margin: 0;
  }
</style>
