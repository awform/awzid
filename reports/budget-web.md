# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 141.1 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 332.5 Ko | ≤ 370.0 Ko |
| CSS (Brotli) | 33.9 Ko | — |
| Service worker (Brotli) | 5.5 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko | ≤ 1024.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 141.1 Ko |
| `/coran/mushaf` | 121.0 Ko |
| `/coran/ecouter` | 118.6 Ko |
| `/enseignant/classe/[id]` | 118.5 Ko |
| `/lectures/[code]` | 118.1 Ko |
| `/coran/memoriser` | 114.3 Ko |
| `/coran/lecteur` | 110.8 Ko |
| `/hifz` | 109.6 Ko |
