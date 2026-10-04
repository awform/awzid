# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 131.9 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 274.3 Ko | ≤ 300.0 Ko |
| CSS (Brotli) | 24.4 Ko | — |
| Service worker (Brotli) | 4.0 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 131.9 Ko |
| `/enseignant/classe/[id]` | 111.9 Ko |
| `/lectures/[code]` | 109.6 Ko |
| `/coran/ecouter` | 108.7 Ko |
| `/coran/memoriser` | 107.0 Ko |
| `/hifz` | 102.5 Ko |
| `/aujourdhui` | 102.2 Ko |
| `/coran/lecteur` | 101.2 Ko |
