# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 122.5 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 257.8 Ko | ≤ 300.0 Ko |
| CSS (Brotli) | 22.5 Ko | — |
| Service worker (Brotli) | 3.7 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 122.5 Ko |
| `/enseignant/classe/[id]` | 108.3 Ko |
| `/lectures/[code]` | 106.3 Ko |
| `/coran/ecouter` | 101.2 Ko |
| `/coran/memoriser` | 99.6 Ko |
| `/hifz` | 99.4 Ko |
| `/aujourdhui` | 99.0 Ko |
| `/enseignant` | 95.4 Ko |
