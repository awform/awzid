# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 132.8 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 285.4 Ko | ≤ 315.0 Ko |
| CSS (Brotli) | 27.4 Ko | — |
| Service worker (Brotli) | 4.3 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 132.8 Ko |
| `/coran/mushaf` | 112.9 Ko |
| `/enseignant/classe/[id]` | 112.7 Ko |
| `/lectures/[code]` | 110.4 Ko |
| `/coran/ecouter` | 110.2 Ko |
| `/coran/memoriser` | 108.5 Ko |
| `/hifz` | 103.3 Ko |
| `/aujourdhui` | 103.0 Ko |
