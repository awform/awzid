# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 142.9 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 364.0 Ko | ≤ 405.0 Ko |
| CSS (Brotli) | 37.9 Ko | — |
| Total JS + CSS de toutes les pages (Brotli) | 401.9 Ko | ≤ 405.0 Ko |
| dont pages du personnel, NON préchargées sur l'appareil d'un élève (19 fichiers) | 47.1 Ko | — |
| **Appareil d'un élève** : tout ce que garde le service worker (JS + CSS, Brotli) | 354.8 Ko | ≤ 355.0 Ko (objectif 325 Ko) |
| Service worker (Brotli) | 6.2 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko | ≤ 1024.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 142.9 Ko |
| `/coran/mushaf` | 119.1 Ko |
| `/enseignant/classe/[id]` | 117.0 Ko |
| `/coran/ecouter` | 116.7 Ko |
| `/lectures/[code]` | 116.1 Ko |
| `/` | 113.0 Ko |
| `/coran/memoriser` | 112.4 Ko |
| `/sciences` | 111.7 Ko |
