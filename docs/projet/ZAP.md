# Scan OWASP ZAP « baseline » — Awzid

Date : 30/09/2026 (branche `suite-v1-b`). Outil : image `zaproxy/zap-stable` (Docker Hub), script
`zap-baseline.py` (scan **passif** : l'araignée parcourt le site, rien n'est attaqué ni modifié).

## Instance scannée

Instance **complète et jetable** montée dans le conteneur cloud avec le vrai `infra/prod/deploy.sh --demo`
(Docker Compose : Caddy, web, api, worker, PostgreSQL 18 ; contenu synthétique sans texte religieux ; données
de démonstration fictives) — `AWFORM_DEPLOY_BUILD=0 AWFORM_DEPLOY_SYSTEME=0` (images déjà construites, ni
systemd ni pare-feu). Trois passages :

| Cible | Mode | Échecs | Avertissements | Règles passées |
|---|---|---:|---:|---:|
| `http://localhost` (Caddy, bloc toujours servi en HTTP) | araignée classique | 0 | 1 (information) | 60 |
| `http://localhost` | araignée AJAX (navigateur) | 0 | 3 (faible / information) | 58 |
| `https://127.0.0.2` (bloc HTTPS du site, autorité locale de Caddy) | araignée classique | 0 | 2 (information) | 59 |

Avec le fichier de règles `infra/securite/zap-regles.tsv` (faux positifs justifiés ci-dessous), les
deux passages de contrôle rendent **0 échec, 0 avertissement**. Commande :

```bash
infra/securite/zap.sh http://localhost --ajax
infra/securite/zap.sh https://127.0.0.2
```

## Constats et suite donnée

| Règle | Niveau | Où | Analyse | Suite |
|---|---|---|---|---|
| 10096 Timestamp Disclosure - Unix | faible | `/_app/immutable/chunks/*.js` | nombres à 10 chiffres dans le JavaScript construit (tables de calcul d'une bibliothèque : QR, hachage) ; ce ne sont pas des dates du serveur | faux positif — ignoré |
| 120000 Information in Browser sessionStorage | information | toutes les pages | clé `sveltekit:scroll` : positions de défilement mémorisées par SvelteKit, aucune donnée personnelle (la session est un cookie HttpOnly) | faux positif — ignoré |
| 10109 Modern Web Application | information | toutes les pages | l'application est rendue par JavaScript ; information pour choisir l'araignée AJAX (faite) | ignoré |
| 10031 User Controllable HTML Element Attribute | information | `/coran/lecteur?s=1` | ZAP voit la valeur « 1 » du paramètre dans un attribut. **Vérifié** : `s` est converti en nombre (`Number(...)`, `routes/coran/lecteur/+page.svelte`) ; une injection (`?s="><script>…`, `?s="onmouseover=…`) n'est recopiée nulle part | faux positif — ignoré |
| 10015 Re-examine Cache-control Directives | information | `/manifest.webmanifest` | fichier public du manifeste de l'application (sans donnée personnelle), servi avec ETag | accepté — ignoré |

**Règles passées notables** : en-tête CSP présent et strict (10038, 10055), anti-intégration dans un cadre
(10020, `frame-ancestors 'none'`), `X-Content-Type-Options` (10021), HSTS en HTTPS (10035), aucune bannière de
serveur (10036, 10037), cookie HttpOnly, Secure en HTTPS et SameSite (10010, 10011, 10054), aucune
inclusion de script tiers (10017, 10115), aucune bibliothèque JavaScript vulnérable connue (10003, Retire.js),
aucune information personnelle ni erreur de débogage exposée (10023, 10062, 90022), jeton anti-CSRF (10202 :
l'API exige l'en-tête `x-awform`).

## Corrections apportées à cette occasion

Le montage de l'instance a révélé trois défauts réels, corrigés (voir `JOURNAL_DEV.md`) :

1. **Le travailleur ne démarrait pas en production** : pg-boss exécutait `CREATE SCHEMA IF NOT EXISTS pgboss`,
   refusé au compte à droits minimaux (qui n'a pas CREATE sur la base) → `createSchema: false`
   (`apps/worker/src/tasks.ts`), test sous le vrai compte du travailleur avec témoin du refus.
2. **`deploy.sh --demo` échouait** : l'outil de démonstration ne recevait plus la clé du second facteur
   (périmètre « outils » réduit par l'audit) → clé transmise à cette seule exécution.
3. **Le script de démonstration** n'envoyait pas le code parent désormais exigé (SEC-3, MIN-4) → corrigé, et
   test qui exécute la démonstration de bout en bout.

Et, pour la CSP : `style-src 'unsafe-inline'` retiré (seuls les attributs `style` restent permis, par
`style-src-attr`), `media-src blob:` ajouté (écoute des récitations : l'audio en `blob:` était bloqué par
`default-src 'self'`), `form-action`, `worker-src`, `manifest-src` déclarés. Tests : `apps/web/src/lib/csp.test.ts`,
`apps/web/e2e/securite.spec.ts` (en-têtes ; aucune violation de CSP sur 12 écrans de la famille et l'espace
enseignant, avec un témoin qui prouve que le détecteur voit une violation).

## Limites

- Scan **passif** seulement (baseline). Un scan actif (`zap-full-scan.py`) attaque le site : à lancer sur une
  instance de test dédiée, jamais sur la production sans accord écrit.
- Les routes de l'API sans page (JSON) ne sont vues que si une page les appelle ; elles sont couvertes par
  les tests d'API (droits, en-têtes `x-awform`, schémas stricts) et l'audit précédent.
- L'instance utilisait des images construites avec une copie **locale** du Dockerfile (apt en HTTPS et
  certificat du mandataire du conteneur cloud, pour la construction seulement) ; le Dockerfile du dépôt n'est
  pas modifié. À refaire sur la VM avec les images de production (`deploy.sh` normal) et les vrais livres.
