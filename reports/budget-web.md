# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 130.7 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 269.2 Ko | ≤ 300.0 Ko |
| CSS (Brotli) | 23.3 Ko | — |
| Service worker (Brotli) | 3.8 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 130.7 Ko |
| `/enseignant/classe/[id]` | 110.7 Ko |
| `/lectures/[code]` | 108.4 Ko |
| `/coran/ecouter` | 103.0 Ko |
| `/coran/memoriser` | 101.4 Ko |
| `/hifz` | 101.3 Ko |
| `/aujourdhui` | 101.0 Ko |
| `/enseignant` | 97.4 Ko |
