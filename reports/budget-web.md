# Budget de poids et d’ouverture (mesuré après construction)

Indicateurs du lot F5 (décision du chef de projet) : ce que garde l’appareil d’un ÉLÈVE, ce que télécharge sa
PREMIÈRE OUVERTURE, et le temps d’ouverture en 3G simulée. Le total de toutes les pages reste affiché, sans être
bloquant. Compression Brotli (qualité 11).

| Indicateur | Mesure | Budget | Tenu |
|---|---|---|---|
| **(a) Appareil d'un élève** : JS + CSS préchargés et textes préchargés | 346.7 Ko | ≤ 350.0 Ko | oui |
| **(b) Première ouverture** : JS + CSS initiaux de l'accueil de l'élève (`/`) | 112.0 Ko | ≤ 150.0 Ko | oui |
| **(c) Ouverture en 3G simulée** (CPU ×4, 150 ms, 1,6 Mbit/s ; e2e/perf.spec.ts) | 2.00 s (élève, premier lancement ; relance 0.92 s ; mesuré le 2026-10-12) | < 3 s | oui |
| Page la plus lourde au premier chargement (`/coran/lecteur`) | 147.8 Ko | ≤ 150.0 Ko | oui |

## Détail

| Élément | Poids transféré |
|---|---|
| (a) dont JS + CSS de la coquille de l'élève | 335.6 Ko |
| (a) dont textes préchargés (`/i18n/fr-quotidien.json`, `/i18n/fr-vivre.json`, `/i18n/fr-coran.json`, `/i18n/fr-hifz.json`) | 11.2 Ko |
| Pages du personnel, NON préchargées (27 fichiers) | 48.2 Ko |
| Pages rares, en ligne seulement, NON préchargées (37 fichiers) | 27.1 Ko |
| Modules à la demande qui ont besoin du réseau, NON préchargés (17 fichiers) | 28.3 Ko |
| Pages de l'élève gardées au premier usage (Madjaliss), NON préchargées (4 fichiers) | 11.4 Ko |
| Leçons vivantes, à la demande (2 fichiers) | 12.8 Ko (≤ 20.0 Ko) |
| Total JS + CSS de toutes les pages (mesuré, non bloquant) | 463.5 Ko |
| dont CSS | 50.0 Ko |
| Service worker | 7.0 Ko |
| Polices WOFF2 (une seule fois, déjà compressées) | 334.7 Ko (≤ 600.0 Ko) |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko (≤ 1024.0 Ko) |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/coran/lecteur` | 147.8 Ko |
| `/lecons/[id]` | 144.4 Ko |
| `/hifz/[outil]` | 124.4 Ko |
| `/hifz` | 124.2 Ko |
| `/enseignant/classe/[id]` | 120.2 Ko |
| `/lectures` | 120.0 Ko |
| `/lectures/[code]` | 120.0 Ko |
| `/quotidien/adhkar` | 118.8 Ko |
