"""
Awzid — A5 « l'IA qui écoute la récitation » : SERVICE D'ÉCOUTE (CPU), joignable par l'API seulement (réseau
Docker interne, aucun port publié).

  GET  /sante                          -> {"pret": bool, "modele": ..., "en_cours": n, "attente": n}
  POST /ecouter                        corps = audio (webm, ogg, mp4, mp3, wav), ≤ 5 min
                                       -> {"mots": [{w, conf, t0, t1}], "voix": [[t0, t1]], "duree", "calcul"}
  POST /ecouter?mode=retrouver         « Retrouve ce verset » (shazam_coran) : 5 à 15 s, ≤ 20 s ; 0,5 s de silence
                                       autour, DEUX lectures (RNN-T et CTC, un seul encodeur) ; moins de 3 s de
                                       voix : aucune lecture -> {"mots", "mots_ctc", "voix", "voix_s", "duree", ...}
  POST /direct/{sid}                   corps = PCM 16 bits mono 16 kHz (morceau du suivi en direct)
                                       -> {"mots": [nouveaux mots sûrs], "partiel": [mots du passage en cours],
                                           "voix": [...], "t": durée reçue}
  POST /direct/{sid}?mode=suivi        suivi de la récitation « comme Tarteel » (shazam_coran) : chaque passage fini
                                       est relu AVEC SON CONTEXTE (4 s avant, le passage suivant après) ; renvoie les
                                       mots « stables » (deux lectures) du passage précédent et les mots provisoires
                                       du dernier (voir `_suivi`)
  DELETE /direct/{sid}                 fin du suivi : l'audio de la séance est effacé de la mémoire

Garanties (cahier des charges A5) :
  - la voix n'est JAMAIS écrite : audio en mémoire seulement (memfd anonyme pour ffmpeg), effacé à la fin de
    chaque appel ; séances du direct effacées à la fin, après 20 s sans morceau, ou à 5 min (en mode suivi, la
    séance garde EN MÉMOIRE le dernier passage et 4 s avant lui, pour le relire avec son contexte) ;
  - aucun journal ne contient d'audio ni de mot entendu (journal d'accès coupé, messages sans contenu) ;
  - file de traitement : `ECOUTE_CONCURRENCE` calculs à la fois, `ECOUTE_FILE` en attente au plus, sinon 503 ;
  - refus au-delà de `ECOUTE_MAX_S` (300 s).
Ce service ne compare rien au texte : il renvoie des mots ; l'API compare avec Tanzil (@awform/hifz).
"""
from __future__ import annotations

import asyncio
import os
import threading
import time
import uuid

import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

import asr
import contraint

MAX_S = float(os.environ.get('ECOUTE_MAX_S', '300'))
CONCURRENCE = int(os.environ.get('ECOUTE_CONCURRENCE', '2'))
FILE_MAX = int(os.environ.get('ECOUTE_FILE', '8'))
THREADS = int(os.environ.get('ECOUTE_THREADS', '4'))
DIRECT_MAX = int(os.environ.get('ECOUTE_DIRECT_MAX', '6'))
DIRECT_INACTIF_S = 20.0
MAX_OCTETS = int(os.environ.get('ECOUTE_MAX_OCTETS', str(12 * 1024 * 1024)))
#: « Retrouve ce verset » : l'appli enregistre 15 s au plus
RETROUVER_MAX_S = 20.0
# modèle factice (tests sans modèle) : renvoie des mots fixés par l'en-tête x-essai-mots — JAMAIS en production
ESSAI = os.environ.get('ECOUTE_ESSAI') == '1'

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
etat = {'modele': None, 'nom': os.environ.get('ECOUTE_NOM', 'nemo_rnnt'), 'en_cours': 0, 'attente': 0,
        'charges': 0}
# RÉSERVE de modèles : un modèle par calcul simultané (NeMo `transcribe()` n'est pas sûr entre deux fils :
# constaté le 06/10/2026, 3 envois simultanés -> « Cannot unfreeze partially »). ≈ 1,2 Go par modèle.
_reserve: asyncio.Queue | None = None


class ModeleEssai:
    nom = 'essai'

    def __init__(self):
        self.mots: list[str] = []

    def transcrire(self, x: np.ndarray) -> list[dict]:
        n = max(1, len(self.mots))
        d = len(x) / asr.SR
        return [{'w': w, 'conf': 0.95, 't0': round(k * d / n, 2), 't1': round((k + 0.8) * d / n, 2)}
                for k, w in enumerate(self.mots)]


