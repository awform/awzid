# Budget de poids et d’ouverture (mesuré après construction)

Indicateurs du lot F5 (décision du chef de projet) : ce que garde l’appareil d’un ÉLÈVE, ce que télécharge sa
PREMIÈRE OUVERTURE, et le temps d’ouverture en 3G simulée. Le total de toutes les pages reste affiché, sans être
bloquant. Compression Brotli (qualité 11).

| Indicateur | Mesure | Budget | Tenu |
|---|---|---|---|
| **(a) Appareil d'un élève** : JS + CSS préchargés et textes préchargés | 346.9 Ko | ≤ 350.0 Ko | oui |
| (a) marge restante sous le budget de l'appareil élève | 3.1 Ko | ≥ 3.0 Ko | oui |
| **(b) Première ouverture** : JS + CSS initiaux de l'accueil de l'élève (`/`) | 100.2 Ko | ≤ 150.0 Ko | oui |
| **(c) Ouverture en 3G simulée** (CPU ×4, 150 ms, 1,6 Mbit/s ; e2e/perf.spec.ts) | 2.73 s (élève, premier lancement ; relance 0.94 s ; mesuré le 2026-10-25) | < 3 s | oui |
| Page la plus lourde au premier chargement (`/coran/lecteur`) | 135.9 Ko | ≤ 150.0 Ko | oui |

## Détail

| Élément | Poids transféré |
|---|---|
| (a) dont JS + CSS de la coquille de l'élève | 322.2 Ko |
| (a) dont textes préchargés (`/i18n/fr-quotidien.json`, `/i18n/fr-vivre.json`, `/i18n/fr-coran.json`, `/i18n/fr-hifz.json`, `/i18n/fr-arabe.json`, `/i18n/fr-suivi.json`) | 24.7 Ko |
| Pages du personnel, NON préchargées (27 fichiers) | 53.9 Ko |
| Pages rares, en ligne seulement, NON préchargées (66 fichiers) | 63.2 Ko |
| Modules à la demande qui ont besoin du réseau, NON préchargés (23 fichiers) | 34.9 Ko |
| Pages de l’élève gardées au premier usage (Madjaliss, cahier « Je parle »), NON préchargées (10 fichiers) | 35.7 Ko |
| Leçons vivantes, à la demande (2 fichiers) | 13.2 Ko (≤ 20.0 Ko) |
| Lecteur audio des phrases, à la demande au premier appui sur « Écouter » (2 fichiers) | 5.6 Ko (≤ 12.0 Ko) |
| Vidéos vivantes, à la demande au premier appui sur « Voir en vidéo » : lecteur v2 et générateur (4 fichiers) | 22.8 Ko (≤ 24.0 Ko) |
| Vidéos vivantes : lecteur v1 et générateur (interrupteur `video_v2` coupé ; 4 fichiers) | 18.0 Ko (≤ 24.0 Ko) |
| Vidéos vivantes du cahier de lecture : lecteur « cahier » et générateur (interrupteurs `cahier_lecture` et `video_v2` ; 3 fichiers) | 6.9 Ko (≤ 24.0 Ko) |
| Vidéos vivantes : tous les fichiers du groupe (deux lecteurs, jamais chargés ensemble) | 40.0 Ko |
| Cahier de lecture, à la demande à la première ouverture (2 fichiers) | 14.7 Ko (≤ 24.0 Ko) |
| Cahier « Je parle », à la demande à la première ouverture (2 fichiers) | 10.7 Ko (≤ 16.0 Ko) |
| Total JS + CSS de toutes les pages (mesuré, non bloquant) | 583.5 Ko |
| dont CSS | 74.6 Ko |
| Service worker | 8.2 Ko |
| Polices WOFF2 (une seule fois, déjà compressées) | 334.7 Ko (≤ 600.0 Ko) |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko (≤ 1024.0 Ko) |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/coran/lecteur` | 135.9 Ko |
| `/lecons/[id]` | 133.4 Ko |
| `/hifz/[outil]` | 112.6 Ko |
| `/hifz` | 112.4 Ko |
| `/enseignant/classe/[id]` | 108.5 Ko |
| `/lectures` | 108.3 Ko |
| `/lectures/[code]` | 108.3 Ko |
| `/quotidien` | 107.2 Ko |
