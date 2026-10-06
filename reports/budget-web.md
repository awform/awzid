# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 135.4 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 363.8 Ko | ≤ 410.0 Ko |
| CSS (Brotli) | 40.6 Ko | — |
| Total JS + CSS de toutes les pages (Brotli) | 404.4 Ko | ≤ 410.0 Ko |
| dont pages du personnel, NON préchargées sur l'appareil d'un élève (21 fichiers) | 40.3 Ko | — |
| **Appareil d'un élève** : tout ce que précharge le service worker (JS + CSS, Brotli) | 351.3 Ko | ≤ 355.0 Ko (objectif 325 Ko) |
| dont leçons vivantes : générateurs, lecteur, modèles (2 fichiers, à la demande, non préchargés) | 12.7 Ko | ≤ 20.0 Ko |
| Service worker (Brotli) | 6.5 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko | ≤ 1024.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 135.4 Ko |
| `/coran/lecteur` | 128.5 Ko |
| `/enseignant/classe/[id]` | 109.2 Ko |
| `/lectures/[code]` | 108.1 Ko |
| `/` | 107.6 Ko |
| `/sciences` | 106.3 Ko |
| `/aujourdhui` | 102.9 Ko |
| `/vivre` | 99.1 Ko |
