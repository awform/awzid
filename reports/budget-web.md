# Budget de poids et d’ouverture (mesuré après construction)

Indicateurs du lot F5 (décision du chef de projet) : ce que garde l’appareil d’un ÉLÈVE, ce que télécharge sa
PREMIÈRE OUVERTURE, et le temps d’ouverture en 3G simulée. Le total de toutes les pages reste affiché, sans être
bloquant. Compression Brotli (qualité 11).

| Indicateur | Mesure | Budget | Tenu |
|---|---|---|---|
| **(a) Appareil d'un élève** : JS + CSS préchargés et textes préchargés | 345.8 Ko | ≤ 350.0 Ko | oui |
| (a) marge restante sous le budget de l'appareil élève | 4.2 Ko | ≥ 3.0 Ko | oui |
| **(b) Première ouverture** : JS + CSS initiaux de l'accueil de l'élève (`/`) | 112.6 Ko | ≤ 150.0 Ko | oui |
| **(c) Ouverture en 3G simulée** (CPU ×4, 150 ms, 1,6 Mbit/s ; e2e/perf.spec.ts) | 1.83 s (élève, premier lancement ; relance 0.56 s ; mesuré le 2026-10-16) | < 3 s | oui |
| Page la plus lourde au premier chargement (`/coran/lecteur`) | 148.5 Ko | ≤ 150.0 Ko | oui |

## Détail

| Élément | Poids transféré |
|---|---|
| (a) dont JS + CSS de la coquille de l'élève | 334.7 Ko |
| (a) dont textes préchargés (`/i18n/fr-quotidien.json`, `/i18n/fr-vivre.json`, `/i18n/fr-coran.json`, `/i18n/fr-hifz.json`) | 11.2 Ko |
| Pages du personnel, NON préchargées (27 fichiers) | 51.8 Ko |
| Pages rares, en ligne seulement, NON préchargées (53 fichiers) | 42.1 Ko |
| Modules à la demande qui ont besoin du réseau, NON préchargés (21 fichiers) | 33.0 Ko |
| Pages de l'élève gardées au premier usage (Madjaliss), NON préchargées (4 fichiers) | 15.2 Ko |
| Leçons vivantes, à la demande (2 fichiers) | 12.8 Ko (≤ 20.0 Ko) |
| Total JS + CSS de toutes les pages (mesuré, non bloquant) | 489.7 Ko |
| dont CSS | 54.2 Ko |
| Service worker | 7.7 Ko |
| Polices WOFF2 (une seule fois, déjà compressées) | 334.7 Ko (≤ 600.0 Ko) |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko (≤ 1024.0 Ko) |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/coran/lecteur` | 148.5 Ko |
| `/lecons/[id]` | 145.3 Ko |
| `/hifz/[outil]` | 125.0 Ko |
| `/hifz` | 124.9 Ko |
| `/enseignant/classe/[id]` | 120.8 Ko |
| `/lectures` | 120.7 Ko |
| `/lectures/[code]` | 120.7 Ko |
| `/quotidien` | 119.5 Ko |
