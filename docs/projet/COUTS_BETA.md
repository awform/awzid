# Coûts de fonctionnement de la bêta (première version, 13/10/2026)

Base : `docs/projet/EXPLOITATION.md` (§ « Coût mensuel estimé »), tarifs publics Google Cloud, `europe-west9`
(Paris), hors taxes, 1 $ ≈ 1 €. **Estimations à confirmer sur la calculatrice Google et la première facture.**
Aucune commande créant une ressource payante n'a été exécutée pour ce document.

## 1. Tableau mensuel (bêta fermée, quelques dizaines d'élèves)

| Poste | Hypothèse | €/mois | État |
|---|---|---|---|
| VM `awzid-beta` e2-standard-2 (2 vCPU, 8 Go), 730 h | ≈ 0,075 $/h, 1,4 Go utilisés (4 Go avec l'écoute) | ≈ 51 | en place |
| Disque pd-balanced 50 Go | 4,8 Go utilisés | ≈ 5 | en place |
| IPv4 externe statique | 0,005 $/h | ≈ 3,4 | en place |
| Artifact Registry | ≈ 2,5 Go, 0,5 Go gratuits | ≈ 0,2 | en place |
| Sauvegardes (bucket, suppression à 30 jours) | 30 × ≈ 20 Mo | < 0,1 | en place |
| Surveillance, journaux, IAP | quotas gratuits | 0 | en place |
| Cloud Build (image d'écoute, à chaque version) | ≈ 8 min, 2 500 min gratuites | ≈ 0,1 | en place |
| Trafic sortant | quelques Go, 1 Go gratuit, ≈ 0,12 $/Go | 0 à 2 | en place |
| Synthèse vocale (Text-to-Speech) | génération ponctuelle, crédit | 0 à 10 | ponctuel |
| Tuteur IA | ≈ 0,25 €/enfant, ≈ 1 €/adulte actif, plafonné (3 €), fermé par défaut | 0 à 5 | plafonné |
| **Total** | | **≈ 60 €** (≈ 2 €/jour) | crédit ≈ 264 € jusqu'au ≈ 02/01/2027 |

## 2. Optimisations chiffrées

| Levier | Gain estimé | Appliqué ? |
|---|---|---|
| **Brotli** : l'application pré-compresse JS, CSS et polices en `.br` à la construction (Caddy ne recompresse pas ce qui l'est déjà) | première ouverture 134 Ko transférés (Brotli) au lieu de plusieurs fois plus en brut | **oui** (déjà en place) |
| **Empreintes + cache long** : `/_app/immutable/*` est servi avec un nom haché (cache d'un an côté navigateur) ; l'élève qui revient ne retélécharge rien (relance en 0,8 s, service worker) | trafic de retour ≈ 0 ; 1 000 élèves × 134 Ko = 134 Mo/mois, soit < 0,02 € | **oui** |
| **Budget appareil élève** ramené à 343,6 Ko, pages en ligne seulement non préchargées | −6 Ko par installation et par mise à jour (≈ −2 % de trafic de mise à jour) | **oui** (ce lot) |
| Cache HTTP des fichiers non hachés (`/i18n/*.json`, polices : ETag + `max-age` court puis revalidation) | négligeable en coût (≈ 0,3 Mo/élève) ; confort hors ligne | reste |
| **Dimensionnement de la VM** : sans l'écoute (fermée aux élèves en production) 1,4 Go suffisent. e2-medium (1 vCPU partagé, 4 Go) ≈ 25 € | **−26 €/mois** si l'écoute reste fermée ; à refaire passer en e2-standard-2 avant d'ouvrir l'écoute (arrêt ≈ 2 min) | reste (décision du client) |
| Engagement 1 an sur la VM (remise ≈ 37 %) | −19 €/mois, mais engagement ferme : non recommandé avant la fin de la bêta | non |
| **Audio sur bucket froid** : 13 Go du Coran + 0,9 Go de leçons. Standard ≈ 0,023 $/Go = ≈ 0,3 €/mois ; Nearline ≈ 0,17 € ; sur disque de la VM ≈ 1,5 €/mois | gain ≈ 1 €/mois seulement : le froid ne vaut pas sa latence ; garder Standard (accès régulier), cycle de vie seulement sur les sauvegardes (déjà 30 jours) | reste (bucket Standard à créer, pas de cycle froid) |
| Trafic de l'audio : mettre en cache sur l'appareil (déjà fait, hors ligne) ; 1 000 élèves × 20 écoutes × 1,5 Mo ≈ 30 Go | ≈ 3,6 €/mois sans cache, ≈ 1 € avec cache appareil | **oui** (cache appareil) |
| Écoute IA (récitation) sur CPU : 10 000 élèves ≈ 2 vCPU | ≈ 50 à 150 €/mois à cette échelle ; 0 € tant qu'elle est fermée | plafonnée |
| **Plafonds de consommation** : plafond IA par élève (3 €), coût fixe/jour affiché en administration (2 €), quotas d'inscription du mode ouvert | borne la dépense IA ; pas de facture surprise | **oui** côté application |
| **Alerte de budget Google UNIQUE : 80 €/mois** (e-mail) : gratuite ; réglée par le client dans la console (budget déjà en place) | prévient avant épuisement du crédit ; au-dessus du coût normal (≈ 60 €) donc elle ne sonne qu'en cas de dérive | **oui** (réglée) |
| **Disjoncteur** : à l'alerte de 80 €, `AWFORM_COUTS_COUPES=1` coupe les fonctions coûteuses (écoute IA ; voix à la demande quand elle existera) ; **la machine n'est jamais arrêtée** | borne la dérive sans mettre le service hors ligne | **oui** côté application |

## 2 bis. Seuils de coût (valeurs uniques, décision du référent du 14/10/2026)

| Seuil | Valeur | Où |
|---|---|---|
| Coût normal | ≈ 60 €/mois, ≈ 2 €/jour | ce document, EXPLOITATION, guide du client, administration (`AWFORM_COUT_FIXE_JOUR_EUR`, 2 € par défaut) |
| **Alerte Google (la seule)** | **80 €/mois** | console Google (budget réglé par le client) ; `infra/gcp/plafond-budget.sh` la recrée si besoin |
| Alerte du jour dans l'administration | 4 € (2 € fixes + 2 € de variable ; `AWFORM_COUT_ALERTE_JOUR_EUR`) | espace administrateur |
| Disjoncteur | à l'alerte de 80 € : fonctions coûteuses coupées à la main par `AWFORM_COUTS_COUPES=1` ; **jamais la machine** | `prod.env` |

Anciens chiffres abandonnés (ne plus les citer comme seuils) : 10 €, 45 € (plafond qui arrêtait la machine) et 60 €.

## 3. Ce qui reste (reporté avant l'étape 2)

1. Décision VM : e2-medium tant que l'écoute est fermée (−26 €/mois), e2-standard-2 à l'ouverture de l'écoute.
2. ~~Alerte de budget~~ : faite, une seule alerte à 80 €/mois (réglée par le client) ; disjoncteur applicatif des fonctions coûteuses, jamais de la machine.
3. Copie de l'audio dans un bucket Standard (13,9 Go ≈ 0,3 €/mois) plutôt que sur le disque (≈ 1,5 €/mois) :
   gain faible, utile surtout pour sortir l'audio de la VM.
4. En-têtes de cache des fichiers non hachés, après mesure sur le serveur public (Caddy).
5. Mesure réelle de la charge (requêtes/s, mémoire) sur la bêta ouverte avant de redimensionner.
6. Avant le ≈ 02/01/2027 (fin du crédit) : décider garder, réduire ou arrêter (arrêt de la VM : reste ≈ 9 €/mois).
