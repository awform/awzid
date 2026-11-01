"""
Awzid — RENFORT DU TAJWĪD (novembre 2026) : mesures étendues par occurrence (recherche, rien dans l'appli).

Reprend la transcription Tanzil et l'alignement de `calibration/tajwid_commun.py` (étude du 25/10) et ajoute des indices
pour les règles en échec ou éteintes :
  - iqlāb / ikhfāʾ shafawī : P(ن) seule (sans ں), 1 − P(۾) (« le modèle n'entend plus le mīm caché »), spectre du murmure
    (bandes 0-500 / 500-1000 / 1000-1600 / 1600-2600 Hz : l'anti-formant du [m] est plus bas que celui du [n]) et pente du F2
    à la fin de la voyelle précédente (les lèvres qui se ferment font descendre F2) ;
  - idghām avec ghunna : durée du BLOC nasal (le groupe و/ي plus un éventuel groupe nasal écrit juste avant), probabilité
    de ن / ں / م dans la fenêtre précédente, tête ghunna ;
  - lām de « Allāh », rāʾ, lettres emphatiques : F1, F2 de la voyelle suivante, F2 rapporté à la médiane des voyelles de même
    timbre du verset (dF2, rF2 : normalisation par locuteur), tête tafkhīm sur la consonne seule et sur la voyelle ;
  - qalqala : rebond, écho (mesures de l'étude), plus énergie relative de l'explosion et P(ڇ) ;
  - madd lāzim : durée du madd rapportée à la médiane des madd ṭabīʿī du MÊME verset (6 temps ≈ 3 fois un ṭabīʿī).
Le texte coranique est lu octet pour octet (Tanzil, sans normalisation).
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'calibration'))
import tajwid_commun as tc  # noqa: E402

SR = 16000
VOCAB = os.environ.get('VOCAB', '/muaalem/vocab.json')
VOC = json.load(open(VOCAB)) if os.path.exists(VOCAB) else None
PH = VOC['phonemes'] if VOC else {}
INV = {i: t for t, i in PH.items()}
VOY = {'َ', 'ُ', 'ِ', 'ا', 'ۥ', 'ۦ'}
COURTES = {'َ', 'ُ', 'ِ'}
LONGUES = {'ا', 'ۥ', 'ۦ'}
TIMBRE = {'َ': 'a', 'ا': 'a', 'ُ': 'u', 'ۥ': 'u', 'ِ': 'i', 'ۦ': 'i'}
NASALES = {'ن', 'ں', 'م', '۾'}
EMPHATIQUES = set('صضطظقغخ')
INTERET = ['ن', 'ں', 'م', '۾', 'ي', 'و', 'ل', 'ر', 'ڇ', 'ب']
REGLES = {'ghunna', 'ikhfa', 'izhar', 'idgham_ghunna', 'idgham_sans', 'iqlab', 'ikhfa_shafawi', 'lam_allah_tafkhim',
          'lam_allah_tarqiq', 'ra_tafkhim', 'ra_tarqiq', 'qalqala_kubra', 'qalqala_sughra', 'emphatique', 'madd_long'}


def glouton(lp):
    best = lp.argmax(-1)
    ps = np.exp(lp.max(-1))
    out, prev = [], None
    for t, (i, p) in enumerate(zip(best.tolist(), ps.tolist())):
        if i != 0 and i == prev:
            out[-1]['t1'] = t
            out[-1]['p'] = max(out[-1]['p'], p)
        elif i != 0:
            out.append({'tok': INV[i], 't0': t, 't1': t, 'p': p})
        prev = i
    return out


def fin_voyelle(dec, j):
    k = j + 1
    while k < len(dec) and dec[k]['tok'] in VOY:
        k += 1
    return dec[k]['t0'] if k < len(dec) else dec[-1]['t1'] + 1


def spectre_murmure(seg):
    """Énergies relatives (dB) du murmure nasal par bandes : l'anti-formant du [m] (≈ 750-1250 Hz) est plus bas que celui
    du [n] (≈ 1450-2200 Hz). On mesure le milieu du murmure (60 %) pour éviter les transitions."""
    if len(seg) < 400:
        return None
    a, b = int(0.2 * len(seg)), int(0.8 * len(seg))
    s = seg[a:b]
    n = 1 << int(np.ceil(np.log2(max(512, len(s)))))
    S = np.abs(np.fft.rfft(s * np.hanning(len(s)), n=n)) ** 2
    f = np.fft.rfftfreq(n, 1 / SR)

    def e(x, y):
        return float(S[(f >= x) & (f < y)].sum()) + 1e-12
    tot = e(80, 4000)
    return {'m_b0': 10 * np.log10(e(80, 500) / tot), 'm_b1': 10 * np.log10(e(500, 1000) / tot),
            'm_b2': 10 * np.log10(e(1000, 1600) / tot), 'm_b3': 10 * np.log10(e(1600, 2600) / tot),
            'm_b4': 10 * np.log10(e(2600, 4000) / tot),
            'm_creux': 10 * np.log10(e(1000, 1600) / e(1600, 2600))}


def f2_trajet(seg):
    """F2 au milieu puis à la fin d'une voyelle (Hz) : la fermeture des lèvres (م, ب) fait chuter F2 en fin de voyelle."""
    if len(seg) < int(0.06 * SR):
        return None
    h = len(seg) // 2
    a = tc.formants(seg[h // 2: h + h // 2])
    b = tc.formants(seg[-int(0.05 * SR):])
    if not a or not b:
        return None
    return {'f2_milieu': a[1], 'f2_fin': b[1], 'f2_pente': b[1] - a[1]}


def ref_voyelles(dec, x, fs, max_par=8):
    """F1, F2 médians par timbre (a, u, i) des voyelles du verset : référence interne au locuteur."""
    vals = {'a': [], 'u': [], 'i': []}
    for k, g in enumerate(dec):
        tim = TIMBRE.get(g['tok'])
        if tim is None or len(vals[tim]) >= max_par or k == 0:
            continue
        if dec[k - 1]['tok'] in EMPHATIQUES or dec[k - 1]['tok'] in ('ر', 'ل'):
            continue  # voyelle « neutre » seulement (ni après emphatique, ni après rāʾ / lām)
        fin = dec[k + 1]['t0'] if k + 1 < len(dec) else g['t1'] + 1
        seg = x[int(g['t0'] * fs * SR): int(fin * fs * SR)]
        fm = tc.formants(seg)
        if fm:
            vals[tim].append(fm)
    return {t: (float(np.median([v[0] for v in L])), float(np.median([v[1] for v in L]))) for t, L in vals.items() if len(L) >= 2}


def occurrences_emphatiques(toks):
    """Lettres emphatiques (isti'lāʾ) suivies d'une voyelle : tafkhīm attendu. Ancre : index du jeton."""
    return [i for i, (t, _) in enumerate(toks) if t in EMPHATIQUES]


def tabii_durees(dec, fs):
    out = []
    for k, g in enumerate(dec):
        if g['tok'] in LONGUES and g['n'] == 2 and 0 < k < len(dec) - 1 and dec[k + 1]['tok'] not in VOY:
            deb = dec[k - 1]['t0'] if dec[k - 1]['tok'] in COURTES else g['t0']
            out.append((dec[k + 1]['t0'] - deb) * fs)
    return out


def mesurer_verset(texte, lp, n_ech, x=None, regles=REGLES, seulement=None):
    """Mesures de toutes les occurrences d'un verset. lp : {niveau: log-probas (T, V)}. x : audio 16 kHz (facultatif)."""
    toks, occ = tc.transcrire(texte)
    att = tc.groupes_attendus(toks)
    dec = tc.groupes_decodes(glouton(lp['phonemes']))
    if not dec:
        return []
    T = lp['phonemes'].shape[0]
    fs = n_ech / SR / T
    corr, cout = tc.aligner(att, dec)
    P = np.exp(lp['phonemes'])
    G = np.exp(lp['ghonna'][:, VOC['ghonna']['[مغن]']])
    Tf = np.exp(lp['tafkheem_or_taqeeq'][:, VOC['tafkheem_or_taqeeq']['[مفخم]']])
    Q = np.exp(lp['qalqla'][:, VOC['qalqla']['[مقلقل]']]) if 'qalqla' in lp else None
    rate = (dec[-1]['t1'] - dec[0]['t0'] + 1) * fs / len(att)
    refv = ref_voyelles(dec, x, fs) if x is not None else {}
    tab = tabii_durees(dec, fs)
    tab_med = float(np.median(tab)) if len(tab) >= 2 else None
    # occurrences « emphatique » ajoutées (lettres d'isti'lāʾ mutaḥarrika) : l'id suit ceux de tajwid_commun
    if 'emphatique' in regles:
        base = len(occ)
        gi = 0
        for i, g in enumerate(att):
            if g['tok'] in EMPHATIQUES and i + 1 < len(att) and att[i + 1]['tok'] in VOY:
                oid = base + gi
                g['tags'] = set(g['tags']) | {oid}
                occ.append({'id': oid, 'regle': 'emphatique', 'detail': g['tok'] + TIMBRE.get(att[i + 1]['tok'], '?')})
                gi += 1
    res = []
    for o in occ:
        if o['regle'] not in regles or (seulement is not None and o['id'] != seulement):
            continue
        m = {'oid': o['id'], 'regle': o['regle'], 'detail': o['detail'], 'cout': round(cout, 3)}
        idx = [i for i, g in enumerate(att) if o['id'] in g['tags']]
        if not idx or corr[idx[0]] is None:
            m['aligne'] = False
            res.append(m)
            continue
        i = idx[0]
        j = corr[i]
        g = dec[j]
        t0, t1 = g['t0'], g['t1']
        tn = dec[j + 1]['t0'] if j + 1 < len(dec) else t1 + 1
        tp = dec[j - 1]['t0'] if j > 0 else t0
        W = slice(t0, max(tn, t1 + 1))
        Wp = slice(tp, max(tn, t1 + 1))
        m.update({'aligne': True, 'tok': g['tok'], 'att_tok': att[i]['tok'], 'n': g['n'], 'att_n': att[i]['n'],
                  't0': t0, 't1': t1, 'tn': tn, 'tp': tp, 'fs': fs, 'rate': rate,
                  'duree': (tn - t0) * fs, 'dn': (tn - t0) * fs / rate,
                  'P': {t: round(float(P[W, PH[t]].max()), 5) for t in INTERET},
                  'Pp': {t: round(float(P[Wp, PH[t]].max()), 5) for t in ('ن', 'ں', 'م', '۾')},
                  'ghunna': float(G[W].mean()), 'ghunna_max': float(G[W].max())})
        r = o['regle']
        if r in ('idgham_ghunna', 'idgham_sans', 'ghunna', 'ikhfa', 'iqlab', 'ikhfa_shafawi', 'izhar'):
            # durée en « temps » du récitant lui-même : rapportée au madd ṭabīʿī (2 temps) du même verset. Indépendant de
            # toute voix de référence (utile pour un débit d'apprenant irrégulier).
            m['r_tabii'] = ((tn - t0) * fs / tab_med) if tab_med else None
            m['n_tabii'] = len(tab)
        if r in ('idgham_ghunna', 'idgham_sans', 'ghunna'):
            # bloc nasal : un groupe nasal écrit juste avant la consonne d'arrivée fait partie de la tenue
            k = j
            while k > 0 and dec[k - 1]['tok'] in NASALES:
                k -= 1
            m['bloc_t0'] = dec[k]['t0']
            m['dn_bloc'] = (tn - dec[k]['t0']) * fs / rate
            m['n_bloc'] = sum(d['n'] for d in dec[k:j + 1])
            m['ghunna_bloc'] = float(G[dec[k]['t0']:max(tn, t1 + 1)].mean())
            m['r_tabii_bloc'] = ((tn - dec[k]['t0']) * fs / tab_med) if tab_med else None
        if r in ('iqlab', 'ikhfa_shafawi', 'ikhfa', 'ghunna', 'izhar') and x is not None:
            seg = x[int(t0 * fs * SR): int(tn * fs * SR)]
            sm = spectre_murmure(seg)
            if sm:
                m.update(sm)
            b = tc.bandes(seg)
            if b:
                m.update(b)
            if j > 0 and dec[j - 1]['tok'] in VOY:
                tr = f2_trajet(x[int(dec[j - 1]['t0'] * fs * SR): int(t0 * fs * SR)])
                if tr:
                    m.update(tr)
        if r.startswith('lam_allah') or r.startswith('ra_') or r == 'emphatique':
            tv = fin_voyelle(dec, j)
            m['tv'] = tv
            m['tafkhim_cons'] = float(Tf[W].mean())
            m['tafkhim_tete'] = float(Tf[t0:max(tv, t1 + 1)].mean())
            m['tafkhim_voy'] = float(Tf[tn:max(tv, tn + 1)].mean())
            vt = dec[j + 1]['tok'] if j + 1 < len(dec) else None
            m['timbre'] = TIMBRE.get(vt)
            if x is not None:
                fm = tc.formants(x[int(tn * fs * SR): int(tv * fs * SR)])
                if fm:
                    m['F1'], m['F2'] = fm
                    ref = refv.get(m['timbre'] or '')
                    if ref:
                        m['dF2'] = fm[1] - ref[1]
                        m['rF2'] = fm[1] / ref[1]
                        m['dF1'] = fm[0] - ref[0]
        if r.startswith('qalqala') and x is not None:
            if j + 1 < len(dec) and dec[j + 1]['tok'] == 'ڇ':
                tq = dec[j + 1]['t1'] + 1
            else:
                tq = tn
            a_ = max(0, int((t0 * fs - 0.03) * SR))
            b_ = min(len(x), int((tq * fs + 0.01) * SR))
            e = tc.energie_db(x[a_:min(len(x), b_ + int(0.08 * SR))])
            n_clo = max(2, min(len(e) - 1, (b_ - a_) // int(0.005 * SR)))
            if len(e) >= 6:
                kk = int(np.argmin(e[:n_clo]))
                apres, echo = e[kk:kk + 12], e[kk + 4:kk + 12]
                med = float(np.median(tc.energie_db(x)))
                m.update({'rebond_db': float(apres.max() - e[kk]), 'echo_db': float(echo.mean() - e[kk]) if len(echo) else 0.0,
                          'fermeture_db': float(e[kk] - med), 'echo_rel_db': float(echo.mean() - med) if len(echo) else -99.0,
                          't_fermeture': (a_ / SR) + kk * 0.005})
            m['P_rebond'] = float(P[t0:max(tn + 3, t0 + 1), PH['ڇ']].max())
            if Q is not None:
                m['qalqala_tete'] = float(Q[t0:tn + 4].max())
        res.append(m)
    # madd lāzim / muttaṣil : voyelle longue de 4 ou 6 unités attendues
    for i, g in enumerate(att):
        if g['tok'] in LONGUES and g['n'] >= 4 and corr[i] is not None and 'madd_long' in regles:
            if seulement is not None and seulement != f'm{i}':
                continue
            j = corr[i]
            d = dec[j]
            if d['tok'] not in LONGUES:
                continue
            # lāzim : la consonne qui suit est doublée ou sans voyelle ; sinon une hamza suit (muttaṣil ou munfaṣil)
            nx = att[i + 1] if i + 1 < len(att) else None
            nx2 = att[i + 2] if i + 2 < len(att) else None
            if nx is None:
                typ = 'fin'
            elif nx['tok'] == 'ء':
                typ = 'hamza'
            elif nx['n'] >= 2 or nx2 is None or nx2['tok'] not in VOY:
                typ = 'lazim'
            else:
                typ = 'autre'
            deb = dec[j - 1]['t0'] if j > 0 and dec[j - 1]['tok'] in COURTES else d['t0']
            tn = dec[j + 1]['t0'] if j + 1 < len(dec) else d['t1'] + 1
            res.append({'regle': 'madd_long', 'type': typ, 'oid': f'm{i}', 'att_n': g['n'], 'n': d['n'], 'cout': round(cout, 3), 'aligne': True,
                        'tok': d['tok'], 'att_tok': g['tok'], 'duree': (tn - deb) * fs, 'dn': (tn - deb) * fs / rate,
                        'r_tabii': ((tn - deb) * fs / tab_med) if tab_med else None, 'n_tabii': len(tab), 't0': deb, 'tn': tn, 'fs': fs})
    return res
