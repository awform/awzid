import json, sys, re, os, difflib, numpy as np
sys.path[:0]=['/code','/p3']
import qas
exec(open('/p3/wq2.py').read().split("mods =")[0].split("import asr, qas")[1])
m=qas.QuranSmall(1,False); k=0
for sid,e in exp.items():
    if e['type']!='juste' or k>=5: continue
    x=np.fromfile(f'/bn/audio/{sid}.f32',dtype=np.float32); k+=1
    a=2; seg=x[a*16000:(a+10)*16000]
    ref=[sq(w) for w,i in zip(e['mots'],e['inst']) if i and a<=i[0] and i[1]<=a+10]
    h=[sq(w['w']) for w in m.transcrire(seg)]
    sm=difflib.SequenceMatcher(None,ref,h)
    print(sid,[ (t,' '.join(ref[i1:i2]),'->',' '.join(h[j1:j2])) for t,i1,i2,j1,j2 in sm.get_opcodes() if t!='equal'])
