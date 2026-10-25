"""
Awzid — MODE « MADD » du service d'écoute (25/10/2026). Installé SEULEMENT si ECOUTE_MADD=1 (voir la dernière ligne d'ecoute.py) : sans
cette variable, ce module n'est jamais importé et le service d'écoute de production est strictement inchangé (aucune route, aucun modèle
de plus en mémoire).

  GET  /madd/sante    -> {"pret": bool, "modele": ...}
  POST /madd?k=&type=&n=   corps = 4 octets (longueur de la référence, grand-boutiste) + audio de RÉFÉRENCE (récitation d'Ayyūb du
                       verset) + audio de l'ÉLÈVE (le verset seul, ≤ 60 s)
                       -> {"indication": "trop_court" | null, "raison": code}

Garanties : l'audio de l'élève reste en mémoire (memfd pour ffmpeg, comme /ecouter) et est effacé à la fin de l'appel ; rien sur disque,
rien dans les journaux (ni audio, ni phonèmes, ni mesure) ; un seul calcul à la fois, file courte, sinon 503. La décision est dans
madd.py (une indication ou rien, jamais une note).
"""
from __future__ import annotations

import asyncio
import hashlib
import os
import struct
import threading
from collections import OrderedDict

from fastapi import Request
from fastapi.responses import JSONResponse

import asr
import madd

MAX_S = float(os.environ.get('MADD_MAX_S', '60'))
MAX_OCTETS = int(os.environ.get('MADD_MAX_OCTETS', str(4 * 1024 * 1024)))
FILE_MAX = int(os.environ.get('MADD_FILE', '4'))
# références déjà décodées (phonèmes du verset d'Ayyūb, jamais d'audio de l'élève)
CACHE_MAX = 128
# modèle factice (tests de l'API sans modèle) : l'en-tête x-essai-madd décide — JAMAIS en production
ESSAI = os.environ.get('ECOUTE_MADD_ESSAI') == '1'


def _erreur(code: int, cle: str) -> JSONResponse:
    return JSONResponse({'error': {'code': cle}}, status_code=code)


def decouper(corps: bytes) -> tuple[bytes, bytes] | None:
    """(référence, élève) depuis le corps cadré ; None si le cadrage est invalide."""
    if len(corps) < 5:
        return None
    (n,) = struct.unpack('>I', corps[:4])
    if n == 0 or 4 + n >= len(corps):
        return None
    return corps[4:4 + n], corps[4 + n:]


def installer(app, essai_service: bool = False) -> dict:
    etat = {'modele': None, 'attente': 0, 'erreur': None}
    verrou = asyncio.Semaphore(1)
    cache: OrderedDict[str, list[dict]] = OrderedDict()

    def charger():
        if ESSAI or essai_service:
            etat['modele'] = 'essai'
            return
        try:
            import muaalem  # noqa: PLC0415 — chargé seulement dans ce mode
            etat['modele'] = muaalem.Muaalem(os.environ.get('MADD_MODELE', '/muaalem'),
                                             int(os.environ.get('MADD_THREADS', '4')))
        except Exception as e:  # le service d'écoute continue de fonctionner sans le mode madd
            etat['erreur'] = type(e).__name__

    async def demarrage():
        threading.Thread(target=charger, daemon=True).start()

    app.on_event('startup')(demarrage)  # même mécanisme que ecoute.py

    @app.get('/madd/sante')
    async def sante():
        return {'pret': etat['modele'] is not None, 'modele': 'essai' if ESSAI else 'muaalem', 'erreur': etat['erreur']}

    def analyser(modele, ref: bytes, eleve: bytes, k: int, n: int | None, type_madd: str) -> dict:
        cle = hashlib.sha256(ref).hexdigest()
        toks_ref = cache.get(cle)
        if toks_ref is None:
            toks_ref = modele.decoder(asr.decoder_audio(ref, MAX_S))
            cache[cle] = toks_ref
            while len(cache) > CACHE_MAX:
                cache.popitem(last=False)
        x = asr.decoder_audio(eleve, MAX_S)
        try:
            toks_eleve = modele.decoder(x)
        finally:
            del x
        return madd.decider(toks_ref, toks_eleve, k, type_madd, n)

    @app.post('/madd')
    async def madd_post(req: Request, k: int = 0, type: str = 'muttasil', n: int | None = None):
        if etat['modele'] is None:
            return _erreur(503, 'demarrage')
        if type not in madd.TYPES:
            return _erreur(400, 'type_non_long')
        corps = await req.body()
        if len(corps) > MAX_OCTETS:
            return _erreur(413, 'trop_long')
        cadre = decouper(corps)
        del corps
        if cadre is None:
            return _erreur(400, 'cadrage')
        ref, eleve = cadre
        if ESSAI or etat['modele'] == 'essai':
            ind = 'trop_court' if req.headers.get('x-essai-madd') == 'trop_court' else None
            return {'indication': ind, 'raison': 'essai'}
        if etat['attente'] >= FILE_MAX:
            return _erreur(503, 'occupe')
        etat['attente'] += 1
        try:
            async with verrou:
                etat['attente'] -= 1
                try:
                    r = await asyncio.get_event_loop().run_in_executor(
                        None, analyser, etat['modele'], ref, eleve, k, n, type)
                except asr.AudioInvalide as e:
                    return _erreur(413 if str(e) == 'trop_long' else 400, 'audio_' + str(e))
                finally:
                    del ref, eleve
        except Exception:  # aucun détail dans la réponse ni dans les journaux
            return _erreur(500, 'madd_erreur')
        return r

    return etat
