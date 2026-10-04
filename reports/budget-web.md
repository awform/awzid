# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 123.7 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 263.0 Ko | ≤ 300.0 Ko |
| CSS (Brotli) | 23.6 Ko | — |
| Service worker (Brotli) | 4.0 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 123.7 Ko |
| `/enseignant/classe/[id]` | 109.5 Ko |
| `/lectures/[code]` | 107.5 Ko |
| `/coran/ecouter` | 106.9 Ko |
| `/coran/memoriser` | 105.2 Ko |
| `/hifz` | 100.6 Ko |
| `/aujourdhui` | 100.2 Ko |
| `/coran/lecteur` | 99.5 Ko |
