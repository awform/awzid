"""
Awzid — ÉTUDE TAJWĪD COMPLÈTE : outils communs. PROTOTYPE DE RECHERCHE, rien dans l'appli.

1. `transcrire(texte)` : écriture phonétique APPROCHÉE d'un verset Tanzil (Ḥafṣ, Uthmani) dans l'alphabet de
   Muaalem, avec l'ÉTIQUETAGE de chaque occurrence de règle d'après les signes du texte (sukūn, shadda, tanwīn,
   petit mīm d'iqlāb, lettres de qalqala...). Lecture en waṣl dans le verset, waqf (pause) en fin de verset.
   L'écriture n'a pas besoin d'être parfaite : elle sert d'ancre pour l'alignement (distance d'édition).
2. `aligner(attendu, decode)` : relie chaque « groupe » attendu (suite de lettres identiques) au groupe décodé.
3. `mesures(...)` : durées, probabilités a posteriori des têtes du modèle et mesures acoustiques sur un segment.
4. Fautes simulées : raccourcir, allonger, remplacer un segment par un autre (même récitateur), couper un rebond.

Lettres : texte Tanzil lu octet par octet, jamais retapé.
"""
from __future__ import annotations

import os
import unicodedata

import numpy as np

SR = 16000
TANZIL = os.environ.get('TANZIL', '/content/coran/tanzil-uthmani.tsv')

FATHA, DAMMA, KASRA = 'َ', 'ُ', 'ِ'
FATHATAN, DAMMATAN, KASRATAN = 'ً', 'ٌ', 'ٍ'
SHADDA, SUKUN = 'ّ', 'ْ'
SUP_ALEF, MADDAH, ZERO_R, ZERO_U = 'ٰ', 'ٓ', '۟', '۠'
MEEM_H, MEEM_L = 'ۢ', 'ۭ'
HAMZA_ABOVE = 'ٔ'
WASLA = 'ٱ'
VOY = {FATHA: 'َ', DAMMA: 'ُ', KASRA: 'ِ'}
TANWIN = {FATHATAN: 'َ', DAMMATAN: 'ُ', KASRATAN: 'ِ'}
HAMZAS = set('ءأإؤئ')
GORGE = set('ءأإؤئهعحغخ')
IKHFA = set('تثجدذزسشصضطظفقك')
QALQALA = set('قطبجد')
MADD_A, MADD_U, MADD_I = 'ا', 'ۥ', 'ۦ'
PAUSES = set('ۖۗۘۙۚۛۜ۞۩ۣ۪۫۬ۨ')
MAKHRAJ = {'ح': 'ه', 'ه': 'ح', 'ع': 'ء', 'ء': 'ع', 'ق': 'ك', 'ك': 'ق', 'ص': 'س', 'س': 'ص', 'ض': 'د', 'د': 'ض',
           'ث': 'س', 'ط': 'ت', 'ت': 'ط', 'ظ': 'ذ', 'ذ': 'ز', 'ز': 'ذ'}
MAKHRAJ_PAIRES = [('ح', 'ه'), ('ع', 'ء'), ('ق', 'ك'), ('ص', 'س'), ('ض', 'د'), ('ث', 'س'), ('ط', 'ت'), ('ظ', 'ذ'),
                  ('ذ', 'ز')]


def lire_tanzil(chemin=TANZIL):
    d = {}
    for l in open(chemin, encoding='utf-8'):
        l = l.rstrip('\n').lstrip('﻿')
        if not l.strip():
            continue
        sa, txt = l.split('\t', 1)
        s, a = sa.split(':')
        d[(int(s), int(a))] = txt.replace('﻿', '')  # BOM présent dans le champ texte de 1:1
    # la basmala en tête du 1er verset (sauf 1:1) n'est pas dans le fichier audio du verset : on la retire,
    # en la reconnaissant octet par octet à partir de 1:1 (jamais retapée)
    b = d.get((1, 1), '') + ' '
    for (s, a), txt in list(d.items()):
        if a == 1 and s != 1 and len(b) > 1 and txt.startswith(b):
            d[(s, a)] = txt[len(b):]
    return d


def unites(texte):
    """Découpe en unités (lettre de base + signes), avec l'indice du mot."""
    out = []
    w = 0
    for mot in texte.split(' '):
        if not mot or all(c in PAUSES for c in mot):
            continue
        cur = None
        for c in mot:
            if c in PAUSES:
                continue
            cat = unicodedata.category(c)
            if cat == 'Mn':
                if cur is not None:
                    cur['m'] += c
            else:
                cur = {'c': c, 'm': '', 'w': w}
                out.append(cur)
        w += 1
    return out


