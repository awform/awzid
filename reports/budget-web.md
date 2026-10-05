# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 143.9 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 329.6 Ko | ≤ 365.0 Ko |
| CSS (Brotli) | 31.3 Ko | — |
| Service worker (Brotli) | 5.9 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko | ≤ 1024.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 143.9 Ko |
| `/coran/mushaf` | 121.8 Ko |
| `/coran/ecouter` | 119.3 Ko |
| `/enseignant/classe/[id]` | 119.3 Ko |
| `/lectures/[code]` | 118.9 Ko |
| `/coran/memoriser` | 115.0 Ko |
| `/coran/lecteur` | 111.5 Ko |
| `/hifz` | 110.5 Ko |
