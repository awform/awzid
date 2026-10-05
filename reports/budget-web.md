# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 141.6 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 362.2 Ko | ≤ 405.0 Ko |
| CSS (Brotli) | 37.8 Ko | — |
| Total JS + CSS de toutes les pages (Brotli) | 400.0 Ko | ≤ 405.0 Ko |
| dont pages du personnel, NON préchargées sur l'appareil d'un élève (19 fichiers) | 46.9 Ko | — |
| **Appareil d'un élève** : tout ce que garde le service worker (JS + CSS, Brotli) | 353.1 Ko | ≤ 355.0 Ko (objectif 325 Ko) |
| Service worker (Brotli) | 6.2 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko | ≤ 1024.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 141.6 Ko |
| `/coran/mushaf` | 119.2 Ko |
| `/enseignant/classe/[id]` | 116.9 Ko |
| `/coran/ecouter` | 116.7 Ko |
| `/lectures/[code]` | 116.0 Ko |
| `/` | 113.0 Ko |
| `/coran/memoriser` | 112.5 Ko |
| `/sciences` | 111.7 Ko |
