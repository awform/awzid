# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 130.0 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 269.4 Ko | ≤ 300.0 Ko |
| CSS (Brotli) | 24.1 Ko | — |
| Service worker (Brotli) | 3.9 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 130.0 Ko |
| `/enseignant/classe/[id]` | 109.8 Ko |
| `/lectures/[code]` | 107.9 Ko |
| `/coran/ecouter` | 107.2 Ko |
| `/coran/memoriser` | 105.6 Ko |
| `/hifz` | 101.0 Ko |
| `/aujourdhui` | 100.6 Ko |
| `/coran/lecteur` | 99.8 Ko |