def _voy(u):
    for k, v in VOY.items():
        if k in u['m']:
            return v
    return None


def _tanw(u):
    for k, v in TANWIN.items():
        if k in u['m']:
            return v
    return None


def _silencieuse(u):
    return ZERO_R in u['m'] or ZERO_U in u['m']


def transcrire(texte):
    """Renvoie (jetons, occurrences). jetons : liste de [tok, set(ids d'occurrence)].
    occurrences : liste de dict(id, regle, detail, mot) ; l'ancre d'une occurrence est le premier jeton porteur."""
    U = unites(texte)
    toks, occ = [], []
    n = len(U)

    def nouvelle(regle, detail, i):
        occ.append({'id': len(occ), 'regle': regle, 'detail': detail, 'mot': U[i]['w']})
        return len(occ) - 1

    def emit(t, tags=(), k=1):
        for _ in range(k):
            toks.append([t, set(tags)])

    def prononcee(j):
        """Indice de la prochaine unité prononcée après j (saute les lettres muettes, l'alif de tanwīn...)."""
        j += 1
        while j < n and (_silencieuse(U[j]) or U[j]['c'] == 'ـ' and SUP_ALEF not in U[j]['m']):
            j += 1
        return j if j < n else None

    # dernière unité prononcée du verset (pour la pause)
    der = n - 1
    while der > 0 and (_silencieuse(U[der]) or U[der]['c'] in 'ۥۦ'):
        der -= 1
    tag_suivant = set()  # occurrence à porter par la prochaine consonne (idghām avec ghunna vers ي و)

    def derniere_voy():
        for t, _ in reversed(toks):
            if t in ('َ', 'ا'):
                return 'a'
            if t in ('ُ', 'ۥ'):
                return 'u'
            if t in ('ِ', 'ۦ'):
                return 'i'
            if t not in ('ل',):
                return None
        return 'a'

    for i, u in enumerate(U):
        c, m = u['c'], u['m']
        prev = U[i - 1] if i > 0 else None
        fin = i == der
        debut_mot = prev is None or prev['w'] != u['w']
        if _silencieuse(u):
            continue
        if c == 'ـ':
            if SUP_ALEF in m:
                emit(MADD_A, k=2)
            continue
        if c == WASLA:
            if i == 0:
                emit('ء'); emit('َ' if i + 1 < n and U[i + 1]['c'] == 'ل' else 'ِ')
            continue
        if c in 'ۥۦ':
            if not fin:
                emit(MADD_U if c == 'ۥ' else MADD_I, k=2)
            continue
        # voyelles longues
        madd = None
        if c == 'ا' and not _voy(u) and SHADDA not in m and HAMZA_ABOVE not in m:
            if prev is not None and _tanw(prev) == 'َ':
                madd = MADD_A if fin else ''
            elif prev is not None and (_voy(prev) == 'َ' or SUP_ALEF in prev['m'] or MADDAH in m):
                madd = MADD_A
            else:
                madd = ''
        elif c == 'ى' and not _voy(u) and SHADDA not in m:
            if SUP_ALEF in m or (prev is not None and (_voy(prev) == 'َ' or _tanw(prev) == 'َ')):
                madd = MADD_A if (fin or _tanw(prev or {'m': ''}) != 'َ') else ''
            elif prev is not None and _voy(prev) == 'ِ':
                madd = MADD_I
            else:
                madd = ''
        elif c in 'وي' and not _voy(u) and not _tanw(u) and SHADDA not in m and SUKUN not in m:
            if SUP_ALEF in m:
                madd = MADD_A
            elif prev is not None and _voy(prev) == ('ُ' if c == 'و' else 'ِ'):
                madd = MADD_U if c == 'و' else MADD_I
        if madd is not None:
            if madd:
                j = prononcee(i)
                # voyelle longue en fin de mot devant une hamzat al-waṣl : elle tombe (iltiqāʾ as-sākinayn)
                if j is not None and U[j]['w'] != u['w'] and U[j]['c'] == WASLA:
                    continue
                tags = set()
                if fin is False and j == der and U[j]['c'] not in 'اىۥۦ' and j is not None:
                    tags.add(nouvelle('madd_arid', U[der]['c'], i))
                emit(madd, tags, k=4 if MADDAH in m else 2)
            continue
        # consonnes
        t = 'ء' if (c in HAMZAS or c == 'ٔ') else ('ت' if c == 'ة' and not fin else ('ه' if c == 'ة' else c))
        if c == 'ا' and HAMZA_ABOVE in m:
            t = 'ء'
        v = _voy(u)
        tw = _tanw(u)
        sh = SHADDA in m
        nue = v is None and tw is None and not sh and SUKUN not in m
        j = prononcee(i)
        nu = U[j] if j is not None else None
        tags = set(tag_suivant)
        tag_suivant = set()
        k = 2 if sh else 1
        if nue and not fin and nu is not None:
            if SHADDA in nu['m']:
                # assimilation (lām shamsiyya, idghām kāmil) : la lettre se fond dans la suivante
                if c == 'ن':
                    tag_suivant.add(nouvelle('ghunna' if nu['c'] in 'نم' else 'idgham_sans', 'nun>' + nu['c'], i))
                elif c == 'م' and nu['c'] == 'م':
                    tag_suivant.add(nouvelle('ghunna', 'mim>م', i))
                continue
            if c == 'ن':
                if nu['c'] == 'ب':
                    emit('۾', {nouvelle('iqlab', 'nun', i)} | tags, 3); continue
                if nu['c'] in 'وي' and nu['w'] != u['w']:
                    tag_suivant.add(nouvelle('idgham_ghunna', 'nun>' + nu['c'], i)); continue
                if nu['c'] in IKHFA:
                    emit('ں', {nouvelle('ikhfa', 'nun>' + nu['c'], i)} | tags, 3); continue
            if c == 'م' and nu['c'] == 'ب':
                emit('۾', {nouvelle('ikhfa_shafawi', 'mim>ب', i)} | tags, 3); continue
        if t in 'نم' and sh:
            if not any(occ[o]['regle'] == 'ghunna' for o in tags):
                tags.add(nouvelle('ghunna', t + 'ّ', i))
            k = 4
        if c == 'ن' and SUKUN in m and nu is not None and nu['c'] in GORGE:
            tags.add(nouvelle('izhar', 'nun>' + nu['c'], i))
        if c in QALQALA and (SUKUN in m or fin) and not (sh and not fin):
            tags.add(nouvelle('qalqala_kubra' if fin else 'qalqala_sughra', c, i))
        # SAKIN_AUTRES=1 (étude « tajwīd fiable », 25/10) : occlusives sākines SANS qalqala (ت ك ء) au milieu du
        # verset, vrais exemples « sans rebond » chez les récitateurs certifiés. Désactivé par défaut (les numéros
        # d'occurrence des études précédentes ne changent pas).
        if os.environ.get('SAKIN_AUTRES') == '1' and t in 'تكء' and SUKUN in m and not fin and not sh:
            tags.add(nouvelle('sakin_occl', t, i))
        if c == 'ر' and not fin and (v or tw):
            tags.add(nouvelle('ra_tafkhim' if (v or tw) in ('َ', 'ُ') else 'ra_tarqiq', v or tw, i))
        if t in MAKHRAJ and not fin and v and not sh:
            tags.add(nouvelle('makhraj', t, i))
        # lām du nom « Allāh » (ٱللَّه، لِلَّه، بِٱللَّه، ٱللَّهُمَّ ; pas ٱللَّهْو ni ٱللَّهَب)
        if c == 'ل' and sh and v == 'َ' and nu is not None and nu['c'] == 'ه' and nu['w'] == u['w'] \
                and SUKUN not in nu['m']:
            mot = [x for x in U if x['w'] == u['w']]
            base = ''.join(x['c'] for x in mot).replace(WASLA, '')
            reste = base[base.find('لله') + 3:] if 'لله' in base else 'x'
            if reste in ('', 'م'):
                dv = derniere_voy()
                tags.add(nouvelle('lam_allah_tarqiq' if dv == 'i' else 'lam_allah_tafkhim', dv or '?', i))
                emit('ل', tags, 2); emit('َ'); emit(MADD_A, k=2)
                continue
        emit(t, tags, k)
        if fin:
            if c in QALQALA:
                emit('ڇ', {o for o in tags if occ[o]['regle'] == 'qalqala_kubra'})
            continue
        if v:
            emit(v)
            if SUP_ALEF in m:
                emit(MADD_A, k=4 if MADDAH in m else 2)
        if c in QALQALA and SUKUN in m:
            emit('ڇ', {o for o in tags if occ[o]['regle'] == 'qalqala_sughra'})
        if tw:
            emit(tw)
            # saute l'alif (ou le yāʾ) qui porte le tanwīn fatḥ
            nu2 = nu
            if tw == 'َ' and nu2 is not None and nu2['c'] in 'اى' and not _voy(nu2) and nu2['w'] == u['w']:
                j2 = prononcee(j)
                nu2 = U[j2] if j2 is not None else None
            if nu2 is None:
                continue
            if nu2['c'] == WASLA:
                emit('ن'); emit('ِ'); continue
            if nu2['c'] in GORGE:
                emit('ن', {nouvelle('izhar', 'tanwin>' + nu2['c'], i)})
            elif nu2['c'] in 'وي':
                tag_suivant.add(nouvelle('idgham_ghunna', 'tanwin>' + nu2['c'], i))
            elif nu2['c'] in 'نم':
                tag_suivant.add(nouvelle('ghunna', 'tanwin>' + nu2['c'], i))
            elif nu2['c'] in 'لر':
                tag_suivant.add(nouvelle('idgham_sans', 'tanwin>' + nu2['c'], i))
            elif nu2['c'] == 'ب':
                emit('۾', {nouvelle('iqlab', 'tanwin', i)}, 3)
            else:
                emit('ں', {nouvelle('ikhfa', 'tanwin>' + nu2['c'], i)}, 3)
    # līn ʿāriḍ : avant-dernière unité و/ي sākin après fatha, dernière = consonne
    if der >= 2:
        a, b = U[der - 1], U[der - 2]
        if a['c'] in 'وي' and SUKUN in a['m'] and _voy(b) == 'َ':
            o = nouvelle('lin_arid', a['c'], der - 1)
            # ancre : le dernier jeton و/ي émis
            for tk in reversed(toks):
                if tk[0] == a['c']:
                    tk[1].add(o); break
    return toks, occ


