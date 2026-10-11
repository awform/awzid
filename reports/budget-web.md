# Budget de poids et d’ouverture (mesuré après construction)

Indicateurs du lot F5 (décision du chef de projet) : ce que garde l’appareil d’un ÉLÈVE, ce que télécharge sa
PREMIÈRE OUVERTURE, et le temps d’ouverture en 3G simulée. Le total de toutes les pages reste affiché, sans être
bloquant. Compression Brotli (qualité 11).

| Indicateur | Mesure | Budget | Tenu |
|---|---|---|---|
| **(a) Appareil d'un élève** : JS + CSS préchargés et textes préchargés | 326.5 Ko | ≤ 350.0 Ko | oui |
| **(b) Première ouverture** : JS + CSS initiaux de l'accueil de l'élève (`/`) | 107.9 Ko | ≤ 150.0 Ko | oui |
| **(c) Ouverture en 3G simulée** (CPU ×4, 150 ms, 1,6 Mbit/s ; e2e/perf.spec.ts) | 1.79 s (élève, premier lancement ; relance 0.53 s ; mesuré le 2026-10-11) | < 3 s | oui |
| Page la plus lourde au premier chargement (`/coran/lecteur`) | 140.2 Ko | ≤ 150.0 Ko | oui |

## Détail

| Élément | Poids transféré |
|---|---|
| (a) dont JS + CSS de la coquille de l'élève | 317.1 Ko |
| (a) dont textes préchargés (`/i18n/fr-quotidien.json`, `/i18n/fr-vivre.json`, `/i18n/fr-coran.json`) | 9.4 Ko |
| Pages du personnel, NON préchargées (27 fichiers) | 48.3 Ko |
| Pages rares, en ligne seulement, NON préchargées (34 fichiers) | 22.3 Ko |
| Modules à la demande qui ont besoin du réseau, NON préchargés (9 fichiers) | 14.3 Ko |
| Leçons vivantes, à la demande (2 fichiers) | 12.8 Ko (≤ 20.0 Ko) |
| Total JS + CSS de toutes les pages (mesuré, non bloquant) | 414.8 Ko |
| dont CSS | 42.4 Ko |
| Service worker | 6.4 Ko |
| Polices WOFF2 (une seule fois, déjà compressées) | 222.6 Ko (≤ 600.0 Ko) |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko (≤ 1024.0 Ko) |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/coran/lecteur` | 140.2 Ko |
| `/lecons/[id]` | 136.2 Ko |
| `/enseignant/classe/[id]` | 119.1 Ko |
| `/lectures/[code]` | 115.5 Ko |
| `/hifz` | 112.6 Ko |
| `/vivre` | 110.0 Ko |
| `/aujourdhui` | 109.4 Ko |
| `/admin` | 108.6 Ko |
