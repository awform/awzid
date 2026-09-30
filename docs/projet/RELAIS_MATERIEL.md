# Relais d'école — matériel conseillé

Rédigé le 30/09/2026. **Tous les prix sont indicatifs et « à vérifier »** au moment de l'achat : relevés en
dollars sur des sites de vente en ligne américains (septembre 2026), convertis à titre d'ordre de grandeur ;
les prix au Sénégal (importation, douane, TVA 18 %, transport) seront plus élevés. Conversion : 1 € =
655,957 FCFA (parité fixe) ; 1 $ ≈ 0,9 € (**à vérifier** le jour de l'achat).

Le relais (lot 17, `apps/relay`, `infra/relais/`) fait tourner trois petits conteneurs (relais, application,
Caddy) : besoins modestes — 2 à 4 cœurs, **4 Go de mémoire au moins**, 32 Go de stockage au moins (contenus
des livres, file des envois chiffrée), réseau filaire vers le routeur Wi-Fi. Mode d'emploi du directeur :
`infra/relais/MODE_EMPLOI_DIRECTEUR.md` ; installation : `infra/relais/INSTALLATION.md`.

## Configuration conseillée

| Élément | Choix conseillé | Prix indicatif (à vérifier) | Consommation | Remarques |
|---|---|---|---|---|
| Ordinateur (option A, **conseillée en 2026**) | mini-PC Intel N100 ou N150, 16 Go de mémoire, SSD NVMe 500 Go (ex. Beelink S12 Pro, Minisforum UN100L) | ≈ 180 à 210 $ **complet** (≈ 160 à 190 €, ≈ 105 000 à 125 000 FCFA) | ≈ 5 à 10 W au repos, 30 W au plus | boîtier, alimentation et stockage compris ; architecture x86 : mêmes images que le serveur central |
| Ordinateur (option B) | Raspberry Pi 5, 8 Go | ≈ 200 $ la **carte seule** en septembre 2026 (prix d'origine 80 $, hausses successives dues à la pénurie de mémoire) | ≈ 3 W au repos, 8 à 10 W en charge (avec SSD NVMe) | ajouter alimentation officielle 27 W, boîtier ventilé, carte NVMe (HAT) et SSD : le total dépasse aujourd'hui l'option A. Architecture ARM : image du relais à construire pour arm64 (**non testé** ici) |
| Stockage | SSD NVMe 256 à 512 Go (compris dans l'option A) | ≈ 25 à 45 $ si acheté à part | < 1 W | **Éviter la carte SD seule** pour un relais toujours allumé : usure et corruption lors des coupures de courant (la base du relais est protégée par son journal WAL, mais la carte elle-même peut lâcher) |
| Onduleur | 600 à 700 VA, régulation de tension (AVR), prises 230 V (ex. APC Back-UPS BX700UI, BX700U-GR) | ≈ 70 à 110 € (**à vérifier** ; prix très variables selon le revendeur) | pertes ≈ 5 W | tient le relais et le routeur **plusieurs dizaines de minutes** (≈ 20 à 25 W à alimenter) ; indispensable avec les coupures et les variations de tension ; batterie à remplacer tous les 3 à 5 ans |
| Routeur Wi-Fi | Wi-Fi 6 double bande, 4 ports Ethernet gigabit (ex. TP-Link Archer AX55) | ≈ 75 à 120 $ | ≈ 8 à 12 W (**à vérifier** sur la fiche du fabricant) | un seul réseau pour les tablettes ; le relais branché en câble ; si la box de l'opérateur ne permet pas de nommer le relais : option `--dns` de l'installation (dnsmasq sur le relais) |
| Câbles et divers | câble Ethernet catégorie 6 (1 à 3 m), multiprise parafoudre, étiquette « ne pas débrancher » | ≈ 10 à 20 € | — | |

**Total indicatif, option A** : ≈ 350 à 450 € (≈ 230 000 à 295 000 FCFA) hors transport et taxes — **à vérifier**.

## Consommation électrique

Relais (option A) ≈ 8 W en moyenne + routeur ≈ 10 W + pertes de l'onduleur ≈ 5 W ≈ **23 W**, soit ≈ 0,55 kWh
par jour et ≈ **200 kWh par an** allumé jour et nuit. Relais éteint le soir et le week-end (heures de classe
seulement) : environ trois fois moins. Le coût annuel dépend du tarif de l'école (**à vérifier** sur la facture
Senelec de l'école). Option B (Raspberry Pi) : ≈ 5 W de moins pour le relais.

## Ce qu'il ne faut pas faire

- Ne pas utiliser un ordinateur de bureau ancien : consommation 40 à 80 W, bruit, pannes de disque.
- Ne pas poser le relais au soleil ni dans une pièce fermée sans aération ; poussière : souffler le boîtier
  une fois par trimestre.
- Ne pas brancher le relais sans onduleur sur un réseau électrique instable.

## Sources des prix et des consommations (consultées le 30/09/2026)

- Raspberry Pi 5 — hausses de prix 2025-2026 : [Tom's Hardware](https://www.tomshardware.com/raspberry-pi/raspberry-pi-5-price-increases-drastically-as-ai-shortage-bites-16gb-version-now-usd205-second-price-increase-in-three-months-over-70-percent-more-expensive-than-original-msrp),
  [Raspberry Pi (annonce)](https://www.raspberrypi.com/news/more-memory-driven-price-rises/),
  [historique des prix, 8 Go](https://pricehistory.app/p/raspberry-pi-5-8gb-R9cc6ow8)
- Raspberry Pi 5 — consommation : [raspberry.tips (mesures 2026)](https://raspberry.tips/en/raspberrypi-tutorials/raspberry-pi-power-consumption-update-2026-all-models-compared),
  [Jeff Geerling](https://www.jeffgeerling.com/blog/2023/reducing-raspberry-pi-5s-power-consumption-140x/),
  [Pimoroni (avec SSD NVMe)](https://forums.pimoroni.com/t/pi-5-power-consumption/23959)
- Mini-PC N100 — prix et consommation : [MiniLabHQ (guide d'achat)](https://minilabhq.com/posts/intel-n100-mini-pc-homelab-buying-guide/),
  [MiniLabHQ (consommation)](https://minilabhq.com/posts/n100-mini-pc-power-consumption/),
  [Notebookcheck (Minisforum UN100L)](https://www.notebookcheck.net/Minisforum-UN100L-debuts-as-a-cost-effective-mini-PC.783336.0.html)
- Onduleur : [APC BX700UI (fabricant)](https://apc.com/shop/us/en/products/APC-Back-UPS-700VA-230V-AVR-IEC-Sockets/P-BX700UI)
- Routeur : [TP-Link Archer AX55 (fabricant)](https://www.tp-link.com/us/home-networking/wifi-router/archer-ax55/),
  [RTINGS (test)](https://www.rtings.com/router/reviews/tp-link/archer-ax55)

Le choix du fournisseur, l'achat et le budget sont des **décisions du client** (D17, `DECISIONS_EN_ATTENTE.md`).