def _charger(boucle: asyncio.AbstractEventLoop):
    essai = ModeleEssai() if ESSAI else None
    for _ in range(CONCURRENCE):
        m = essai or asr.charger(etat['nom'], THREADS)
        etat['modele'] = etat['modele'] or m
        etat['charges'] += 1
        boucle.call_soon_threadsafe(_reserve.put_nowait, m)


@app.on_event('startup')
async def demarrage():
    global _reserve
    _reserve = asyncio.Queue()
    threading.Thread(target=_charger, args=(asyncio.get_event_loop(),), daemon=True).start()
    asyncio.get_event_loop().create_task(_purge())


def _erreur(code: int, cle: str) -> JSONResponse:
    return JSONResponse({'error': {'code': cle}}, status_code=code)


async def _calcul(fn, *args):
    """File de traitement : un modèle libre de la réserve par calcul ; refuse au-delà de FILE_MAX en attente
    (l'appli dit « réessaie dans un instant »). `fn(modele, *args)`."""
    if etat['attente'] >= FILE_MAX:
        return None
    etat['attente'] += 1
    try:
        modele = await _reserve.get()
    finally:
        etat['attente'] -= 1
    etat['en_cours'] += 1
    try:
        return await asyncio.get_event_loop().run_in_executor(None, fn, modele, *args)
    finally:
        etat['en_cours'] -= 1
        _reserve.put_nowait(modele)


@app.get('/sante')
async def sante():
    return {'pret': etat['modele'] is not None, 'modele': etat['nom'] if not ESSAI else 'essai',
            'modeles_charges': etat['charges'], 'en_cours': etat['en_cours'], 'attente': etat['attente'],
            'max_s': MAX_S, 'direct': len(_seances)}


@app.post('/ecouter')
async def ecouter(req: Request):
    if etat['modele'] is None:
        return _erreur(503, 'demarrage')
    data = await req.body()
    if len(data) > MAX_OCTETS:
        return _erreur(413, 'trop_long')
    if ESSAI:
        etat['modele'].mots = [w for w in req.headers.get('x-essai-mots', '').split(',') if w]
        etat['modele'].mots = [bytes.fromhex(w).decode('utf-8') for w in etat['modele'].mots]
    retrouver = req.query_params.get('mode') == 'retrouver'
    try:
        if retrouver:
            r = await _calcul(asr.retrouver, data, RETROUVER_MAX_S)
        else:
            r = await _calcul(asr.ecouter, data, MAX_S)
    except asr.AudioInvalide as e:
        return _erreur(413 if str(e) == 'trop_long' else 400, 'audio_' + str(e))
    finally:
        del data
    if r is None:
        return _erreur(503, 'occupe')
    return r


# ---------------------------------------------------------------- suivi en direct (prototype)

class Seance:
    """Audio d'une séance de suivi en direct, EN MÉMOIRE seulement. Découpée aux pauses (waqf) : chaque passage
    terminé par un silence est transcrit une fois (mots « sûrs ») ; le passage en cours est transcrit à part
    (mots « partiels », jamais utilisés pour signaler une erreur)."""

    def __init__(self, suivi: bool = False):
        # SEULEMENT le passage pas encore transcrit : un passage transcrit est effacé aussitôt
        self.buf = np.zeros(0, dtype=np.float32)
        self.decal = 0  # échantillons déjà transcrits (et effacés) depuis le début de la séance
        self.total = 0  # échantillons reçus (limite de 5 min)
        self.vu = time.monotonic()
        self.verrou = asyncio.Lock()
        # mode suivi : le DERNIER passage fini et 4 s avant lui (relus avec le passage suivant), rien d'autre
        self.suivi = suivi
        self.pause = SUIVI_PAUSE_S if suivi else PAUSE_S
        self.coupe = SUIVI_COUPE_S if suivi else COUPE_S
        self.ctx = np.zeros(0, dtype=np.float32)
        self.fenetre = False  # mode « fenêtre glissante » (voir `_fenetre`)
        self.prov0 = 0  # début (échantillons) du dernier passage fini, encore provisoire
        # texte attendu (mode fenêtre, `/direct/{sid}/attendu`) : décodage contraint (`contraint.py`) ; écarts vus
        self.attendu: dict | None = None
        self.texte: dict = {}
        self.pos = 0
        self.graphes: dict = {}

    def effacer(self):
        self.buf = np.zeros(0, dtype=np.float32)
        self.ctx = np.zeros(0, dtype=np.float32)
        self.attendu = None
        self.graphes = {}


