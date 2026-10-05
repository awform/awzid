# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 137.7 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 330.1 Ko | ≤ 365.0 Ko |
| CSS (Brotli) | 31.9 Ko | — |
| Service worker (Brotli) | 5.8 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko | ≤ 1024.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 137.7 Ko |
| `/coran/mushaf` | 115.6 Ko |
| `/coran/ecouter` | 113.1 Ko |
| `/enseignant/classe/[id]` | 113.1 Ko |
| `/lectures/[code]` | 112.7 Ko |
| `/coran/memoriser` | 108.8 Ko |
| `/coran/lecteur` | 105.3 Ko |
| `/hifz` | 104.3 Ko |
