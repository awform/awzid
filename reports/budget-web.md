# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 143.8 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 329.5 Ko | ≤ 365.0 Ko |
| CSS (Brotli) | 31.3 Ko | — |
| Service worker (Brotli) | 5.8 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko | ≤ 1024.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 143.8 Ko |
| `/coran/mushaf` | 121.6 Ko |
| `/coran/ecouter` | 119.2 Ko |
| `/enseignant/classe/[id]` | 119.1 Ko |
| `/lectures/[code]` | 118.8 Ko |
| `/coran/memoriser` | 114.9 Ko |
| `/coran/lecteur` | 111.4 Ko |
| `/hifz` | 110.3 Ko |