_seances: dict[str, Seance] = {}
#: textes attendus reçus avant le premier morceau de la séance : sid -> (instant, texte)
_attendus: dict[str, tuple[float, dict]] = {}


async def _purge():
    while True:
        await asyncio.sleep(5)
        now = time.monotonic()
        for sid in [k for k, s in _seances.items() if now - s.vu > DIRECT_INACTIF_S]:
            _seances.pop(sid).effacer()
        for sid in [k for k, (t, _) in _attendus.items() if now - t > 60]:
            _attendus.pop(sid, None)


PAUSE_S = float(os.environ.get('ECOUTE_PAUSE_S', '0.6'))
COUPE_S = float(os.environ.get('ECOUTE_COUPE_S', '25'))
# mode suivi : passages plus courts (le contexte relu compense les coupes) -> erreurs montrées plus tôt
SUIVI_PAUSE_S = float(os.environ.get('ECOUTE_SUIVI_PAUSE_S', '0.35'))
SUIVI_COUPE_S = float(os.environ.get('ECOUTE_SUIVI_COUPE_S', '10'))


def _coupe(x: np.ndarray, sr: int, pause_s: float | None = None, coupe_s: float | None = None) -> int | None:
    """Fin du premier passage terminé par une pause (≥ PAUSE_S après ≥ 1 s de voix), ou coupe forcée au point le
    plus calme après COUPE_S sans pause. Renvoie l'échantillon de coupe (milieu de la pause) ou None."""
    pause_s = PAUSE_S if pause_s is None else pause_s
    coupe_s = COUPE_S if coupe_s is None else coupe_s
    z = asr.zones_de_voix(x, sr)
    if not z:
        return None
    for (a, b), (c, _) in zip(z, z[1:]):
        if c - b >= pause_s and b - z[0][0] >= 1.0:
            return int((b + c) / 2 * sr)
    fin_voix = len(x) / sr
    if z[-1][1] < fin_voix - max(0.5, pause_s) and z[-1][1] - z[0][0] >= 1.0:  # silence final : passage fini
        return int(min(fin_voix, z[-1][1] + 0.3) * sr)
    if fin_voix > coupe_s:
        hop = sr // 50
        d = min(4.0, coupe_s / 2)
        seg = x[int((coupe_s - d) * sr): int(coupe_s * sr)]
        n = len(seg) // hop
        e = np.mean(seg[: n * hop].reshape(n, hop) ** 2, axis=1)
        return int((coupe_s - d) * sr) + int(np.argmin(e)) * hop
    return None


def _direct(modele, s: Seance, morceau: np.ndarray) -> dict:
    s.buf = np.concatenate([s.buf, morceau])
    s.total += len(morceau)
    sr = asr.SR
    mots: list[dict] = []
    voix: list[list[float]] = []
    while True:
        cut = _coupe(s.buf, sr)
        if cut is None:
            break
        off = s.decal / sr
        seg = s.buf[:cut]
        for w in modele.transcrire(seg) if len(seg) > sr // 2 else []:
            mots.append({**w, 't0': round(w['t0'] + off, 2), 't1': round(w['t1'] + off, 2)})
        # zones de voix du passage fini : distinguer un mot oublié (silence) d'un mot mal entendu (doute)
        voix += [[round(a + off, 2), round(b + off, 2)] for a, b in asr.zones_de_voix(seg, sr)]
        # passage transcrit : son audio est effacé tout de suite
        s.buf = s.buf[cut:].copy()
        s.decal += cut
        del seg
    partiel = []
    if len(s.buf) > int(0.6 * sr) and asr.zones_de_voix(s.buf, sr):
        off = s.decal / sr
        # passage en cours : décodage rapide (tête CTC) — il ne sert qu'à placer le mot en cours
        rapide = getattr(modele, 'transcrire_rapide', modele.transcrire)
        partiel = [{**w, 't0': round(w['t0'] + off, 2), 't1': round(w['t1'] + off, 2)}
                   for w in rapide(s.buf)]
    return {'mots': mots, 'partiel': partiel, 'voix': voix, 't': round(s.total / sr, 2)}