# ---------------------------------------------------------------- alignement
SIMILAIRES = [set('نںم۾'), {'َ', 'ا'}, {'ُ', 'ۥ'}, {'ِ', 'ۦ'}]


def groupes_attendus(toks):
    out = []
    for t, tags in toks:
        if out and out[-1]['tok'] == t:
            out[-1]['tags'] |= tags; out[-1]['n'] += 1
        else:
            out.append({'tok': t, 'tags': set(tags), 'n': 1})
    return out


def groupes_decodes(dec):
    out = []
    for d in dec:
        if out and out[-1]['tok'] == d['tok']:
            out[-1]['t1'] = d['t1']; out[-1]['n'] += 1; out[-1]['p'] = max(out[-1]['p'], d['p'])
        else:
            out.append({'tok': d['tok'], 't0': d['t0'], 't1': d['t1'], 'n': 1, 'p': d['p']})
    return out


def _cout(a, b):
    if a == b:
        return 0.0
    for s in SIMILAIRES:
        if a in s and b in s:
            return 0.6
    return 1.0


def aligner(att, dec):
    """att, dec : listes de groupes. Renvoie corr[i_att] = i_dec (égal ou substitué) ou None."""
    n, m = len(att), len(dec)
    D = np.zeros((n + 1, m + 1), dtype=np.float32)
    D[:, 0] = np.arange(n + 1); D[0, :] = np.arange(m + 1)
    for x in range(1, n + 1):
        ax = att[x - 1]['tok']
        for y in range(1, m + 1):
            D[x, y] = min(D[x - 1, y] + 1, D[x, y - 1] + 1, D[x - 1, y - 1] + _cout(ax, dec[y - 1]['tok']))
    corr = [None] * n
    x, y = n, m
    while x > 0 and y > 0:
        c = _cout(att[x - 1]['tok'], dec[y - 1]['tok'])
        if abs(D[x, y] - (D[x - 1, y - 1] + c)) < 1e-4:
            if c < 1.0:
                corr[x - 1] = y - 1
            x -= 1; y -= 1
        elif abs(D[x, y] - (D[x - 1, y] + 1)) < 1e-4:
            x -= 1
        else:
            y -= 1
    return corr, float(D[n, m]) / max(1, n)


