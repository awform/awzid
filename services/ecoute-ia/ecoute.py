"""
Awzid — A5 « l'IA qui écoute la récitation » : SERVICE D'ÉCOUTE (CPU), joignable par l'API seulement (réseau
Docker interne, aucun port publié).

  GET  /sante                          -> {"pret": bool, "modele": ..., "en_cours": n, "attente": n}
  POST /ecouter                        corps = audio (webm, ogg, mp4, mp3, wav), ≤ 5 min
                                       -> {"mots": [{w, conf, t0, t1}], "voix": [[t0, t1]], "duree", "calcul"}
  POST /direct/{sid}                   corps = PCM 16 bits mono 16 kHz (morceau du suivi en direct)
                                       -> {"mots": [nouveaux mots sûrs], "partiel": [mots du passage en cours],
                                           "voix": [...], "t": durée reçue}
  DELETE /direct/{sid}                 fin du suivi : l'audio de la séance est effacé de la mémoire

Garanties (cahier des charges A5) :
  - la voix n'est JAMAIS écrite : audio en mémoire seulement (memfd anonyme pour ffmpeg), effacé à la fin de
    chaque appel ; séances du direct effacées à la fin, après 20 s sans morceau, ou à 5 min ;
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

MAX_S = float(os.environ.get('ECOUTE_MAX_S', '300'))
CONCURRENCE = int(os.environ.get('ECOUTE_CONCURRENCE', '2'))
FILE_MAX = int(os.environ.get('ECOUTE_FILE', '8'))
THREADS = int(os.environ.get('ECOUTE_THREADS', '4'))
DIRECT_MAX = int(os.environ.get('ECOUTE_DIRECT_MAX', '6'))
DIRECT_INACTIF_S = 20.0
MAX_OCTETS = int(os.environ.get('ECOUTE_MAX_OCTETS', str(12 * 1024 * 1024)))
# modèle factice (tests sans modèle) : renvoie des mots fixés par l'en-tête x-essai-mots — JAMAIS en production
ESSAI = os.environ.get('ECOUTE_ESSAI') == '1'

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
etat = {'modele': None, 'nom': os.environ.get('ECOUTE_NOM', 'nemo'), 'en_cours': 0, 'attente': 0}
_sem: asyncio.Semaphore | None = None


class ModeleEssai:
    nom = 'essai'

    def __init__(self):
        self.mots: list[str] = []

    def transcrire(self, x: np.ndarray) -> list[dict]:
        n = max(1, len(self.mots))
        d = len(x) / asr.SR
        return [{'w': w, 'conf': 0.95, 't0': round(k * d / n, 2), 't1': round((k + 0.8) * d / n, 2)}
                for k, w in enumerate(self.mots)]


def _charger():
    etat['modele'] = ModeleEssai() if ESSAI else asr.charger(etat['nom'], THREADS)


@app.on_event('startup')
async def demarrage():
    global _sem
    _sem = asyncio.Semaphore(CONCURRENCE)
    threading.Thread(target=_charger, daemon=True).start()
    asyncio.get_event_loop().create_task(_purge())


def _erreur(code: int, cle: str) -> JSONResponse:
    return JSONResponse({'error': {'code': cle}}, status_code=code)


async def _calcul(fn, *args):
    """File de traitement : refuse au-delà de FILE_MAX en attente (l'appli dit « réessaie dans un instant »)."""
    if etat['attente'] >= FILE_MAX:
        return None
    etat['attente'] += 1
    try:
        await _sem.acquire()
    finally:
        etat['attente'] -= 1
    etat['en_cours'] += 1
    try:
        return await asyncio.get_event_loop().run_in_executor(None, fn, *args)
    finally:
        etat['en_cours'] -= 1
        _sem.release()


@app.get('/sante')
async def sante():
    return {'pret': etat['modele'] is not None, 'modele': etat['nom'] if not ESSAI else 'essai',
            'en_cours': etat['en_cours'], 'attente': etat['attente'], 'max_s': MAX_S,
            'direct': len(_seances)}


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
    try:
        r = await _calcul(asr.ecouter, etat['modele'], data, MAX_S)
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

    def __init__(self):
        # SEULEMENT le passage pas encore transcrit : un passage transcrit est effacé aussitôt
        self.buf = np.zeros(0, dtype=np.float32)
        self.decal = 0  # échantillons déjà transcrits (et effacés) depuis le début de la séance
        self.total = 0  # échantillons reçus (limite de 5 min)
        self.vu = time.monotonic()
        self.verrou = asyncio.Lock()

    def effacer(self):
        self.buf = np.zeros(0, dtype=np.float32)


_seances: dict[str, Seance] = {}


async def _purge():
    while True:
        await asyncio.sleep(5)
        now = time.monotonic()
        for sid in [k for k, s in _seances.items() if now - s.vu > DIRECT_INACTIF_S]:
            _seances.pop(sid).effacer()


def _coupe(x: np.ndarray, sr: int) -> int | None:
    """Fin du premier passage terminé par une pause (≥ 350 ms après ≥ 1 s de voix), ou coupe forcée au point le
    plus calme après 12 s sans pause. Renvoie l'échantillon de coupe (milieu de la pause) ou None."""
    z = asr.zones_de_voix(x, sr)
    if not z:
        return None
    for (a, b), (c, _) in zip(z, z[1:]):
        if c - b >= 0.35 and b - z[0][0] >= 1.0:
            return int((b + c) / 2 * sr)
    fin_voix = len(x) / sr
    if z[-1][1] < fin_voix - 0.5 and z[-1][1] - z[0][0] >= 1.0:  # silence final : passage terminé
        return int(min(fin_voix, z[-1][1] + 0.3) * sr)
    if fin_voix > 12:
        hop = sr // 50
        seg = x[int(8 * sr): int(12 * sr)]
        n = len(seg) // hop
        e = np.mean(seg[: n * hop].reshape(n, hop) ** 2, axis=1)
        return int(8 * sr) + int(np.argmin(e)) * hop
    return None


def _direct(s: Seance, morceau: np.ndarray) -> dict:
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
        for w in etat['modele'].transcrire(seg) if len(seg) > sr // 2 else []:
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
        rapide = getattr(etat['modele'], 'transcrire_rapide', etat['modele'].transcrire)
        partiel = [{**w, 't0': round(w['t0'] + off, 2), 't1': round(w['t1'] + off, 2)}
                   for w in rapide(s.buf)]
    return {'mots': mots, 'partiel': partiel, 'voix': voix, 't': round(s.total / sr, 2)}


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
        if len(_seances) >= DIRECT_MAX:
            return _erreur(503, 'occupe')
        s = _seances[sid] = Seance()
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
        r = await _calcul(_direct, s, morceau)
    if r is None:
        return _erreur(503, 'occupe')
    return r


@app.delete('/direct/{sid}')
async def fin_direct(sid: str):
    s = _seances.pop(sid, None)
    if s:
        s.effacer()
    return {'ok': True}
