# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 135.5 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 293.9 Ko | ≤ 325.0 Ko |
| CSS (Brotli) | 27.8 Ko | — |
| Service worker (Brotli) | 5.2 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko | ≤ 1024.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 135.5 Ko |
| `/coran/mushaf` | 115.7 Ko |
| `/coran/ecouter` | 113.4 Ko |
| `/enseignant/classe/[id]` | 113.3 Ko |
| `/lectures/[code]` | 113.0 Ko |
| `/coran/memoriser` | 109.1 Ko |
| `/coran/lecteur` | 105.6 Ko |
| `/hifz` | 104.0 Ko |