#: contexte gauche gardé avant le dernier passage (secondes)
CTX_GAUCHE_S = float(os.environ.get('ECOUTE_CTX_GAUCHE_S', '4'))


def _milieu(w: dict) -> float:
    return (w['t0'] + w['t1']) / 2


def _suivi(modele, s: Seance, morceau: np.ndarray, partiel_ok: bool = True) -> dict:
    """SUIVI DE LA RÉCITATION « comme Tarteel » (interrupteur shazam_coran). Mesuré en A5 : un passage transcrit SEUL
    (coupé à une pause, sans contexte) est moins bien reconnu (7 fausses alertes en 12 séances). Ici, à la fin de
    chaque passage N, on relit la fenêtre [4 s avant N-1, passage N-1, passage N] + 0,5 s de silence autour, en DEUX
    lectures (RNN-T et CTC, un seul encodeur) :
      - les mots du passage N-1, relus avec leur contexte des deux côtés, deviennent « stables » (les seuls sur
        lesquels l'appli peut signaler une erreur, et seulement si les deux lectures la voient) ;
      - les mots du passage N restent « provisoires » (ils dévoilent le texte, ils ne signalent rien).
    Les mots sont rattachés à un passage par leur milieu (les coupes tombent au milieu des pauses).
    Mémoire : le passage N et 4 s avant lui seulement ; le reste est effacé aussitôt."""
    s.buf = np.concatenate([s.buf, morceau])
    s.total += len(morceau)
    sr = asr.SR
    stables: list[dict] = []
    stables_ctc: list[dict] = []
    provisoires: list[dict] | None = None
    provisoires_ctc: list[dict] | None = None
    voix: list[list[float]] = []
    zone: list[float] | None = None
    while True:
        cut = _coupe(s.buf, sr, s.pause, s.coupe)
        if cut is None:
            break
        seg = s.buf[:cut]
        seg0 = s.decal
        fen = np.concatenate([s.ctx, seg])
        fen0 = (seg0 - len(s.ctx)) / sr - asr.REMBOURRAGE_S  # instant (séance) du début de la fenêtre rembourrée
        r, c = asr.lecture_double(modele, asr.rembourrer(fen)) if len(fen) > sr // 2 else ([], [])
        r, c = asr.decaler(r, fen0), asr.decaler(c, fen0)
        a, b = s.prov0 / sr, seg0 / sr
        if len(s.ctx):  # le passage précédent, relu avec son contexte : stable
            stables += [w for w in r if a <= _milieu(w) < b]
            stables_ctc += [w for w in c if a <= _milieu(w) < b]
            zone = [round(a, 2), round(b, 2)] if zone is None else [zone[0], round(b, 2)]
        provisoires = [w for w in r if _milieu(w) >= b]
        provisoires_ctc = [w for w in c if _milieu(w) >= b]
        voix += [[round(x + b, 2), round(y + b, 2)] for x, y in asr.zones_de_voix(seg, sr)]
        # mémoire : le passage qui vient de finir et 4 s avant lui ; tout le reste est effacé
        garde = len(seg) + int(CTX_GAUCHE_S * sr)
        s.ctx = np.concatenate([s.ctx, seg])[-garde:].copy()
        s.prov0 = seg0
        s.buf = s.buf[cut:].copy()
        s.decal += cut
        del seg, fen
    partiel = []
    if partiel_ok and len(s.buf) > int(0.6 * sr) and asr.zones_de_voix(s.buf, sr):
        rapide = getattr(modele, 'transcrire_rapide', modele.transcrire)
        partiel = asr.decaler(rapide(s.buf), s.decal / sr)
    out = {'stables': stables, 'stables_ctc': stables_ctc, 'zone': zone, 'partiel': partiel, 'voix': voix,
           't': round(s.total / sr, 2)}
    if provisoires is not None:  # nouveau passage fini : il remplace les provisoires précédents
        out['provisoires'] = provisoires
        out['provisoires_ctc'] = provisoires_ctc
    return out


#: mode « fenêtre » : durée relue à chaque envoi (secondes) ; l'audio plus ancien est effacé aussitôt
FENETRE_S = float(os.environ.get('ECOUTE_FENETRE_S', '10'))


FENETRE_POIDS = int(os.environ.get('ECOUTE_FENETRE_POIDS', '3'))


