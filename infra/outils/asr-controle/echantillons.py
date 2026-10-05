"""Échantillons d'écoute (A1) : copies et concaténation SANS ré-encodage (ffmpeg -c copy) ; sources jamais modifiées."""
import glob, json, os, re, shutil, subprocess
H = os.path.expanduser('~')
SRC = H + '/coran-audio-source'
OUT = H + '/a1-echantillons'
TXT = H + '/complexe-ressources/textes-riwayat'
X = SRC + '/_extras'
R = {
    'ayyoub-hafs': ('hafs', [SRC + '/ayyoub-hafs'], ['10-SSSVVV-A03.mp3']),
    'muaiqly-hafs': ('hafs', [SRC + '/muaiqly-hafs'], ['10-SSSVVV-A08.mp3']),
    'huthify-hafs': ('hafs', [SRC + '/huthify-hafs', X + '/huthify-hafs/الحذيفي-ايات/002 Al-Baqarah البقرة'],
                     ['10-SSSVVV-A01.mp3', '10-SSSVVV-001.mp3']),
    'muhanna-hafs': ('hafs', [SRC + '/muhanna-hafs'], ['10-SSSVVV-A06.mp3']),
    'akhdar-hafs': ('hafs', [SRC + '/akhdar-hafs'], ['10-SSSVVV-A02.mp3']),
    'huthify-shuba': ('shuba', [SRC + '/huthify-shuba'], ['09-SSSVVV-A01.mp3']),
    'juhani-duri': ('duri', [SRC + '/juhani-duri'], ['05-SSSVVV-A09.mp3']),
    'sediki-susi': ('susi', [SRC + '/sediki-susi'], ['06-SSSVVVA10.mp3.mp3', '06-SSSVVVA10.wav.mp3', '06-SSVVVA10.wav.mp3']),
    'huthify-qalun': ('qalun', [SRC + '/huthify-qalun'], ['01-SSSVVV-A01.mp3', '01-SSSVVV-001.mp3', '01-SSSVVVA01.mp3']),
}
NOMS = {'ayyoub-hafs': 'Muḥammad Ayyūb — Ḥafṣ ʿan ʿĀṣim', 'muaiqly-hafs': 'Māhir al-Muʿayqlī — Ḥafṣ ʿan ʿĀṣim',
        'huthify-hafs': 'ʿAlī al-Ḥudhayfī — Ḥafṣ ʿan ʿĀṣim', 'muhanna-hafs': 'Khālid al-Muhannā — Ḥafṣ ʿan ʿĀṣim',
        'akhdar-hafs': 'Ibrāhīm al-Akhḍar — Ḥafṣ ʿan ʿĀṣim', 'huthify-shuba': 'ʿAlī al-Ḥudhayfī — Shuʿba ʿan ʿĀṣim',
        'juhani-duri': 'ʿAbdullāh ibn ʿAwwād al-Juhanī — ad-Dūrī ʿan Abī ʿAmr',
        'sediki-susi': 'ʿUthmān aṣ-Ṣiddīqī — as-Sūsī ʿan Abī ʿAmr', 'huthify-qalun': 'ʿAlī al-Ḥudhayfī — Qālūn ʿan Nāfiʿ'}
TX = {'susi': 'texte-susi-v30', 'duri': 'texte-susi-v30', 'qalun': 'texte-qalun-v30'}


def cp(order, p):
    rx = ''
    o = []
    for t in re.findall(r'S+|V+|[^SV]+', p):
        if t[0] in 'SV': o.append(t[0]); rx += r'(\d{%d})' % len(t)
        else: rx += re.escape(t)
    r = re.compile('^' + rx + '$', re.I)
    def f(n):
        m = r.match(n)
        if not m: return None
        v = [int(x) for x in m.groups()]
        return v[o.index('S')], v[o.index('V')]
    return f


def kind(path):
    with open(path, 'rb') as f: h = f.read(12)
    return 'wav' if h[:4] == b'RIFF' else 'mp3'


for rid, (riw, dirs, pats) in R.items():
    ps = [cp(None, p) for p in pats]
    files = {}
    for d in dirs:
        if not os.path.isdir(d): continue
        for n in sorted(os.listdir(d)):
            for p in ps:
                v = p(n)
                if v: files.setdefault(v, os.path.join(d, n)); break
    if not files: print(rid, 'absent'); continue
    # plus long verset de la sourate 2 dans la numérotation de la riwāya (Ḥafṣ : 2:282)
    longest = 282
    if riw in TX:
        data = json.load(open(glob.glob(f'{TXT}/{TX[riw]}/*data*/*.json')[0], encoding='utf-8'))
        s2 = [x for x in data if int(x['sura_no']) == 2]
        longest = int(max(s2, key=lambda x: len(x['aya_text_unicode']))['aya_no'])
    out = f'{OUT}/{rid}'
    shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    lines = [f'Échantillons d’écoute — {NOMS[rid]}', 'Récitation : Complexe du Roi Fahd pour l’impression du Noble Coran, Médine.',
             'Audio non modifié : fichiers copiés tels quels ; al-Fātiḥa assemblée sans ré-encodage (ffmpeg, copie des trames).',
             'Usage : écoute de contrôle (client, référent). Ne pas vendre l’audio.', '']
    fat = [files.get((1, a)) for a in range(1, 8)]
    ext = 'mp3'
    if all(fat):
        kinds = {kind(f) for f in fat}
        ext = kinds.pop() if len(kinds) == 1 else None
        ok = False
        if ext:
            lst = f'{out}/.liste.txt'
            with open(lst, 'w') as f:
                for x in fat: f.write("file '" + x.replace("'", "'\\''") + "'\n")
            r = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy',
                                f'{out}/1-fatiha-1-7.{ext}'], capture_output=True)
            os.remove(lst); ok = r.returncode == 0
        if ok:
            lines.append(f'1-fatiha-1-7.{ext} : al-Fātiḥa, versets 1 à 7 assemblés (sans ré-encodage).')
        else:
            for a, x in enumerate(fat, 1):
                shutil.copy2(x, f'{out}/1-fatiha-{a}{os.path.splitext(x)[1]}')
            lines.append('1-fatiha-1..7 : al-Fātiḥa, versets 1 à 7 (fichiers bruts, assemblage impossible sans ré-encodage).')
    else:
        lines.append(f"al-Fātiḥa : versets absents {[a for a in range(1, 8) if not files.get((1, a))]}")
    for tag, k, lab in [('2-milieu', (18, 19), 'verset du milieu du Coran (al-Kahf 18:19 en numérotation de Ḥafṣ ; numéro de la riwāya)'),
                        ('3-nas-dernier', (114, 6), 'dernier verset d’an-Nās (114:6)'),
                        ('4-plus-long', (2, longest), f'plus long verset (al-Baqara 2:{longest} dans la numérotation de la riwāya ; 2:282 en Ḥafṣ)')]:
        x = files.get(k)
        if x:
            name = f'{tag}-{k[0]:03d}{k[1]:03d}{os.path.splitext(x)[1]}'
            shutil.copy2(x, f'{out}/{name}')
            lines.append(f'{name} : {lab} — source : {os.path.relpath(x, SRC)}')
        else:
            lines.append(f'{tag} : fichier absent ({k[0]}:{k[1]})')
    open(f'{out}/LISEZMOI.txt', 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print(rid, sorted(os.listdir(out)))
