# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 145.1 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 338.2 Ko | ≤ 375.0 Ko |
| CSS (Brotli) | 34.0 Ko | — |
| Service worker (Brotli) | 5.9 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko | ≤ 1024.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 145.1 Ko |
| `/coran/mushaf` | 122.4 Ko |
| `/coran/ecouter` | 120.0 Ko |
| `/enseignant/classe/[id]` | 119.9 Ko |
| `/lectures/[code]` | 119.5 Ko |
| `/coran/memoriser` | 115.7 Ko |
| `/coran/lecteur` | 112.2 Ko |
| `/hifz` | 111.0 Ko |
