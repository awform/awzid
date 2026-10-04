# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 128.9 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 264.3 Ko | ≤ 300.0 Ko |
| CSS (Brotli) | 23.1 Ko | — |
| Service worker (Brotli) | 3.8 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 128.9 Ko |
| `/enseignant/classe/[id]` | 108.7 Ko |
| `/lectures/[code]` | 106.8 Ko |
| `/coran/ecouter` | 101.6 Ko |
| `/coran/memoriser` | 100.0 Ko |
| `/hifz` | 99.8 Ko |
| `/aujourdhui` | 99.5 Ko |
| `/enseignant` | 95.9 Ko |
