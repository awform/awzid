# Relais d'école AWFORM — installation et exploitation (équipe technique)

Lot 17. Le mode d'emploi du directeur est dans `MODE_EMPLOI_DIRECTEUR.md` (à imprimer et laisser à l'école).

## Principe

```
tablettes ──Wi-Fi──► relais (Caddy HTTPS → web + relay) ──Internet quand il y en a──► serveur central
```

- **Nom de l'école** : un sous-domaine par école, ex. `ecole-dakar-01.relais.awzid.org`.
  - DNS **public** : il pointe vers le **serveur central** (`*.relais.awzid.org` → IP du central). Hors de l'école,
    le même nom sert donc l'application depuis le central.
  - DNS du **Wi-Fi de l'école** : il pointe vers le **relais** (box ou dnsmasq du relais, ci-dessous).
- **Certificat HTTPS** : obtenu par le serveur central (Caddy, « à la demande », seulement pour un relais
  enregistré et actif), copié pour l'API (`relais-certs.sh`, certificats des relais seulement), remis au relais
  authentifié par son jeton (`GET /api/v1/relais/certificat`), rechargé par Caddy sur le relais. Rien à installer
  sur les tablettes ; le certificat est renouvelé par le central et récupéré toutes les 10 minutes.
- **Données des élèves** : le relais n'a **aucun droit propre**. Chaque envoi garde la session de l'élève. Les
  envois en attente sont chiffrés (AES-256-GCM, clé propre au relais) et effacés dès que le central a répondu ;
  un refus définitif (4xx, ex. session expirée) efface aussi les données (trace technique gardée 7 jours).
- **Contenus** : copie des seules réponses publiques de l'API (livres, paquets, Coran, livrets…) — jamais une
  donnée personnelle (`CACHEABLE`, `apps/relay/src/relay.ts`).

## 1. Côté serveur central (une fois)

1. DNS : enregistrement `*.relais.awzid.org` → IP du serveur central.
2. `infra/prod/deploy.sh --site app.awzid.org --relais-domaine relais.awzid.org` (ajoute `RELAIS_DOMAINE` au
   périmètre de Caddy ; le service `certsrelais` copie les certificats des relais pour l'API).
3. Pour chaque école :
   ```
   AWFORM_ENV_DIR=~/.config/awform docker compose -f infra/prod/compose.yml run --rm relais creer "École pilote Dakar" ecole-dakar-01.relais.awzid.org
   ```
   Le **jeton** (`rel_…`) n'est affiché **qu'une fois** : le noter pour l'installation, puis le détruire.
   Seul son hachage est gardé. `… relais.js liste` montre le dernier battement et l'état remonté ;
   `… relais.js revoquer <nom>` désactive un relais perdu ou volé (jeton, certificat et TLS refusés).

## 2. Préparer le boîtier (avec Internet, avant de l'apporter à l'école)

Matériel : mini-PC x86-64 ou Raspberry Pi 4/5 (4 Go), carte ou disque de 64 Go au moins, Debian 12,
Ubuntu 24.04 ou Raspberry Pi OS 64 bits, adresse IP **fixe** sur le réseau de l'école (réservation DHCP dans la box).

```
git clone https://github.com/awform/awzid.git /opt/awzid && cd /opt/awzid
sudo infra/relais/install.sh --hote ecole-dakar-01.relais.awzid.org --amont https://app.awzid.org --dns 192.168.1.20
```

- Le jeton est demandé au clavier (jamais en argument).
- `install.sh` écrit `/etc/awform-relais/relais.env` (amont, jeton, **clé locale générée une seule fois**) et
  `/etc/awform-relais/caddy.env` (nom de l'école), droits 600 ; crée un certificat provisoire ; construit les
  images (`relay`, `web`, Caddy) ; installe `awform-relais.service` (démarrage automatique) et
  `awform-relais-certificat.path` (rechargement de Caddy quand le relais reçoit un certificat).
- Relancer `install.sh` est sans danger (mise à jour : `git pull` puis relancer).
- Coller sur le boîtier une étiquette : nom de l'école (adresse de l'application) et `http://<IP>/relais/etat`.

## 3. DNS du Wi-Fi de l'école

Au choix :
- **la box sait enregistrer un nom local** : ajouter `ecole-…relais.awzid.org` → IP du relais ;
- **sinon** : `install.sh --dns <IP du relais>` installe dnsmasq sur le relais ; dans la box, régler le serveur
  DNS distribué par le DHCP sur l'IP du relais. Les autres noms sont transmis normalement.

Vérification depuis une tablette du Wi-Fi : `https://ecole-…relais.awzid.org` s'ouvre sans avertissement et
`http://<IP>/relais/etat` affiche l'état.

## 4. Exploitation

- `docker compose -f infra/relais/compose.yml ps` / `logs relay` (journaux JSON, sans données d'élève).
- Page d'état : `/relais/etat` (lisible par le directeur) et `/relais/etat.json`.
- Au central : `relais.js liste` (dernier battement, envois en attente ou refusés, version).
- **Ne jamais changer `AWFORM_RELAIS_CLE`** tant que la file n'est pas vide (les envois deviendraient illisibles).
- Boîtier perdu ou volé : `relais.js revoquer`, puis nouveau relais et nouveau jeton.

## 5. Limites connues

- Pas de création de compte ni de connexion sans Internet (la session d'un élève déjà connecté suffit).
- Une session expirée pendant une longue coupure fait refuser (et effacer) ses envois : l'élève les refait.
- L'installation demande Internet (images Docker, paquets) ; à faire avant d'apporter le boîtier.
