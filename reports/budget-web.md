# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 120.3 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 239.6 Ko | ≤ 300.0 Ko |
| CSS (Brotli) | 20.4 Ko | — |
| Service worker (Brotli) | 3.6 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 120.3 Ko |
| `/enseignant/classe/[id]` | 105.4 Ko |
| `/lectures/[code]` | 104.2 Ko |
| `/hifz` | 97.2 Ko |
| `/aujourdhui` | 96.5 Ko |
| `/enseignant` | 93.3 Ko |
| `/revisions` | 92.8 Ko |
| `/suivi` | 91.8 Ko |
