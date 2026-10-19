# Budget de poids et d’ouverture (mesuré après construction)

Indicateurs du lot F5 (décision du chef de projet) : ce que garde l’appareil d’un ÉLÈVE, ce que télécharge sa
PREMIÈRE OUVERTURE, et le temps d’ouverture en 3G simulée. Le total de toutes les pages reste affiché, sans être
bloquant. Compression Brotli (qualité 11).

| Indicateur | Mesure | Budget | Tenu |
|---|---|---|---|
| **(a) Appareil d'un élève** : JS + CSS préchargés et textes préchargés | 345.9 Ko | ≤ 350.0 Ko | oui |
| (a) marge restante sous le budget de l'appareil élève | 4.1 Ko | ≥ 3.0 Ko | oui |
| **(b) Première ouverture** : JS + CSS initiaux de l'accueil de l'élève (`/`) | 99.5 Ko | ≤ 150.0 Ko | oui |
| **(c) Ouverture en 3G simulée** (CPU ×4, 150 ms, 1,6 Mbit/s ; e2e/perf.spec.ts) | 1.96 s (élève, premier lancement ; relance 0.82 s ; mesuré le 2026-10-19) | < 3 s | oui |
| Page la plus lourde au premier chargement (`/coran/lecteur`) | 135.8 Ko | ≤ 150.0 Ko | oui |

## Détail

| Élément | Poids transféré |
|---|---|
| (a) dont JS + CSS de la coquille de l'élève | 321.3 Ko |
| (a) dont textes préchargés (`/i18n/fr-quotidien.json`, `/i18n/fr-vivre.json`, `/i18n/fr-coran.json`, `/i18n/fr-hifz.json`, `/i18n/fr-arabe.json`, `/i18n/fr-suivi.json`) | 24.6 Ko |
| Pages du personnel, NON préchargées (27 fichiers) | 53.3 Ko |
| Pages rares, en ligne seulement, NON préchargées (66 fichiers) | 63.5 Ko |
| Modules à la demande qui ont besoin du réseau, NON préchargés (23 fichiers) | 35.1 Ko |
| Pages de l'élève gardées au premier usage (Madjaliss), NON préchargées (6 fichiers) | 24.2 Ko |
| Leçons vivantes, à la demande (2 fichiers) | 13.4 Ko (≤ 20.0 Ko) |
| Lecteur audio des phrases, à la demande au premier appui sur « Écouter » (2 fichiers) | 5.0 Ko (≤ 12.0 Ko) |
| Total JS + CSS de toutes les pages (mesuré, non bloquant) | 515.7 Ko |
| dont CSS | 60.4 Ko |
| Service worker | 8.0 Ko |
| Polices WOFF2 (une seule fois, déjà compressées) | 334.7 Ko (≤ 600.0 Ko) |
| Police d'une riwāya, la plus lourde (6 polices, à la demande, hors coquille) | 781.6 Ko (≤ 1024.0 Ko) |

## Pages les plus lourdes au premier chargement

| Page | JavaScript + CSS initiaux (Brotli) |
|---|---|
| `/coran/lecteur` | 135.8 Ko |
| `/lecons/[id]` | 132.3 Ko |
| `/hifz/[outil]` | 112.1 Ko |
| `/hifz` | 111.9 Ko |
| `/enseignant/classe/[id]` | 107.8 Ko |
| `/lectures` | 107.6 Ko |
| `/lectures/[code]` | 107.6 Ko |
| `/quotidien` | 106.5 Ko |
