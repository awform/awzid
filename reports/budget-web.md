# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 140.2 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 369.0 Ko | ≤ 410.0 Ko |
| CSS (Brotli) | 40.1 Ko | — |
| Total JS + CSS de toutes les pages (Brotli) | 409.0 Ko | ≤ 410.0 Ko |
| dont pages du personnel, NON préchargées sur l'appareil d'un élève (19 fichiers) | 47.0 Ko | — |
| **Appareil d'un élève** : tout ce que précharge le service worker (JS + CSS, Brotli) | 349.3 Ko | ≤ 355.0 Ko (objectif 325 Ko) |
| dont leçons vivantes : générateurs, lecteur, modèles (2 fichiers, à la demande, non préchargés) | 12.8 Ko | ≤ 20.0 Ko |
| Service worker (Brotli) | 6.3 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko | ≤ 1024.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 140.2 Ko |
| `/coran/lecteur` | 131.7 Ko |
| `/enseignant/classe/[id]` | 114.4 Ko |
| `/lectures/[code]` | 113.3 Ko |
| `/` | 110.5 Ko |
| `/sciences` | 109.2 Ko |
| `/aujourdhui` | 108.1 Ko |
| `/hifz` | 104.6 Ko |
