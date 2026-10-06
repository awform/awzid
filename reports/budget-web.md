# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 142.5 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 366.5 Ko | ≤ 405.0 Ko |
| CSS (Brotli) | 38.2 Ko | — |
| Total JS + CSS de toutes les pages (Brotli) | 404.7 Ko | ≤ 405.0 Ko |
| dont pages du personnel, NON préchargées sur l'appareil d'un élève (19 fichiers) | 46.9 Ko | — |
| **Appareil d'un élève** : tout ce que précharge le service worker (JS + CSS, Brotli) | 345.2 Ko | ≤ 355.0 Ko (objectif 325 Ko) |
| dont leçons vivantes : générateurs, lecteur, modèles (2 fichiers, à la demande, non préchargés) | 12.6 Ko | ≤ 20.0 Ko |
| Service worker (Brotli) | 6.2 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko | ≤ 1024.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 142.5 Ko |
| `/coran/mushaf` | 119.4 Ko |
| `/enseignant/classe/[id]` | 117.1 Ko |
| `/coran/ecouter` | 116.9 Ko |
| `/lectures/[code]` | 116.3 Ko |
| `/` | 113.2 Ko |
| `/coran/memoriser` | 112.6 Ko |
| `/sciences` | 111.9 Ko |
