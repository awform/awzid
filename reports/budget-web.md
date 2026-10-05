# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 139.4 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 299.6 Ko | ≤ 330.0 Ko |
| CSS (Brotli) | 28.0 Ko | — |
| Service worker (Brotli) | 5.6 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko | ≤ 1024.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 139.4 Ko |
| `/coran/mushaf` | 117.3 Ko |
| `/coran/ecouter` | 114.9 Ko |
| `/enseignant/classe/[id]` | 114.8 Ko |
| `/lectures/[code]` | 114.5 Ko |
| `/coran/memoriser` | 110.6 Ko |
| `/coran/lecteur` | 107.1 Ko |
| `/hifz` | 105.4 Ko |
