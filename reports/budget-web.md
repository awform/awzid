# Budget de poids et d’ouverture (mesuré après construction)

Indicateurs du lot F5 (décision du chef de projet) : ce que garde l’appareil d’un ÉLÈVE, ce que télécharge sa
PREMIÈRE OUVERTURE, et le temps d’ouverture en 3G simulée. Le total de toutes les pages reste affiché, sans être
bloquant. Compression Brotli (qualité 11).

| Indicateur | Mesure | Budget | Tenu |
|---|---|---|---|
| **(a) Appareil d'un élève** : JS + CSS préchargés et textes préchargés | 317.5 Ko | ≤ 350.0 Ko | oui |
| **(b) Première ouverture** : JS + CSS initiaux de l'accueil de l'élève (`/`) | 105.7 Ko | ≤ 150.0 Ko | oui |
| **(c) Ouverture en 3G simulée** (CPU ×4, 150 ms, 1,6 Mbit/s ; e2e/perf.spec.ts) | 1.94 s (élève, premier lancement ; relance 0.79 s ; mesuré le 2026-10-11) | < 3 s | oui |
| Page la plus lourde au premier chargement (`/coran/lecteur`) | 135.7 Ko | ≤ 150.0 Ko | oui |

## Détail

| Élément | Poids transféré |
|---|---|
| (a) dont JS + CSS de la coquille de l'élève | 308.3 Ko |
| (a) dont textes préchargés (`/i18n/fr-quotidien.json`, `/i18n/fr-vivre.json`, `/i18n/fr-coran.json`) | 9.2 Ko |
| Pages du personnel, NON préchargées (27 fichiers) | 47.6 Ko |
| Pages rares, en ligne seulement, NON préchargées (32 fichiers) | 19.9 Ko |
| Modules à la demande qui ont besoin du réseau, NON préchargés (4 fichiers) | 4.7 Ko |
| Leçons vivantes, à la demande (2 fichiers) | 12.7 Ko (≤ 20.0 Ko) |
| Total JS + CSS de toutes les pages (mesuré, non bloquant) | 393.2 Ko |
| dont CSS | 40.2 Ko |
| Service worker | 6.2 Ko |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko (≤ 600.0 Ko) |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko (≤ 1024.0 Ko) |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/coran/lecteur` | 135.7 Ko |
| `/lecons/[id]` | 134.1 Ko |
| `/enseignant/classe/[id]` | 116.8 Ko |
| `/lectures/[code]` | 113.3 Ko |
| `/hifz` | 108.4 Ko |
| `/vivre` | 107.8 Ko |
| `/aujourdhui` | 107.2 Ko |
| `/quotidien` | 106.1 Ko |