def glouton(lp, inv, blank=0):
    best = lp.argmax(-1)
    ps = np.exp(lp.max(-1))
    out, prev = [], None
    for t, (i, p) in enumerate(zip(best.tolist(), ps.tolist())):
        if i != blank and i == prev:
            out[-1]['t1'] = t; out[-1]['p'] = max(out[-1]['p'], p)
        elif i != blank:
            out.append({'tok': inv[i], 't0': t, 't1': t, 'p': p})
        prev = i
    return out


# ---------------------------------------------------------------- acoustique
def bandes(seg, sr=SR):
    """Énergies par bandes (dB) d'un segment : nasalité = basses fréquences fortes, hautes faibles."""
    if len(seg) < 256:
        return None
    w = seg * np.hanning(len(seg))
    S = np.abs(np.fft.rfft(w, n=max(1024, 1 << int(np.ceil(np.log2(len(seg))))))) ** 2
    f = np.fft.rfftfreq(max(1024, 1 << int(np.ceil(np.log2(len(seg))))), 1 / sr)

    def e(a, b):
        return float(S[(f >= a) & (f < b)].sum()) + 1e-12
    tot = e(80, 5000)
    return {'bas_ratio': 10 * np.log10(e(80, 450) / tot), 'haut_ratio': 10 * np.log10(e(1000, 5000) / tot),
            'e_db': 10 * np.log10(tot / len(seg))}


