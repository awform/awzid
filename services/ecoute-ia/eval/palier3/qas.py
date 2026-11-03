"""Palier 3 : quran-asr-small (Abdou, MIT, zipformer2 CTC, lettres sans voyelles) exécuté avec torch, SANS onnxruntime
(non installé, rien à télécharger) : petit interprète du graphe ONNX (28 opérateurs). Fbank : celui de l'auteur."""
import sys, types, os, numpy as np, torch, onnx
from onnx import numpy_helper, TensorProto

MOD = os.environ.get('QAS_DIR', '/qas')
FRAME_S = 0.04
_pk = types.ModuleType('quran_asr'); _pk.__path__ = [MOD + '/code/quran_asr']
_au = types.ModuleType('quran_asr.audio'); _au.SAMPLE_RATE = 16000
sys.modules['quran_asr'] = _pk; sys.modules['quran_asr.audio'] = _au
from quran_asr.features import fbank  # noqa

_DT = {1: torch.float32, 6: torch.int32, 7: torch.int64, 9: torch.bool, 2: torch.uint8, 3: torch.int8, 11: torch.float64}


def _attrs(n):
    return {a.name: onnx.helper.get_attribute_value(a) for a in n.attribute}


class Graphe:
    def __init__(self, chemin):
        m = onnx.load(chemin)
        g = m.graph
        self.noeuds = list(g.node)
        self.init = {i.name: torch.from_numpy(np.array(numpy_helper.to_array(i))) for i in g.initializer}
        self.entrees = [i.name for i in g.input]
        self.sorties = [o.name for o in g.output]
        self.at = [_attrs(n) for n in self.noeuds]

    def run(self, **ent):
        v = dict(self.init); v.update(ent)
        for n, a in zip(self.noeuds, self.at):
            ins = [v[i] if i else None for i in n.input]
            outs = self.op(n.op_type, ins, a, len(n.output))
            if not isinstance(outs, tuple):
                outs = (outs,)
            for k, o in zip(n.output, outs):
                v[k] = o
        return [v[s] for s in self.sorties]

    def op(self, t, i, a, nout):
        T = torch
        if t == 'Constant':
            for k in ('value', 'value_float', 'value_int', 'value_ints', 'value_floats'):
                if k in a:
                    x = a[k]
                    if k == 'value':
                        return T.from_numpy(np.array(numpy_helper.to_array(x)))
                    return T.tensor(x)
        if t == 'Add': return i[0] + i[1]
        if t == 'Sub': return i[0] - i[1]
        if t == 'Mul': return i[0] * i[1]
        if t == 'Div':
            r = i[0] / i[1]
            return r.to(i[0].dtype) if not i[0].dtype.is_floating_point else r
        if t == 'MatMul': return T.matmul(i[0], i[1])
        if t == 'Sigmoid': return T.sigmoid(i[0])
        if t == 'Cos': return T.cos(i[0])
        if t == 'Sin': return T.sin(i[0])
        if t == 'Not': return ~i[0]
        if t == 'GreaterOrEqual': return i[0] >= i[1]
        if t == 'Where': return T.where(i[0], i[1], i[2])
        if t == 'Cast': return i[0].to(_DT[a['to']])
        if t == 'Shape': return T.tensor(list(i[0].shape), dtype=T.int64)
        if t == 'Transpose': return i[0].permute(*a['perm']) if 'perm' in a else i[0].permute(*reversed(range(i[0].dim())))
        if t == 'Concat': return T.cat(i, dim=a['axis'])
        if t == 'Unsqueeze':
            x = i[0]
            for ax in sorted(int(z) for z in (i[1].tolist() if len(i) > 1 else a['axes'])):
                x = x.unsqueeze(ax)
            return x
        if t == 'Squeeze':
            ax = i[1].tolist() if len(i) > 1 and i[1] is not None else a.get('axes')
            if ax is None: return i[0].squeeze()
            x = i[0]
            for z in sorted((int(z) % x.dim() for z in ax), reverse=True):
                x = x.squeeze(z)
            return x
        if t == 'Reshape':
            sh = [int(z) for z in i[1].tolist()]
            sh = [i[0].shape[k] if z == 0 else z for k, z in enumerate(sh)]
            return i[0].reshape(sh)
        if t == 'Gather':
            ax = a.get('axis', 0)
            idx = i[1]
            if idx.dim() == 0:
                return i[0].select(ax, int(idx))
            return T.index_select(i[0], ax, idx.reshape(-1)).reshape(i[0].shape[:ax] + idx.shape + i[0].shape[ax + 1:])
        if t == 'Slice':
            x = i[0]; st = i[1].tolist(); en = i[2].tolist()
            ax = i[3].tolist() if len(i) > 3 and i[3] is not None else list(range(len(st)))
            sp = i[4].tolist() if len(i) > 4 and i[4] is not None else [1] * len(st)
            for s, e, z, p in zip(st, en, ax, sp):
                n = x.shape[z]
                e = max(min(e, 2**62), -2**62)
                sl = slice(None)
                if p > 0:
                    s = min(max(s + n if s < 0 else s, 0), n); e = min(max(e + n if e < 0 else e, 0), n)
                    sl = slice(s, e, p)
                else:
                    s = min(max(s + n if s < 0 else s, -1), n - 1); e = e + n if e < 0 else e
                    idx = list(range(s, max(e, -1) if e >= 0 else -1, p)) if e > -1e9 else list(range(s, -1, p))
                    x = x.index_select(z, T.tensor(idx, dtype=T.int64)); continue
                x = x[(slice(None),) * z + (sl,)]
            return x
        if t == 'Split':
            ax = a.get('axis', 0)
            if len(i) > 1 and i[1] is not None: sz = [int(z) for z in i[1].tolist()]
            elif 'split' in a: sz = list(a['split'])
            else: sz = [i[0].shape[ax] // nout] * nout
            return tuple(T.split(i[0], sz, dim=ax))
        if t == 'Range':
            return T.arange(i[0].item(), i[1].item(), i[2].item(), dtype=i[0].dtype)
        if t == 'Softmax': return T.softmax(i[0], dim=a.get('axis', -1))
        if t == 'LogSoftmax': return T.log_softmax(i[0], dim=a.get('axis', -1))
        if t == 'LayerNormalization':
            ax = a.get('axis', -1); x = i[0]; ax = ax % x.dim()
            return T.nn.functional.layer_norm(x, x.shape[ax:], i[1], i[2] if len(i) > 2 else None, a.get('epsilon', 1e-5))
        if t == 'Conv':
            p = a.get('pads', [0, 0]); n = len(p) // 2
            f = {1: T.nn.functional.conv1d, 2: T.nn.functional.conv2d}[i[1].dim() - 2]
            pad = tuple(p[:n]) if p[:n] == p[n:] else None
            x = i[0]
            if pad is None:
                x = T.nn.functional.pad(x, [q for k in reversed(range(n)) for q in (p[k], p[n + k])]); pad = 0
            return f(x, i[1], i[2] if len(i) > 2 else None, stride=tuple(a.get('strides', [1] * n)), padding=pad,
                     dilation=tuple(a.get('dilations', [1] * n)), groups=a.get('group', 1))
        if t == 'DynamicQuantizeLinear':
            x = i[0]; mx = T.clamp(x.max(), min=0); mn = T.clamp(x.min(), max=0)
            sc = (mx - mn) / 255.0
            if sc == 0: sc = T.tensor(1.0)
            zp = T.clamp(T.round(-mn / sc), 0, 255)
            y = T.clamp(T.round(x / sc) + zp, 0, 255)
            return y.to(T.uint8), sc.reshape(()), zp.to(T.uint8).reshape(())
        if t == 'MatMulInteger':
            za = i[2].float() if len(i) > 2 and i[2] is not None else 0.0
            zb = i[3].float() if len(i) > 3 and i[3] is not None else 0.0
            return T.matmul(i[0].float() - za, i[1].float() - zb).round().to(T.int32)
        raise NotImplementedError(t)


class QuranSmall:
    nom = 'qas'

    def __init__(self, threads=1, int8=False):
        torch.set_num_threads(threads)
        self.g = Graphe(f'{MOD}/model.int8.onnx' if int8 else f'{MOD}/model.onnx')
        self.vocab = [l.rsplit(' ', 1)[0] for l in open(f'{MOD}/tokens.txt', encoding='utf-8').read().split('\n') if l]

    def logp(self, x):
        with torch.inference_mode():
            f = fbank(torch.from_numpy(np.asarray(x, dtype=np.float32)))[None]
            lp, ln = self.g.run(x=f, x_lens=torch.tensor([f.shape[1]], dtype=torch.int64))
        return lp[0, : int(ln[0])]

    def transcrire(self, x):
        return self.mots(self.logp(x))

    def mots(self, lp):
        best = lp.max(dim=-1)
        ids = best.indices.tolist(); pr = best.values.exp().tolist()
        mots, cur, prev = [], None, None
        for t, (k, p) in enumerate(zip(ids, pr)):
            if k != prev and k != 0:
                ch = self.vocab[k]
                if ch == '▁':
                    cur = None
                else:
                    if cur is None:
                        cur = {'w': '', 'conf': 1.0, 't0': t, 't1': t}; mots.append(cur)
                    cur['w'] += ch; cur['conf'] = min(cur['conf'], p); cur['t1'] = t
            elif k == prev and k not in (0, 30) and cur is not None:
                cur['t1'] = t
            prev = k
        return [{'w': m['w'], 'conf': round(m['conf'], 3), 't0': round(m['t0'] * FRAME_S, 2), 't1': round((m['t1'] + 1) * FRAME_S, 2)} for m in mots]
