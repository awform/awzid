import sys, numpy as np, time, json
sys.path[:0]=['/p3']
import qas, torch
from onnx.reference import ReferenceEvaluator
exp=json.load(open('/bn/export-t3.json'))
sid=next(s for s,e in exp.items() if e['type']=='juste')
x=np.fromfile(f'/bn/audio/{sid}.f32',dtype=np.float32)[16000*2:16000*8]
for int8 in (False,True):
    m=qas.QuranSmall(1,int8)
    t=time.time(); lp=m.logp(x); print('int8',int8,lp.shape,time.time()-t)
    print(' '.join(w['w'] for w in m.mots(lp)))
    if not int8:
        f=qas.fbank(torch.from_numpy(x))[None].numpy()
        r=ReferenceEvaluator('/qas/model.onnx').run(None,{'x':f,'x_lens':np.array([f.shape[1]],dtype=np.int64)})
        print('maxdiff vs reference', np.abs(r[0][0]-lp.numpy()).max())
print('ref', ' '.join(exp[sid]['mots'][:15]))
