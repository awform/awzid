"""
Tests du service d'écoute (modèle factice ECOUTE_ESSAI=1 : aucun modèle, mêmes chemins audio).
Garantie vérifiée : AUCUN fichier ne reste (ni ne passe) sur disque, aucun descripteur audio ne fuit.
    ECOUTE_ESSAI=1 python -m pytest -q tests
"""
import asyncio
import io
import os
import struct
import time
import uuid
import wave

import numpy as np
import pytest

os.environ['ECOUTE_ESSAI'] = '1'
os.environ.setdefault('ECOUTE_FILE', '2')
os.environ.setdefault('ECOUTE_CONCURRENCE', '1')

from fastapi.testclient import TestClient  # noqa: E402

import asr  # noqa: E402
import ecoute  # noqa: E402

MOTS = ['ذهب', 'الولد', 'الى', 'المدرسة']
HEX = ','.join(w.encode('utf-8').hex() for w in MOTS)


def wav(secondes: float, sr: int = 16000) -> bytes:
    t = np.arange(int(secondes * sr)) / sr
    # « voix » : rafales de 0,4 s séparées de silences de 0,2 s
    x = (0.3 * np.sin(2 * np.pi * 220 * t) * ((t % 0.6) < 0.4)).astype(np.float32)
    b = io.BytesIO()
    with wave.open(b, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((x * 32767).astype('<i2').tobytes())
    return b.getvalue()


def opus(secondes: float) -> bytes:
    import subprocess
    p = subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-f', 'wav', '-i', 'pipe:0', '-c:a', 'libopus',
                        '-f', 'webm', 'pipe:1'], input=wav(secondes), capture_output=True, check=True)
    return p.stdout


def instantane() -> set[str]:
    """Tous les fichiers des dossiers où un audio pourrait atterrir (y compris en mémoire partagée)."""
    out = set()
    for racine in {'/tmp', '/var/tmp', '/dev/shm', os.getcwd(), os.path.expanduser('~'), '/srv'}:
        if not os.path.isdir(racine):
            continue
        for d, _, fs in os.walk(racine):
            if '__pycache__' in d or '.pytest_cache' in d:
                continue
            for f in fs:
                p = os.path.join(d, f)
                try:
                    out.add(f'{p}:{os.path.getsize(p)}')
                except OSError:
                    pass
    return out


def fds() -> set[str]:
    r = set()
    for f in os.listdir('/proc/self/fd'):
        try:
            r.add(os.readlink(f'/proc/self/fd/{f}'))
        except OSError:
            pass
    return r


@pytest.fixture(scope='module')
def client():
    with TestClient(ecoute.app) as c:
        for _ in range(50):
            if c.get('/sante').json()['pret']:
                break
            time.sleep(0.05)
        yield c


def test_sante(client):
    j = client.get('/sante').json()
    assert j['pret'] and j['modele'] == 'essai' and j['max_s'] == 300


def test_ecouter_renvoie_mots_et_voix(client):
    r = client.post('/ecouter', content=opus(4), headers={'x-essai-mots': HEX, 'content-type': 'audio/webm'})
    assert r.status_code == 200, r.text
    j = r.json()
    assert [m['w'] for m in j['mots']] == MOTS
    assert j['voix'] and 3.5 < j['duree'] < 4.5 and j['calcul'] >= 0


def test_aucun_fichier_audio_ne_reste(client):
    avant, fd0 = instantane(), fds()
    for data in (wav(3), opus(3)):
        r = client.post('/ecouter', content=data, headers={'x-essai-mots': HEX})
        assert r.status_code == 200
    sid = str(uuid.uuid4())
    client.post(f'/direct/{sid}', content=(np.zeros(16000, '<i2')).tobytes())
    client.delete(f'/direct/{sid}')
    assert instantane() == avant, 'un fichier a été écrit pendant le traitement'
    apres = fds()
    assert not [f for f in apres - fd0 if 'memfd' in f or f.startswith('/tmp')], 'descripteur audio non fermé'


def test_decodage_en_memoire_seulement(monkeypatch):
    """Le décodage passe par un memfd (sans nom de fichier) : on vérifie qu'aucun chemin du disque n'est créé
    même si ffmpeg échoue."""
    avant = instantane()
    with pytest.raises(asr.AudioInvalide):
        asr.decoder_audio(b'pas un audio')
    with pytest.raises(asr.AudioInvalide):
        asr.decoder_audio(b'')
    assert instantane() == avant


def test_refuse_plus_de_5_minutes(client):
    r = client.post('/ecouter', content=wav(302), headers={'x-essai-mots': HEX})
    assert r.status_code == 413
    assert r.json()['error']['code'] == 'audio_trop_long'


def test_refuse_audio_illisible(client):
    r = client.post('/ecouter', content=b'\x00' * 2000)
    assert r.status_code == 400


def test_direct_mots_surs_aux_pauses_puis_effacement(client):
    sid = str(uuid.uuid4())
    x = np.frombuffer(wav(3)[44:], dtype='<i2')
    silence = np.zeros(8000, dtype='<i2')
    r1 = client.post(f'/direct/{sid}', content=x.tobytes(), headers={'x-essai-mots': HEX}).json()
    assert r1['t'] == 3.0
    r2 = client.post(f'/direct/{sid}', content=np.concatenate([silence, silence]).tobytes(),
                     headers={'x-essai-mots': HEX}).json()
    assert [m['w'] for m in r1['mots'] + r2['mots']], 'le passage terminé par une pause doit être transcrit'
    assert r2['t'] == 4.0
    # le passage transcrit est effacé aussitôt : il ne reste en mémoire que la fin non transcrite
    assert len(ecoute._seances[sid].buf) < 16000
    assert client.get('/sante').json()['direct'] == 1
    client.delete(f'/direct/{sid}')
    assert client.get('/sante').json()['direct'] == 0
    assert sid not in ecoute._seances


def test_direct_limite_5_minutes(client):
    sid = str(uuid.uuid4())
    morceau = np.zeros(16000 * 10, dtype='<i2').tobytes()
    code = 200
    for _ in range(31):
        code = client.post(f'/direct/{sid}', content=morceau).status_code
        if code != 200:
            break
    assert code == 413 and sid not in ecoute._seances


def test_file_de_traitement_refuse_au_dela(client, monkeypatch):
    lent = ecoute.etat['modele']
    orig = lent.transcrire
    monkeypatch.setattr(lent, 'transcrire', lambda x: (time.sleep(0.6), orig(x))[1])

    from concurrent.futures import ThreadPoolExecutor
    data = wav(1)
    with ThreadPoolExecutor(8) as ex:
        codes = list(ex.map(lambda _: client.post('/ecouter', content=data,
                                                   headers={'x-essai-mots': HEX}).status_code, range(8)))
    # 1 calcul à la fois + 2 en attente : le reste est refusé (« réessaie dans un instant »)
    assert 503 in codes and 200 in codes
    # jamais d'erreur interne sous la charge (un modèle de la réserve par calcul)
    assert set(codes) <= {200, 503}
