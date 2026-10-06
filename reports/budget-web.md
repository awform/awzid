# Budget de poids et d’ouverture (mesuré après construction)

Indicateurs du lot F5 (décision du chef de projet) : ce que garde l’appareil d’un ÉLÈVE, ce que télécharge sa
PREMIÈRE OUVERTURE, et le temps d’ouverture en 3G simulée. Le total de toutes les pages reste affiché, sans être
bloquant. Compression Brotli (qualité 11).

| Indicateur | Mesure | Budget | Tenu |
|---|---|---|---|
| **(a) Appareil d'un élève** : JS + CSS préchargés et textes préchargés | 311.7 Ko | ≤ 350.0 Ko | oui |
| **(b) Première ouverture** : JS + CSS initiaux de l'accueil de l'élève (`/`) | 108.3 Ko | ≤ 150.0 Ko | oui |
| **(c) Ouverture en 3G simulée** (CPU ×4, 150 ms, 1,6 Mbit/s ; e2e/perf.spec.ts) | 3.02 s (élève, premier lancement ; relance 0.55 s ; mesuré le 2026-10-06) | < 3 s | **NON** |
| Page la plus lourde au premier chargement (`/lecons/[id]`) | 136.6 Ko | ≤ 150.0 Ko | oui |

## Détail

| Élément | Poids transféré |
|---|---|
| (a) dont JS + CSS de la coquille de l'élève | 307.3 Ko |
| (a) dont textes préchargés (`/i18n/fr-quotidien.json`, `/i18n/fr-vivre.json`) | 4.4 Ko |
| Pages du personnel, NON préchargées (27 fichiers) | 47.2 Ko |
| Pages rares, en ligne seulement, NON préchargées (32 fichiers) | 19.9 Ko |
| Modules à la demande qui ont besoin du réseau, NON préchargés (4 fichiers) | 4.7 Ko |
| Leçons vivantes, à la demande (2 fichiers) | 12.6 Ko (≤ 20.0 Ko) |
| Total JS + CSS de toutes les pages (mesuré, non bloquant) | 391.7 Ko |
| dont CSS | 39.9 Ko |
| Service worker | 6.1 Ko |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko (≤ 600.0 Ko) |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko (≤ 1024.0 Ko) |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/lecons/[id]` | 136.6 Ko |
| `/coran/lecteur` | 135.5 Ko |
| `/enseignant/classe/[id]` | 119.4 Ko |
| `/lectures/[code]` | 115.9 Ko |
| `/hifz` | 111.1 Ko |
| `/vivre` | 110.5 Ko |
| `/aujourdhui` | 109.9 Ko |
| `/quotidien` | 108.7 Ko |
