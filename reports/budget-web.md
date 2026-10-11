# Budget de poids et d’ouverture (mesuré après construction)

Indicateurs du lot F5 (décision du chef de projet) : ce que garde l’appareil d’un ÉLÈVE, ce que télécharge sa
PREMIÈRE OUVERTURE, et le temps d’ouverture en 3G simulée. Le total de toutes les pages reste affiché, sans être
bloquant. Compression Brotli (qualité 11).

| Indicateur | Mesure | Budget | Tenu |
|---|---|---|---|
| **(a) Appareil d'un élève** : JS + CSS préchargés et textes préchargés | 338.1 Ko | ≤ 350.0 Ko | oui |
| **(b) Première ouverture** : JS + CSS initiaux de l'accueil de l'élève (`/`) | 112.0 Ko | ≤ 150.0 Ko | oui |
| **(c) Ouverture en 3G simulée** (CPU ×4, 150 ms, 1,6 Mbit/s ; e2e/perf.spec.ts) | 1.78 s (élève, premier lancement ; relance 0.55 s ; mesuré le 2026-10-11) | < 3 s | oui |
| Page la plus lourde au premier chargement (`/coran/lecteur`) | 145.7 Ko | ≤ 150.0 Ko | oui |

## Détail

| Élément | Poids transféré |
|---|---|
| (a) dont JS + CSS de la coquille de l'élève | 328.3 Ko |
| (a) dont textes préchargés (`/i18n/fr-quotidien.json`, `/i18n/fr-vivre.json`, `/i18n/fr-coran.json`) | 9.8 Ko |
| Pages du personnel, NON préchargées (27 fichiers) | 48.5 Ko |
| Pages rares, en ligne seulement, NON préchargées (37 fichiers) | 27.0 Ko |
| Modules à la demande qui ont besoin du réseau, NON préchargés (13 fichiers) | 22.3 Ko |
| Leçons vivantes, à la demande (2 fichiers) | 12.9 Ko (≤ 20.0 Ko) |
| Total JS + CSS de toutes les pages (mesuré, non bloquant) | 439.1 Ko |
| dont CSS | 46.3 Ko |
| Service worker | 6.5 Ko |
| Polices WOFF2 (une seule fois, déjà compressées) | 334.7 Ko (≤ 600.0 Ko) |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko (≤ 1024.0 Ko) |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/coran/lecteur` | 145.7 Ko |
| `/lecons/[id]` | 143.7 Ko |
| `/enseignant/classe/[id]` | 120.4 Ko |
| `/lectures/[code]` | 117.0 Ko |
| `/hifz` | 113.9 Ko |
| `/` | 112.0 Ko |
| `/sciences` | 111.6 Ko |
| `/vivre` | 111.6 Ko |
