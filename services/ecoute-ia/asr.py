"""
Awzid — A5 « l'IA qui écoute la récitation » : transcription seule (CPU), commune au service et à l'évaluation.

RÈGLES (cahier des charges A5) :
  - la machine ne repère que des MOTS : ce module renvoie les mots entendus, leur confiance et leurs instants ;
    la comparaison avec le texte Tanzil se fait ailleurs (@awform/hifz, `ecoute.ts`) — jamais de tajwīd ;
  - la VOIX N'EST JAMAIS CONSERVÉE : l'audio reçu (octets) est décodé dans un fichier ANONYME EN MÉMOIRE
    (memfd : aucun nom, aucun disque), lu par ffmpeg, puis fermé ; les tableaux sont libérés à la fin de l'appel ;
    rien n'est journalisé de l'audio ni des mots entendus.

Modèles (licences : docs/projet/LICENCES.md) :
  - « nemo » : NVIDIA STT Arabic FastConformer Hybrid Large PCD v1.0 (CC-BY-4.0), tête CTC décodée ici
    (glouton) pour avoir confiance et instants par mot ;
  - « whisper » : tarteel-ai/whisper-base-ar-quran (Apache-2.0), évaluation seulement.
"""
from __future__ import annotations

import gc
import math
import os
import subprocess
import time
import unicodedata

import numpy as np

SR = 16000
FRAME_S = 0.08  # FastConformer : sous-échantillonnage x8 sur des trames de 10 ms


class AudioInvalide(Exception):
    pass


def decoder_audio(data: bytes, max_s: float | None = None) -> np.ndarray:
    """Octets (webm, ogg, mp4, mp3, wav…) -> float32 mono 16 kHz. Fichier anonyme en mémoire (memfd), jamais
    sur disque : seekable pour ffmpeg (mp4 de Safari), effacé à la fermeture."""
    if not data:
        raise AudioInvalide('vide')
    fd = os.memfd_create('ecoute', 0)
    try:
        view = memoryview(data)
        while view:
            n = os.write(fd, view)
            view = view[n:]
        os.lseek(fd, 0, os.SEEK_SET)
        args = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', f'/proc/self/fd/{fd}']
        if max_s:
            args += ['-t', str(max_s + 1)]
        args += ['-ac', '1', '-ar', str(SR), '-f', 'f32le', 'pipe:1']
        p = subprocess.run(args, pass_fds=(fd,), capture_output=True, timeout=60)
    finally:
        os.close(fd)
    if p.returncode != 0 or not p.stdout:
        raise AudioInvalide('illisible')
    return np.frombuffer(p.stdout, dtype=np.float32).copy()


