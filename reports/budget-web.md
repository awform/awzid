# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 132.5 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 284.6 Ko | ≤ 315.0 Ko |
| CSS (Brotli) | 26.0 Ko | — |
| Service worker (Brotli) | 4.3 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 132.5 Ko |
| `/enseignant/classe/[id]` | 112.4 Ko |
| `/coran/mushaf` | 110.8 Ko |
| `/lectures/[code]` | 110.1 Ko |
| `/coran/ecouter` | 109.9 Ko |
| `/coran/memoriser` | 108.3 Ko |
| `/hifz` | 103.0 Ko |
| `/aujourdhui` | 102.7 Ko |
