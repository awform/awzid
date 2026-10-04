# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 123.6 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 262.4 Ko | ≤ 300.0 Ko |
| CSS (Brotli) | 23.6 Ko | — |
| Service worker (Brotli) | 3.9 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 123.6 Ko |
| `/enseignant/classe/[id]` | 109.5 Ko |
| `/lectures/[code]` | 107.5 Ko |
| `/coran/ecouter` | 106.5 Ko |
| `/coran/memoriser` | 104.9 Ko |
| `/hifz` | 100.6 Ko |
| `/aujourdhui` | 100.3 Ko |
| `/coran/lecteur` | 99.1 Ko |
