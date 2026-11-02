# Budget de poids et d’ouverture (mesuré après construction)

Indicateurs du lot F5 (décision du chef de projet) : ce que garde l’appareil d’un ÉLÈVE, ce que télécharge sa
PREMIÈRE OUVERTURE, et le temps d’ouverture en 3G simulée. Le total de toutes les pages reste affiché, sans être
bloquant. Compression Brotli (qualité 11).

| Indicateur | Mesure | Budget | Tenu |
|---|---|---|---|
| **(a) Appareil d'un élève** : JS + CSS préchargés et textes préchargés | 346.6 Ko | ≤ 350.0 Ko | oui |
| (a) marge restante sous le budget de l'appareil élève | 3.4 Ko (3500 o) | ≥ 3.0 Ko | oui |
| **(b) Première ouverture** : JS + CSS initiaux de l'accueil de l'élève (`/`) | 103.1 Ko | ≤ 150.0 Ko | oui |
| **(c) Ouverture en 3G simulée** (CPU ×4, 150 ms, 1,6 Mbit/s ; e2e/perf.spec.ts) | 1.97 s (élève, premier lancement ; relance 0.83 s ; mesuré le 2026-11-02) | < 3 s | oui |
| Page la plus lourde au premier chargement (`/coran/lecteur`) | 139.1 Ko | ≤ 150.0 Ko | oui |

## Détail

| Élément | Poids transféré |
|---|---|
| (a) dont JS + CSS de la coquille de l'élève | 322.7 Ko |
| (a) dont textes préchargés (`/i18n/fr-quotidien.json`, `/i18n/fr-vivre.json`, `/i18n/fr-coran.json`, `/i18n/fr-hifz.json`, `/i18n/fr-arabe.json`, `/i18n/fr-suivi.json`) | 23.9 Ko |
| Pages du personnel, NON préchargées (38 fichiers) | 78.1 Ko |
| Pages rares, en ligne seulement, NON préchargées (72 fichiers) | 80.0 Ko |
| Modules à la demande qui ont besoin du réseau, NON préchargés (42 fichiers) | 71.6 Ko |
| Pages de l’élève gardées au premier usage (Madjaliss, cahier « Je parle »), NON préchargées (44 fichiers) | 110.4 Ko |
| Leçons vivantes, à la demande (2 fichiers) | 13.5 Ko (≤ 20.0 Ko) |
| Lecteur audio des phrases, à la demande au premier appui sur « Écouter » (2 fichiers) | 6.0 Ko (≤ 12.0 Ko) |
| Vidéos vivantes, à la demande au premier appui sur « Voir en vidéo » : lecteur v2 et générateur (4 fichiers) | 23.4 Ko (≤ 24.0 Ko) |
| Vidéos vivantes : lecteur v1 et générateur (interrupteur `video_v2` coupé ; 4 fichiers) | 18.4 Ko (≤ 24.0 Ko) |
| Vidéos vivantes du cahier de lecture : lecteur « cahier » et générateur (interrupteurs `cahier_lecture` et `video_v2` ; 3 fichiers) | 7.0 Ko (≤ 24.0 Ko) |
| Vidéos vivantes : tous les fichiers du groupe (deux lecteurs, jamais chargés ensemble) | 48.0 Ko |
| Cahier de lecture, à la demande à la première ouverture (6 fichiers) | 28.6 Ko (≤ 32.0 Ko) |
| Cahier « Je parle », à la demande à la première ouverture (2 fichiers) | 12.2 Ko (≤ 16.0 Ko) |
| « La prière de A à Z », à la demande à la première ouverture (20 fichiers) | 52.0 Ko (≤ 56.0 Ko) |
| « La prière de A à Z » : données de l'écran le plus lourd (`s5.json`, 25 fichiers, chargés écran par écran) | 13.7 Ko (≤ 24.0 Ko) |
| « Mots du Coran », à la demande à la première ouverture (2 fichiers) | 7.8 Ko (≤ 16.0 Ko) |
| Total JS + CSS de toutes les pages (mesuré, non bloquant) | 758.9 Ko |
| dont CSS | 94.7 Ko |
| Service worker | 8.4 Ko |
| Polices WOFF2 (une seule fois, déjà compressées) | 334.7 Ko (≤ 600.0 Ko) |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko (≤ 1024.0 Ko) |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/coran/lecteur` | 139.1 Ko |
| `/lecons/[id]` | 135.7 Ko |
| `/hifz/[outil]` | 114.0 Ko |
| `/hifz` | 113.8 Ko |
| `/enseignant/classe/[id]` | 111.9 Ko |
| `/inscription` | 111.5 Ko |
| `/lectures/[code]` | 111.0 Ko |
| `/lectures` | 111.0 Ko |
