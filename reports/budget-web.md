# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 139.9 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 323.7 Ko | ≤ 360.0 Ko |
| CSS (Brotli) | 31.2 Ko | — |
| Service worker (Brotli) | 5.4 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko | ≤ 1024.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 139.9 Ko |
| `/coran/mushaf` | 120.2 Ko |
| `/coran/ecouter` | 117.7 Ko |
| `/enseignant/classe/[id]` | 117.7 Ko |
| `/lectures/[code]` | 117.3 Ko |
| `/coran/memoriser` | 113.4 Ko |
| `/coran/lecteur` | 109.9 Ko |
| `/hifz` | 108.9 Ko |