def zones_de_voix(x: np.ndarray, sr: int = SR) -> list[list[float]]:
    """Zones où il y a de la voix (énergie par trames de 20 ms, seuil adaptatif) : sert à distinguer un mot
    OUBLIÉ (silence à sa place) d'un mot MAL ENTENDU (de la voix sans mot reconnu -> doute)."""
    hop = sr // 50
    n = len(x) // hop
    if n == 0:
        return []
    e = np.sqrt(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(e + 1e-9)
    thr = max(float(np.percentile(db, 10)) + 12.0, -50.0)
    on = db > thr
    zones, start = [], None
    for i, v in enumerate(on):
        if v and start is None:
            start = i
        if not v and start is not None:
            zones.append([start / 50, i / 50]); start = None
    if start is not None:
        zones.append([start / 50, n / 50])
    out: list[list[float]] = []
    for z in zones:  # fusion des trous < 150 ms, retrait des clics < 60 ms
        if out and z[0] - out[-1][1] < 0.15:
            out[-1][1] = z[1]
        else:
            out.append(z)
    return [[round(a, 2), round(b, 2)] for a, b in out if b - a >= 0.06]


def _arabe(tok: str) -> str:
    return ''.join(c for c in tok if '؀' <= c <= 'ۿ' and unicodedata.category(c)[0] in 'LM')


class NemoCTC:
    nom = 'nemo'

    def __init__(self, chemin: str, threads: int = 4):
        import torch
        import nemo.collections.asr as nemo_asr
        from nemo.utils import logging as nlog
        nlog.setLevel('ERROR')
        torch.set_num_threads(threads)
        self.torch = torch
        m = nemo_asr.models.ASRModel.restore_from(chemin, map_location='cpu')
        m.eval()
        m.preprocessor.featurizer.dither = 0.0
        m.preprocessor.featurizer.pad_to = 0
        self.m = m
        self.vocab = m.tokenizer.vocab if hasattr(m.tokenizer, 'vocab') else None
        self.blank = m.ctc_decoder.num_classes_with_blank - 1

    def _piece(self, i: int) -> str:
        return self.m.tokenizer.ids_to_tokens([i])[0]

    def transcrire(self, x: np.ndarray) -> list[dict]:
        torch = self.torch
        with torch.inference_mode():
            sig = torch.from_numpy(x).unsqueeze(0)
            ln = torch.tensor([sig.shape[1]])
            feats, fl = self.m.preprocessor(input_signal=sig, length=ln)
            enc, el = self.m.encoder(audio_signal=feats, length=fl)
            logp = self.m.ctc_decoder(encoder_output=enc)[0][: int(el[0])]
            best = logp.max(dim=-1)
            ids = best.indices.tolist()
            probs = best.values.exp().tolist()
        del sig, feats, enc, logp
        # glouton : regroupe les trames identiques, retire les blancs ; jetons SentencePiece (« ▁ » = début de mot)
        toks, prev = [], None
        for t, (i, p) in enumerate(zip(ids, probs)):
            if i == prev and toks and i != self.blank:
                toks[-1]['t1'] = t; toks[-1]['p'] = max(toks[-1]['p'], p)
            elif i != self.blank:
                toks.append({'id': i, 't0': t, 't1': t, 'p': p})
            prev = i
        mots: list[dict] = []
        for tk in toks:
            piece = self._piece(tk['id'])
            debut = piece.startswith('▁')
            txt = _arabe(piece)
            if debut or not mots:
                if not txt and debut and piece.strip('▁') == '':
                    continue
                mots.append({'w': txt, 'conf': tk['p'], 't0': tk['t0'], 't1': tk['t1']})
            else:
                mots[-1]['w'] += txt
                mots[-1]['conf'] = min(mots[-1]['conf'], tk['p'])
                mots[-1]['t1'] = tk['t1']
        return [{'w': m['w'], 'conf': round(m['conf'], 3), 't0': round(m['t0'] * FRAME_S, 2),
                 't1': round((m['t1'] + 1) * FRAME_S, 2)} for m in mots if m['w']]


class NemoRNNT(NemoCTC):
    """Même modèle, décodeur PRINCIPAL (RNN-T, glouton) : plus précis que la tête CTC auxiliaire ; confiance par
    mot (probabilité maximale, agrégée au minimum) et instants des mots fournis par NeMo."""
    nom = 'nemo_rnnt'

    def __init__(self, chemin: str, threads: int = 4):
        super().__init__(chemin, threads)
        from omegaconf import OmegaConf, open_dict
        from nemo.collections.asr.parts.utils.asr_confidence_utils import (ConfidenceConfig,
                                                                           ConfidenceMethodConfig)
        cfg = self.m.cfg.decoding
        with open_dict(cfg):
            cfg.strategy = 'greedy_batch'
            cfg.compute_timestamps = True
            cfg.confidence_cfg = OmegaConf.structured(ConfidenceConfig(
                preserve_word_confidence=True, preserve_token_confidence=True, aggregation='min',
                method_cfg=ConfidenceMethodConfig(name='max_prob')))
        self.m.change_decoding_strategy(cfg, decoder_type='rnnt', verbose=False)

    def transcrire_rapide(self, x: np.ndarray) -> list[dict]:
        """Tête CTC du même modèle (aucune mémoire de plus) : pour les mots PARTIELS du suivi en direct, qui ne
        servent qu'à placer le mot en cours, jamais à signaler une erreur."""
        return NemoCTC.transcrire(self, x)

    def transcrire(self, x: np.ndarray) -> list[dict]:
        with self.torch.inference_mode():
            r = self.m.transcribe([x], batch_size=1, return_hypotheses=True, timestamps=True, verbose=False)
        h = r[0] if isinstance(r, list) else r
        if isinstance(h, (list, tuple)):
            h = h[0]
        ts = (getattr(h, 'timestamp', None) or {}).get('word', []) or []
        confs = list(getattr(h, 'word_confidence', None) or [])
        mots = []
        for n, w in enumerate(ts):
            txt = _arabe(w.get('word', ''))
            if not txt:
                continue
            c = float(confs[n]) if n < len(confs) else 0.0
            t0 = w.get('start', w.get('start_offset', 0) * FRAME_S)
            t1 = w.get('end', w.get('end_offset', 0) * FRAME_S)
            mots.append({'w': txt, 'conf': round(c, 3), 't0': round(float(t0), 2), 't1': round(float(t1), 2)})
        return mots


class WhisperQuran:
    nom = 'whisper'

    def __init__(self, chemin: str, threads: int = 4):
        import torch
        from transformers import WhisperForConditionalGeneration, WhisperProcessor
        torch.set_num_threads(threads)
        self.torch = torch
        self.proc = WhisperProcessor.from_pretrained(chemin)
        self.m = WhisperForConditionalGeneration.from_pretrained(chemin)
        self.m.eval()

    def _bloc(self, x: np.ndarray, decal: float) -> list[dict]:
        torch = self.torch
        f = self.proc(x, sampling_rate=SR, return_tensors='pt').input_features
        with torch.inference_mode():
            # invite de décodage du modèle (arabe, transcription) gardée dans sa configuration
            seq_t = self.m.generate(f, max_new_tokens=220)
            debut = self.m.config.decoder_start_token_id
            if int(seq_t[0, 0]) != debut:  # séquence rendue sans le jeton de départ : on le remet
                seq_t = torch.cat([torch.tensor([[debut]], dtype=seq_t.dtype), seq_t], 1)
            # probabilité de chaque jeton : un passage « forcé » sur la séquence obtenue
            logits = self.m(input_features=f, decoder_input_ids=seq_t[:, :-1]).logits[0]
            probs = torch.softmax(logits.float(), -1)
        seq = seq_t[0].tolist()
        mots: list[dict] = []
        for k in range(1, len(seq)):
            tid = seq[k]
            if tid in self.proc.tokenizer.all_special_ids:
                continue
            p = float(probs[k - 1, tid])
            piece = self.proc.tokenizer.convert_ids_to_tokens([tid])[0]
            txt = self.proc.tokenizer.convert_tokens_to_string([piece])
            debut = txt.startswith(' ') or not mots
            a = _arabe(txt)
            if not a:
                continue
            if debut:
                mots.append({'w': a, 'conf': p})
            else:
                mots[-1]['w'] += a; mots[-1]['conf'] = min(mots[-1]['conf'], p)
        return [{'w': m['w'], 'conf': round(m['conf'], 3)} for m in mots]

    def transcrire(self, x: np.ndarray) -> list[dict]:
        # blocs de 28 s au plus (fenêtre de Whisper), coupés dans un silence si possible
        out, i, n = [], 0, len(x)
        while i < n:
            j = min(n, i + 28 * SR)
            if j < n:
                z = zones_de_voix(x[i:j])
                trous = [(b, c) for (_, b), (c, _) in zip(z, z[1:]) if b > 10]
                if trous:
                    j = i + int(((trous[-1][0] + trous[-1][1]) / 2) * SR)
            out += self._bloc(x[i:j], i / SR)
            i = j
        return out


def charger(nom: str, threads: int = 4):
    chemin = os.environ.get('ECOUTE_MODELE', '/model/stt_ar_fastconformer_hybrid_large_pcd_v1.0.nemo')
    if nom == 'nemo':
        return NemoCTC(chemin, threads)
    if nom == 'nemo_rnnt':
        return NemoRNNT(chemin, threads)
    if nom == 'whisper':
        return WhisperQuran(os.environ.get('ECOUTE_WHISPER', '/whisper'), threads)
    raise ValueError(nom)


def ecouter(modele, data: bytes, max_s: float) -> dict:
    """Octets -> mots entendus + zones de voix + durée + temps de calcul. L'audio n'existe qu'en mémoire,
    le temps de l'appel."""
    t = time.perf_counter()
    x = decoder_audio(data, max_s)
    duree = len(x) / SR
    if duree > max_s + 0.5:
        del x
        raise AudioInvalide('trop_long')
    if duree < 0.5:
        del x
        raise AudioInvalide('trop_court')
    try:
        voix = zones_de_voix(x)
        mots = modele.transcrire(x) if voix else []
    finally:
        del x
        gc.collect()
    return {'mots': mots, 'voix': voix, 'duree': round(duree, 2), 'calcul': round(time.perf_counter() - t, 3)}