def _fenetre(modele, s: Seance, morceau: np.ndarray) -> dict:
    """SUIVI PAR FENÊTRE GLISSANTE (mode `fenetre`, shazam_coran) : à chaque envoi (≥ 0,5 s d'audio), relecture des
    FENETRE_S dernières secondes (0,5 s de silence autour, deux lectures : RNN-T et CTC, un seul encodeur). Le service
    ne décide de rien : il renvoie les mots de la fenêtre avec leurs instants (secondes de la séance) ; l'appareil
    valide les mots par accord entre lectures successives (`FenetreSuivi`, @awform/hifz). Mémoire : la fenêtre
    seulement (rien de plus ancien), effacée à la fin de la séance."""
    sr = asr.SR
    s.total += len(morceau)
    s.buf = np.concatenate([s.buf, morceau])[-int(FENETRE_S * sr):].copy()
    t = s.total / sr
    debut = t - len(s.buf) / sr
    mots, ctc, voix = [], [], []
    if len(s.buf) > sr // 2:
        xr = asr.rembourrer(s.buf)
        d = debut - asr.REMBOURRAGE_S
        topk = getattr(modele, 'transcrire_double_topk', None) if (s.attendu and TEXTE) else None
        if topk is not None:
            r, c, tk = topk(xr, TEXTE_K)
            _texte(modele, s, tk, d, t)
        else:
            r, c = asr.lecture_double(modele, xr)
        mots, ctc = asr.decaler(r, d), asr.decaler(c, d)
        voix = [[round(a + d, 2), round(b + d, 2)] for a, b in asr.zones_de_voix(xr)]
    out = {'t': round(t, 2), 'fenetre': True, 'mots': mots, 'mots_ctc': ctc, 'voix': voix}
    if s.attendu:
        out['ecarts_texte'] = sorted(s.texte.values(), key=lambda e: (e['i'], e['fin'], e['type']))
    return out


#: décodage contraint par le texte attendu (phase 3 de « Tarteel titan ») : ECOUTE_TEXTE=0 le coupe
TEXTE = os.environ.get('ECOUTE_TEXTE', '1') != '0'
TEXTE_K = 16  # meilleurs jetons CTC gardés par trame
TEXTE_AVANT, TEXTE_APRES = 30, 40  # mots attendus mis dans le graphe autour du dernier mot reconnu
TYPES_TEXTE = {'ajoute': 'ajoute', 'saute': 'verset_saute', 'oublie': 'oublie'}
_sp: dict = {}


def _texte(modele, s: Seance, tk, d: float, t: float) -> None:
    """Décodage contraint de la fenêtre lue (top-k de la tête CTC) contre le texte attendu autour de la position : ajoute
    les écarts sûrs (mot ajouté, verset sauté) à `s.texte`. Ne lève jamais : en cas de souci, la lecture reste celle d'avant."""
    try:
        if 'sp' not in _sp:
            _sp['sp'] = modele.m.tokenizer.tokenizer  # SentencePiece du modèle
            _sp['cls'] = contraint.classes(_sp['sp'])
        sp, cls, R = _sp['sp'], _sp['cls'], contraint.REGLAGES
        A = s.attendu
        W = len(A['mots'])
        a = max(0, s.pos - TEXTE_AVANT)
        b = min(W, s.pos + TEXTE_APRES)
        g = s.graphes.get((a, b))
        if g is None:
            jetons = [contraint.variantes(sp, w, int(R['nvar']), cls) for w in A['mots'][a:b]]
            g = s.graphes[(a, b)] = contraint.Graphe(jetons, A['versets'][a:b], sp.get_piece_size(), A['fac'][a:b])
        ids, lp = tk[0].astype(np.int64), tk[1].astype(np.float32)
        blanc = sp.get_piece_size()
        E, f, f0, voix = contraint.emissions(ids, lp, blanc, blanc, R, cls)
        chemin, entrees = contraint.viterbi(g, E, f, f0, R)
        t_fin = min(len(chemin) - 1, int((t - d) / contraint.FRAME))
        for typ, i, fin, _ in contraint.ecarts(g, chemin, entrees, voix, R, t_fin):
            k = (typ, i + a, fin + a)
            if k not in s.texte:
                s.texte[k] = {'type': TYPES_TEXTE[typ], 'i': i + a, 'fin': fin + a}
        lus = [c[1] for c in chemin if c[0] == 'w']
        if lus:
            s.pos = max(s.pos, max(lus) + a)
    except Exception as e:  # noqa: BLE001
        print('texte attendu : décodage impossible', type(e).__name__, flush=True)