def formants(seg, sr=SR, ordre=12):
    """F1, F2 médians (Hz) par LPC sur trames de 25 ms (rééchantillonné à 10 kHz)."""
    import scipy.signal as ss
    from librosa import lpc
    if len(seg) < int(0.05 * sr):
        return None
    y = ss.resample_poly(seg, 5, 8).astype(np.float64)  # 16 k -> 10 k
    y = np.append(y[0], y[1:] - 0.97 * y[:-1])
    L, H = 250, 100
    F1, F2 = [], []
    for s in range(0, len(y) - L, H):
        fr = y[s:s + L] * np.hamming(L)
        if np.sum(fr ** 2) < 1e-6:
            continue
        try:
            a = lpc(fr, order=ordre)
        except Exception:
            continue
        r = [z for z in np.roots(a) if np.imag(z) > 0]
        fq = sorted((np.angle(z) * 10000 / (2 * np.pi), -np.log(abs(z)) * 10000 / np.pi) for z in r)
        fq = [f for f, bw in fq if f > 150 and bw < 500]
        if len(fq) >= 2:
            F1.append(fq[0]); F2.append(fq[1])
    if not F2:
        return None
    return float(np.median(F1)), float(np.median(F2))


def energie_db(x, sr=SR, pas=0.005, fen=0.015):
    h, L = int(pas * sr), int(fen * sr)
    if len(x) < L:
        return np.array([-120.0])
    n = 1 + (len(x) - L) // h
    idx = np.arange(L)[None, :] + h * np.arange(n)[:, None]
    return 10 * np.log10(np.mean(x[idx] ** 2, axis=1) + 1e-10)


# ---------------------------------------------------------------- fautes simulées
def _fondu(a, b, f):
    if f <= 0 or len(a) < f or len(b) < f:
        return np.concatenate([a, b])
    r = np.linspace(0, 1, f, dtype=np.float32)
    mid = a[-f:] * (1 - r) + b[:f] * r
    return np.concatenate([a[:-f], mid, b[f:]])


def raccourcir(x, t0, t1, part):
    """Retire la part `part` du milieu de [t0, t1] (s)."""
    a, b = int(t0 * SR), int(t1 * SR)
    cut = int((b - a) * part)
    c0 = a + ((b - a) - cut) // 2
    return _fondu(x[:c0], x[c0 + cut:], int(0.008 * SR)).astype(np.float32)


def remplacer(x, t0, t1, seg):
    """Remplace [t0, t1] par seg (fondus de 8 ms)."""
    a, b = int(t0 * SR), int(t1 * SR)
    f = int(0.008 * SR)
    seg = seg.astype(np.float32)
    # égalise le niveau sur celui du segment remplacé
    r0 = np.sqrt(np.mean(x[a:b] ** 2) + 1e-9); r1 = np.sqrt(np.mean(seg ** 2) + 1e-9)
    seg = seg * float(np.clip(r0 / r1, 0.3, 3.0))
    return _fondu(_fondu(x[:a + f], seg, f), x[b - f:], f).astype(np.float32)


def inserer(x, t, seg):
    a = int(t * SR)
    f = int(0.008 * SR)
    return _fondu(_fondu(x[:a + f], seg.astype(np.float32), f), x[a - f:] if a - f > 0 else x, f).astype(np.float32)


def allonger(x, t0, t1, facteur):
    """Allonge [t0, t1] par répétition de tranches de 20 ms avec fondus (murmure nasal stationnaire)."""
    a, b = int(t0 * SR), int(t1 * SR)
    seg = x[a:b]
    if len(seg) < int(0.03 * SR):
        return x
    cible = int(len(seg) * facteur)
    mid = seg[len(seg) // 4: 3 * len(seg) // 4]
    out = seg[:len(seg) // 2]
    f = int(0.006 * SR)
    while len(out) < cible - len(seg) // 2:
        out = _fondu(out, mid, f)
    out = _fondu(out, seg[len(seg) // 2:], f)
    return _fondu(_fondu(x[:a + f], out, f), x[b - f:], f).astype(np.float32)
