<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { mots as motsDe, passages } from './calendrier';
  import { refsAyyub, sourceAudio, type RefVerset, type Voix } from './audio';
  import { chargerSection, trouver, type Element, type Plan, type Progres } from './donnees';
  import { attendre, vibrer } from './mouvement';
  import Picto from './Picto.svelte';

  /**
   * Écran 6 — « Je m'entraîne » : Al-Fātiḥa (récitation d'Ayyūb, verset par verset) ou l'attestation (voix de synthèse,
   * un membre de phrase par passage). 1 J'écoute (le passage joué s'éclaire), 2 Je répète (l'anneau vert se remplit
   * pendant le silence), 3 Je récite : le texte se cache par crans sous des bandes dorées « à gratter » (un mot sur trois,
   * deux sur trois, seul le premier, tout) ; un toucher révèle le mot 2 s. Bilan « Je l'ai su / Presque / Pas encore » qui
   * règle le cran et la prochaine révision. Les textes sont ceux du livre (identifiants dans animation.json).
   */
  let {
    plan,
    progres,
    voix,
    depart,
    enregistrer,
  }: {
    plan: Plan;
    progres: Progres;
    voix: Voix;
    depart?: string;
    enregistrer: (id: string, niveau: number, revision: string) => void;
  } = $props();

  interface Seg {
    ar: string;
    mots: string[];
    ref?: RefVerset;
    passage?: [number, number];
  }
  let parole = $state<Record<string, Element | null>>({});
  // texte choisi : celui de l'adresse, sinon le premier (un choix de l'élève l'emporte jusqu'au prochain changement)
  let texte = $derived(
    depart && plan.animation.entrainement.some((x) => x.id === depart)
      ? depart
      : (plan.animation.entrainement[0]?.id ?? 'fatiha'),
  );
  let etape = $state(1);
  // cran de masquage : celui qui est mémorisé pour ce texte, que l'élève règle ensuite
  let niveau = $derived(progres.entr[texte]?.niveau ?? 0);
  let actif = $state(-1);
  let motActif = $state(-1);
  let encours = $state(false);
  let silence = $state(0);
  let attente = $state(false);
  let revele = $state<string | null>(null);
  let jeton = 0;

  onMount(() => {
    void chargerSection('S5').then((s) => {
      for (const x of plan.animation.entrainement) parole[x.id] = trouver(s, x.parole);
      parole = { ...parole };
    });
  });
  onDestroy(() => {
    jeton++;
    voix.arreter();
  });

  const courant = $derived(parole[texte]);
  const coran = $derived(courant?.audio !== 'tts');
  const segs = $derived.by<Seg[]>(() => {
    const p = courant;
    if (!p) return [];
    if (p.ar_versets?.length)
      return p.ar_versets.map((v) => ({
        ar: v.ar,
        mots: motsDe(v.ar),
        ref: refsAyyub(v.audio)[0],
      }));
    const m = p.ar ? motsDe(p.ar) : [];
    return passages(m).map(([a, b]) => ({
      ar: m.slice(a, b + 1).join(' '),
      mots: m.slice(a, b + 1),
      passage: [a, b] as [number, number],
    }));
  });

  /** un mot est-il caché ? (par rang dans son passage) */
  const cache = (i: number, n = niveau): boolean =>
    n === 0 ? false : n === 1 ? i % 3 === 2 : n === 2 ? i % 3 !== 0 : n === 3 ? i > 0 : true;

  function stop() {
    jeton++;
    voix.arreter();
    actif = -1;
    motActif = -1;
    attente = false;
    encours = false;
  }
  /** joue un passage ; renvoie sa durée (ms) */
  async function jouer(k: number, jt: number, motsSuivis: boolean): Promise<number> {
    const s = segs[k];
    const p = courant;
    if (!s || !p) return 0;
    const t0 = performance.now();
    if (s.ref) {
      try {
        await voix.reciter(s.ref);
      } catch {
        await attendre(2500);
      }
    } else if (p.ar) {
      const src = sourceAudio(p, voix.la);
      await voix.dire(p.ar, src.type === 'tts' ? src.id : null, {
        passage: s.passage,
        surMot: (i) => {
          if (motsSuivis && jt === jeton) motActif = i >= 0 && s.passage ? i - s.passage[0] : -1;
        },
      });
    }
    return performance.now() - t0;
  }
  async function lancer() {
    if (encours) return stop();
    stop();
    const jt = jeton;
    encours = true;
    await voix.preparer();
    for (let k = 0; k < segs.length; k++) {
      if (jt !== jeton) return;
      actif = k;
      attente = false;
      const duree = await jouer(k, jt, etape === 1 && !coran);
      motActif = -1;
      if (jt !== jeton) return;
      if (etape === 2) {
        // silence pour répéter : 1,3 fois la durée du passage, avec un anneau qui se remplit
        attente = true;
        const d = duree * 1.3;
        const t0 = performance.now();
        while (jt === jeton) {
          silence = Math.min(1, (performance.now() - t0) / d);
          if (silence >= 1) break;
          await new Promise((r) => requestAnimationFrame(r));
        }
        attente = false;
      } else await attendre(400);
    }
    if (jt === jeton) {
      actif = -1;
      encours = false;
    }
  }
  function changerEtape(n: number) {
    stop();
    etape = n;
    if (n === 3 && !niveau) niveau = 1;
  }
  function plus() {
    niveau = Math.min(4, niveau + 1);
    vibrer(10);
  }
  function bilan(r: 'su' | 'presque' | 'pas') {
    vibrer(15);
    const n = r === 'su' ? Math.min(4, niveau + 1) : r === 'pas' ? Math.max(1, niveau - 1) : niveau;
    const jours = r === 'su' ? 3 : r === 'presque' ? 1 : 0;
    const d = new Date(Date.now() + jours * 86_400_000).toISOString().slice(0, 10);
    niveau = n;
    enregistrer(texte, n, d);
    etape = 3;
  }
  function reveler(cle: string) {
    revele = cle;
    setTimeout(() => {
      if (revele === cle) revele = null;
    }, 2200);
  }
  const consigne = $derived(
    etape === 1
      ? { i: 'ecouter', k: 'priere.consigne_1' }
      : etape === 2
        ? { i: 'repeter', k: 'priere.consigne_2' }
        : { i: 'oeil-barre', k: 'priere.consigne_3' },
  );