@app.post('/direct/{sid}')
async def direct(sid: str, req: Request):
    if etat['modele'] is None:
        return _erreur(503, 'demarrage')
    try:
        uuid.UUID(sid)
    except ValueError:
        return _erreur(400, 'seance')
    s = _seances.get(sid)
    if s is None:
        # le mode est fixé à la création de la séance
        mode = req.query_params.get('mode')
        # une séance « fenêtre » relit 10 s toutes les 0,5 s : elle pèse FENETRE_POIDS séances ordinaires (mesuré le
        # 01/11/2026 : 1,1 s de calcul par seconde d'audio contre 0,3 s pour le mode passages)
        poids = FENETRE_POIDS if mode == 'fenetre' else 1
        charge = sum(FENETRE_POIDS if x.fenetre else 1 for x in _seances.values())
        if charge + poids > DIRECT_MAX:
            return _erreur(503, 'occupe')
        s = _seances[sid] = Seance(suivi=mode == 'suivi')
        s.fenetre = mode == 'fenetre'
        a = _attendus.pop(sid, None)
        if a and s.fenetre:
            s.attendu = a[1]
    s.vu = time.monotonic()
    data = await req.body()
    if len(data) % 2 or len(data) > 10 * 2 * asr.SR:
        return _erreur(400, 'morceau')
    morceau = np.frombuffer(data, dtype='<i2').astype(np.float32) / 32768.0
    del data
    if (s.total + len(morceau)) / asr.SR > MAX_S:
        _seances.pop(sid, None)
        s.effacer()
        return _erreur(413, 'trop_long')
    if ESSAI:
        etat['modele'].mots = [bytes.fromhex(w).decode('utf-8')
                               for w in req.headers.get('x-essai-mots', '').split(',') if w]
    async with s.verrou:
        r = await _calcul(_fenetre if s.fenetre else _suivi if s.suivi else _direct, s, morceau)
    if r is None:
        return _erreur(503, 'occupe')
    return r


MAX_MOTS_ATTENDUS = 2000


@app.post('/direct/{sid}/attendu')
async def attendu(sid: str, req: Request):
    """Texte attendu d'une séance « fenêtre » (mots Tanzil exacts, rang = rang du mot dans l'appli ; verset de chaque mot ;
    mots facultatifs) : sert seulement au décodage contraint, en mémoire, effacé avec la séance."""
    try:
        uuid.UUID(sid)
        j = await req.json()
        mots, versets = j['mots'], j['versets']
        fac = j.get('fac') or [0] * len(mots)
        ok = (isinstance(mots, list) and 0 < len(mots) <= MAX_MOTS_ATTENDUS and isinstance(versets, list)
              and len(versets) == len(mots) and len(fac) == len(mots)
              and all(isinstance(w, str) and 0 < len(w) <= 64 for w in mots)
              and all(isinstance(v, str) and len(v) <= 8 for v in versets))
    except Exception:  # noqa: BLE001
        ok = False
    if not ok:
        return _erreur(400, 'attendu')
    texte = {'mots': mots, 'versets': versets, 'fac': [1 if x else 0 for x in fac]}
    s = _seances.get(sid)
    if s is not None and s.fenetre:
        s.attendu, s.texte, s.pos, s.graphes = texte, {}, 0, {}
    else:
        _attendus[sid] = (time.monotonic(), texte)
    return {'ok': True}


@app.delete('/direct/{sid}')
async def fin_direct(sid: str):
    _attendus.pop(sid, None)
    s = _seances.pop(sid, None)
    if s:
        s.effacer()
    return {'ok': True}


# ---------------------------------------------------------------- mode « madd » (25/10/2026) — FERMÉ par défaut
# Indication « trop court » sur les madd longs (étude ETUDE_TAJWID.md) : route /madd et son modèle, installés SEULEMENT si
# ECOUTE_MADD=1. Sans cette variable (production aujourd'hui), ce service est strictement inchangé : rien n'est importé.
if os.environ.get('ECOUTE_MADD') == '1':
    import madd_route

    madd_route.installer(app, ESSAI)
