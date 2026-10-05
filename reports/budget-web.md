# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 133.1 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 289.9 Ko | ≤ 320.0 Ko |
| CSS (Brotli) | 27.6 Ko | — |
| Service worker (Brotli) | 5.2 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko | ≤ 1024.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 133.1 Ko |
| `/coran/mushaf` | 115.5 Ko |
| `/coran/ecouter` | 113.1 Ko |
| `/enseignant/classe/[id]` | 113.1 Ko |
| `/lectures/[code]` | 110.7 Ko |
| `/coran/memoriser` | 108.9 Ko |
| `/coran/lecteur` | 105.4 Ko |
| `/hifz` | 103.7 Ko |
