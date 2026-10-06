# Budget de poids de la coquille (mesuré après construction)

| Élément | Poids transféré | Budget |
|---|---|---|
| JavaScript + CSS initiaux, page la plus lourde (`/lecons/[id]`, Brotli) | 138.8 Ko | ≤ 150.0 Ko |
| JavaScript de toutes les pages (Brotli) | 376.1 Ko | ≤ 418.0 Ko |
| CSS (Brotli) | 41.3 Ko | — |
| Total JS + CSS de toutes les pages (Brotli) | 417.4 Ko | ≤ 418.0 Ko |
| dont pages du personnel, NON préchargées sur l'appareil d'un élève (21 fichiers) | 40.3 Ko | — |
| **Appareil d'un élève** : tout ce que précharge le service worker (JS + CSS, Brotli) | 354.8 Ko | ≤ 355.0 Ko (objectif 325 Ko) |
| dont leçons vivantes : générateurs, lecteur, modèles (2 fichiers, à la demande, non préchargés) | 12.8 Ko | ≤ 20.0 Ko |
| dont « Réciter et vérifier » (A5, 5 fichiers, en ligne seulement, non préchargés) | 9.6 Ko | ≤ 12.0 Ko |
| Service worker (Brotli) | 6.6 Ko | — |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko | ≤ 600.0 Ko |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko | ≤ 1024.0 Ko |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 138.8 Ko |
| `/coran/lecteur` | 131.0 Ko |
| `/enseignant/classe/[id]` | 112.6 Ko |
| `/lectures/[code]` | 111.6 Ko |
| `/` | 111.1 Ko |
| `/sciences` | 109.8 Ko |
| `/aujourdhui` | 106.4 Ko |
| `/hifz` | 105.3 Ko |
