import sys, time
sys.path.insert(0, '/code')
import asr
for nom in sys.argv[1:]:
    t = time.time(); m = asr.charger(nom, 4); print(nom, 'chargé', round(time.time() - t, 1), 's', flush=True)
    for f in ['/src/akhdar-hafs/10-001001-A02.mp3', '/src/akhdar-hafs/10-002002-A02.mp3', '/src/akhdar-hafs/10-114001-A02.mp3']:
        x = asr.decoder_audio(open(f, 'rb').read())
        t = time.time(); h = m.transcrire(x)
        print(nom, f[-17:], round(len(x) / 16000, 1), 's audio', round(time.time() - t, 2), 's calcul', [(w['w'], w['conf'], w.get('t0')) for w in h], flush=True)
    print(asr.zones_de_voix(x))
    del m
