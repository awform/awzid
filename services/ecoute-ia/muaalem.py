"""
Awzid — indication des madd : chargement du modèle obadx/muaalem-model-v3_2 (Wav2Vec2-BERT + têtes CTC multiples) SANS le paquet
quran-muaalem : on reconstruit Wav2Vec2BertModel (transformers) et les têtes linéaires par niveau à partir du fichier safetensors
(repris du prototype de recherche `recherche_coran_ia/prototypes/muaalem.py`, étude du 25/10/2026).

Ce module n'est importé que si ECOUTE_MADD=1 (mode « madd » du service) : sans cela, le service d'écoute est strictement inchangé.
L'audio n'est lu qu'en mémoire (voir madd_route.py).
"""
from __future__ import annotations

import json
import os

import numpy as np
import torch
from safetensors.torch import load_file
from transformers import AutoFeatureExtractor, Wav2Vec2BertConfig, Wav2Vec2BertModel

SR = 16000


class Muaalem(torch.nn.Module):
    def __init__(self, dossier: str, threads: int = 4):
        super().__init__()
        torch.set_num_threads(threads)
        cfg_d = json.load(open(os.path.join(dossier, 'config.json')))
        self.niveaux = cfg_d['level_to_vocab_size']
        cfg = Wav2Vec2BertConfig(**{k: v for k, v in cfg_d.items() if k not in ('architectures',)})
        self.enc = Wav2Vec2BertModel(cfg)
        self.tetes = torch.nn.ModuleDict({k: torch.nn.Linear(cfg.hidden_size, n) for k, n in self.niveaux.items()})
        sd = load_file(os.path.join(dossier, 'model.safetensors'))
        enc_sd = {k[len('wav2vec2_bert.'):]: v for k, v in sd.items() if k.startswith('wav2vec2_bert.')}
        manq, _inat = self.enc.load_state_dict(enc_sd, strict=False)
        manq = [m for m in manq if 'masked_spec_embed' not in m]
        assert not manq, manq[:5]
        for k in self.niveaux:
            self.tetes[k].weight.data = sd[f'level_to_lm_head.{k}.weight']
            self.tetes[k].bias.data = sd[f'level_to_lm_head.{k}.bias']
        self.eval()
        self.fe = AutoFeatureExtractor.from_pretrained(dossier)
        voc = json.load(open(os.path.join(dossier, 'vocab.json')))
        self.inv = {niv: {i: t for t, i in d.items()} for niv, d in voc.items()}
        self.vocab = voc

    @torch.inference_mode()
    def logprobs(self, x: np.ndarray) -> dict[str, torch.Tensor]:
        f = self.fe(x, sampling_rate=SR, return_tensors='pt')
        h = self.enc(input_features=f['input_features'], attention_mask=f.get('attention_mask')).last_hidden_state[0]
        return {k: torch.log_softmax(t(h), -1) for k, t in self.tetes.items()}

    def glouton(self, lp: torch.Tensor, niveau: str = 'phonemes', blank: int = 0) -> list[dict]:
        """Décodage glouton CTC : liste de {tok, t0, t1, p} (indices de trames de 40 ms)."""
        best = lp.max(-1)
        ids, ps = best.indices.tolist(), best.values.exp().tolist()
        out, prev = [], None
        for t, (i, p) in enumerate(zip(ids, ps)):
            if i != blank and i == prev:
                out[-1]['t1'] = t
                out[-1]['p'] = max(out[-1]['p'], p)
            elif i != blank:
                out.append({'tok': self.inv[niveau][i], 'id': i, 't0': t, 't1': t, 'p': p})
            prev = i
        return out

    def decoder(self, x: np.ndarray) -> list[dict]:
        """Phonèmes décodés d'un audio (mono 16 kHz)."""
        return self.glouton(self.logprobs(x)['phonemes'])
