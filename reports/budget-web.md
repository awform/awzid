# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 135.1 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 367.9 Ko | ≤ 410.0 Ko |
| CSS (Brotli) | 40.6 Ko | — |
| Total JS + CSS de toutes les pages (Brotli) | 408.5 Ko | ≤ 410.0 Ko |
| dont pages du personnel, NON préchargées sur l'appareil d'un élève (21 fichiers) | 47.7 Ko | — |
| **Appareil d'un élève** : tout ce que précharge le service worker (JS + CSS, Brotli) | 348.0 Ko | ≤ 355.0 Ko (objectif 325 Ko) |
| dont leçons vivantes : générateurs, lecteur, modèles (2 fichiers, à la demande, non préchargés) | 12.8 Ko | ≤ 20.0 Ko |
| Service worker (Brotli) | 6.4 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko | ≤ 1024.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 135.1 Ko |
| `/coran/lecteur` | 128.3 Ko |
| `/enseignant/classe/[id]` | 109.0 Ko |
| `/lectures/[code]` | 107.9 Ko |
| `/` | 107.3 Ko |
| `/sciences` | 106.0 Ko |
| `/aujourdhui` | 102.7 Ko |
| `/vivre` | 98.9 Ko |
