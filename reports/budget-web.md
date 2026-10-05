# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 142.0 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 361.1 Ko | ≤ 405.0 Ko |
| CSS (Brotli) | 38.4 Ko | — |
| Total JS + CSS de toutes les pages (Brotli) | 399.5 Ko | ≤ 405.0 Ko |
| dont pages du personnel, NON préchargées sur l'appareil d'un élève (19 fichiers) | 47.0 Ko | — |
| **Appareil d'un élève** : tout ce que garde le service worker (JS + CSS, Brotli) | 352.5 Ko | ≤ 355.0 Ko (objectif 325 Ko) |
| Service worker (Brotli) | 6.1 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko | ≤ 1024.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 142.0 Ko |
| `/coran/lecteur` | 132.0 Ko |
| `/enseignant/classe/[id]` | 117.1 Ko |
| `/lectures/[code]` | 116.3 Ko |
| `/` | 113.5 Ko |
| `/sciences` | 112.2 Ko |
| `/aujourdhui` | 111.3 Ko |
| `/hifz` | 107.8 Ko |