</script>

<!-- eslint-disable svelte/no-useless-mustaches -- une espace entre deux mots arabes -->
<div class="e-entrainement" data-testid="priere-entrainement" data-texte={texte} data-etape={etape}>
  <div class="seg" role="group" aria-label={t('priere.entr_texte')}>
    {#each plan.animation.entrainement as x (x.id)}
      <button
        type="button"
        aria-pressed={texte === x.id}
        data-texte={x.id}
        onclick={() => {
          stop();
          texte = x.id;
        }}>{t(`priere.entr_${x.id}`)}</button
      >
    {/each}
  </div>
  <div class="etapes3" role="group" aria-label={t('priere.entr_etapes')}>
    {#each [1, 2, 3] as n (n)}
      <button
        type="button"
        class:fait={n < etape}
        aria-pressed={etape === n}
        data-etape={n}
        onclick={() => changerEtape(n)}><b>{n}</b>{t(`priere.entr_e${n}`)}</button
      >
    {/each}
  </div>

  <article class="carte texte">
    <p class="consigne"><Picto nom={consigne.i} /><span>{t(consigne.k)}</span></p>
    <span class={coran ? 'coran' : 'ar'} lang="ar" dir="rtl" data-testid="priere-texte"
      >{#each segs as s, k (k)}<span class="seg-txt" class:actif={actif === k} data-k={k}
          >{#each s.mots as w, i (i)}{#if etape === 3 && cache(i)}<button
                type="button"
                class="mot masque"
                class:revele={revele === `${k}-${i}`}
                data-masque="oui"
                aria-label={t('priere.mot_cache')}
                onclick={() => reveler(`${k}-${i}`)}>{w}</button
              >{:else}<span class="mot" class:actif={actif === k && motActif === i}>{w}</span
              >{/if}{' '}{/each}</span
        >{/each}</span
    >
  </article>

  {#if etape === 3}
    <div class="niveau" data-testid="priere-niveau" data-niveau={niveau}>
      <div class="txt">
        <b>{t(`priere.niv_${niveau}`)}</b>
        <span class="crans"
          >{#each [1, 2, 3, 4] as n (n)}<i class:on={n <= niveau}></i>{/each}</span
        >
      </div>
      <button
        type="button"
        class="rond clair petit"
        aria-label={t('priere.montrer_plus')}
        data-testid="priere-moins"
        onclick={() => (niveau = Math.max(0, niveau - 1))}><Picto nom="oeil" /></button
      >
      <button
        type="button"
        class="rond petit"
        aria-label={t('priere.cacher_plus')}
        data-testid="priere-plus"
        onclick={plus}><Picto nom="oeil-barre" /></button
      >
    </div>
  {/if}
  {#if attente}
    <div class="a-vous" aria-live="assertive" data-testid="priere-a-vous">
      <span class="anneau" style:--p={silence * 100}><i><Picto nom="micro" /></i></span><span
        >{t('priere.a_vous')}</span
      >
    </div>
  {/if}
  <div class="actions">
    <button
      type="button"
      class="rond clair"
      aria-label={t('priere.recommencer')}
      onclick={() => {
        stop();
        revele = null;
      }}><Picto nom="repeter" /></button
    >
    <button type="button" class="btn bloc" data-testid="priere-lancer" onclick={lancer}
      ><Picto nom={encours ? 'pause' : 'lecture'} /><span
        >{t(encours ? 'priere.arreter' : `priere.lancer_${etape}`)}</span
      ></button
    >
  </div>

  <section class="bilan">
    <h2>{t('priere.bilan_titre')}</h2>
    <div class="trois">
      <button type="button" data-bilan="su" onclick={() => bilan('su')}
        >{t('priere.bilan_su')}<small>{t('priere.bilan_su_texte')}</small></button
      >
      <button type="button" data-bilan="presque" onclick={() => bilan('presque')}
        >{t('priere.bilan_presque')}<small>{t('priere.bilan_presque_texte')}</small></button
      >
      <button type="button" data-bilan="pas" onclick={() => bilan('pas')}
        >{t('priere.bilan_pas')}<small>{t('priere.bilan_pas_texte')}</small></button
      >
    </div>
    {#if progres.entr[texte]?.revision}<p data-testid="priere-revision">
        {t('priere.revision', { date: progres.entr[texte]!.revision! })}
      </p>{/if}
    <p>{t('priere.bilan_note')}</p>
  </section>
</div>
<!-- eslint-enable svelte/no-useless-mustaches -->
