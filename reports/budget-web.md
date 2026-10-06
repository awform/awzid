# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 143.5 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 370.4 Ko | ≤ 410.0 Ko |
| CSS (Brotli) | 39.3 Ko | — |
| Total JS + CSS de toutes les pages (Brotli) | 409.8 Ko | ≤ 410.0 Ko |
| dont pages du personnel, NON préchargées sur l'appareil d'un élève (19 fichiers) | 47.0 Ko | — |
| **Appareil d'un élève** : tout ce que précharge le service worker (JS + CSS, Brotli) | 350.0 Ko | ≤ 355.0 Ko (objectif 325 Ko) |
| dont leçons vivantes : générateurs, lecteur, modèles (2 fichiers, à la demande, non préchargés) | 12.8 Ko | ≤ 20.0 Ko |
| Service worker (Brotli) | 6.2 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko | ≤ 1024.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 143.5 Ko |
| `/coran/lecteur` | 137.4 Ko |
| `/enseignant/classe/[id]` | 117.9 Ko |
| `/lectures/[code]` | 117.1 Ko |
| `/` | 114.3 Ko |
| `/sciences` | 113.0 Ko |
| `/aujourdhui` | 112.0 Ko |
| `/hifz` | 108.5 Ko |
