# Budget de poids et d’ouverture (mesuré après construction)

Indicateurs du lot F5 (décision du chef de projet) : ce que garde l’appareil d’un ÉLÈVE, ce que télécharge sa
PREMIÈRE OUVERTURE, et le temps d’ouverture en 3G simulée. Le total de toutes les pages reste affiché, sans être
bloquant. Compression Brotli (qualité 11).

| Indicateur | Mesure | Budget | Tenu |
|---|---|---|---|
| **(a) Appareil d'un élève** : JS + CSS préchargés et textes préchargés | 339.3 Ko | ≤ 350.0 Ko | oui |
| **(b) Première ouverture** : JS + CSS initiaux de l'accueil de l'élève (`/`) | 112.1 Ko | ≤ 150.0 Ko | oui |
| **(c) Ouverture en 3G simulée** (CPU ×4, 150 ms, 1,6 Mbit/s ; e2e/perf.spec.ts) | 3.00 s (élève, premier lancement ; relance 1.58 s ; mesuré le 2026-10-12) | < 3 s | oui |
| Page la plus lourde au premier chargement (`/coran/lecteur`) | 146.6 Ko | ≤ 150.0 Ko | oui |

## Détail

| Élément | Poids transféré |
|---|---|
| (a) dont JS + CSS de la coquille de l'élève | 329.5 Ko |
| (a) dont textes préchargés (`/i18n/fr-quotidien.json`, `/i18n/fr-vivre.json`, `/i18n/fr-coran.json`) | 9.8 Ko |
| Pages du personnel, NON préchargées (27 fichiers) | 48.2 Ko |
| Pages rares, en ligne seulement, NON préchargées (37 fichiers) | 26.9 Ko |
| Modules à la demande qui ont besoin du réseau, NON préchargés (13 fichiers) | 22.4 Ko |
| Leçons vivantes, à la demande (2 fichiers) | 12.9 Ko (≤ 20.0 Ko) |
| Total JS + CSS de toutes les pages (mesuré, non bloquant) | 439.9 Ko |
| dont CSS | 46.6 Ko |
| Service worker | 6.7 Ko |
| Polices WOFF2 (une seule fois, déjà compressées) | 334.7 Ko (≤ 600.0 Ko) |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko (≤ 1024.0 Ko) |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/coran/lecteur` | 146.6 Ko |
| `/lecons/[id]` | 143.7 Ko |
| `/enseignant/classe/[id]` | 120.4 Ko |
| `/lectures/[code]` | 117.1 Ko |
| `/hifz` | 114.0 Ko |
| `/` | 112.1 Ko |
| `/vivre` | 111.7 Ko |
| `/sciences` | 111.7 Ko |
