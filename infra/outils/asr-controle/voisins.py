"""
Second passage (A1) : un verset « suspect_texte » ou « incertain_court » (l'ASR ne reconnaît pas assez le texte,
sans qu'un verset voisin lui ressemble davantage — typiquement les lettres isolées « حم », « الر ») est LEVÉ si
ses voisins immédiats dans la sourate (verset précédent, ou début de sourate, et verset suivant, ou fin de
sourate) sont reconnus : la numérotation est alors cohérente autour de lui. Les décalages ne sont jamais levés.
Fichiers lus seulement.
"""
import glob, json, os, subprocess, sys, tempfile
sys.path.insert(0, '/work')
from asr_controle import RECITATIONS, TEXTES, TXT, OUT, MODEL, files_for, strip, sim


def main(ids):
    import nemo.collections.asr as nemo_asr
    import torch
    torch.set_num_threads(int(os.environ.get('THREADS', '8')))
    model = nemo_asr.models.ASRModel.restore_from(MODEL, map_location='cpu')
    model.eval()
    for rid in ids:
        path = f'{OUT}/asr-{rid}.json'
        rep = json.load(open(path, encoding='utf-8'))
        riw = RECITATIONS[rid][0]
        files, _ = files_for(rid)
        tdir, field = TEXTES[riw]
        data = json.load(open(glob.glob(f'{TXT}/{tdir}/*data*/*.json')[0], encoding='utf-8'))
        ref = {(int(x['sura_no']), int(x['aya_no'])): strip(x[field]) for x in data}
        done = {(r['sura'], r['aya']): r for r in rep['lignes']}
        cand = [r for r in rep['lignes'] if r['statut'] in ('suspect_texte', 'incertain_court')]
        need = sorted({k for r in cand for k in [(r['sura'], r['aya'] - 1), (r['sura'], r['aya'] + 1)]
                       if k in ref and k in files and k not in done})
        extra = {}
        if need:
            with tempfile.TemporaryDirectory() as tmp:
                wavs = []
                for (s, a) in need:
                    w = f'{tmp}/{s:03d}{a:03d}.wav'
                    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', files[(s, a)], '-ac', '1', '-ar', '16000', w], check=True)
                    wavs.append(w)
                hyps = model.transcribe(wavs, batch_size=8, verbose=False)
                if isinstance(hyps, tuple): hyps = hyps[0]
                for k, h in zip(need, hyps):
                    hyp = strip(h.text if hasattr(h, 'text') else str(h))
                    extra[k] = round(sim(hyp, ref[k]), 3)
        score = lambda k: done[k]['score'] if k in done and done[k]['statut'] == 'ok' else (extra.get(k, 0) if k not in done else 0)
        verif = []
        for r in cand:
            s, a = r['sura'], r['aya']
            prev_ok = (s, a - 1) not in ref or score((s, a - 1)) >= 0.6
            next_ok = (s, a + 1) not in ref or score((s, a + 1)) >= 0.6
            r['statut_final'] = 'leve_par_voisins' if prev_ok and next_ok else r['statut']
            verif.append({'verset': f'{s}:{a}', 'statut': r['statut'], 'precedent': score((s, a - 1)) if (s, a - 1) in ref else 'début',
                          'suivant': score((s, a + 1)) if (s, a + 1) in ref else 'fin', 'final': r['statut_final']})
        for r in rep['lignes']:
            r.setdefault('statut_final', r['statut'])
        rest = [r for r in rep['lignes'] if r['statut_final'].startswith('suspect')]
        rep['verification_voisins'] = verif
        rep['suspects_restants'] = [{k: r[k] for k in ('sura', 'aya', 'fichier', 'score', 'meilleur_voisin', 'score_voisin', 'statut_final', 'asr')} for r in rest]
        rep['correspondance_finale'] = sum(1 for r in rep['lignes'] if r['statut_final'] in ('ok', 'leve_par_voisins'))
        json.dump(rep, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f"== {rid} : voisins {verif} ; suspects restants {[(x['sura'], x['aya'], x['statut_final']) for x in rest]}", flush=True)


if __name__ == '__main__':
    main(sys.argv[1:])
