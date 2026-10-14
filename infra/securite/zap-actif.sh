#!/usr/bin/env bash
# Scan ZAP ACTIF limité aux routes de l'application, AUTHENTIFIÉ avec un compte FICTIF de la démonstration.
#   infra/securite/zap-actif.sh [durée_max_minutes=25]
# Cible : http://127.0.0.1 (Caddy de la démonstration, locale). Aucune autre cible n'est possible. Le jeton de session du
# compte fictif est écrit dans un plan à droits 600 (dossier à droits 700 sous ~/.awzid-charge, hors dépôt), retiré à la
# fin ; rien n'est affiché.
# Exclus : déconnexion, changement de mot de passe, suppression de compte, administration/personnel, écoute IA
# (calcul coûteux), fichiers audio et ressources statiques volumineuses.
set -euo pipefail
MIN="${1:-25}"
CIBLE="http://127.0.0.1"
PWF="${AWFORM_CHARGE_PW_FILE:-$HOME/.awzid-charge/pw}"
mkdir -p "$HOME/.awzid-charge"
DIR="$(mktemp -d "$HOME/.awzid-charge/zap.XXXXXX")"
chmod 700 "$DIR"
trap 'rm -f "$DIR/plan.yaml"' EXIT
PW="$(cat "$PWF")"
LOGIN="$(curl -s -i -X POST "$CIBLE/api/v1/auth/login" -H 'content-type: application/json' -H 'x-awform: 1' \
  -d "{\"email\":\"charge-48@demo.awform.test\",\"password\":\"$PW\"}")"
COOKIE="$(printf '%s' "$LOGIN" | tr -d '\r' | sed -n 's/^[Ss]et-[Cc]ookie: \(awform_session=[^;]*\).*/\1/p' | head -1)"
[ -n "$COOKIE" ] || { echo "connexion du compte fictif impossible" >&2; exit 1; }
PID="$(curl -s "$CIBLE/api/v1/auth/me" -H 'x-awform: 1' -H "Cookie: $COOKIE" | sed -n 's/.*"profiles":\[{"id":"\([^"]*\)".*/\1/p')"
[ -n "$PID" ] || { echo "profil introuvable" >&2; exit 1; }
umask 077
cat > "$DIR/plan.yaml" <<YAML
env:
  contexts:
    - name: awzid
      urls: ["$CIBLE"]
      includePaths: ["$CIBLE/.*"]
      excludePaths:
        - "$CIBLE/api/v1/auth/logout.*"
        - "$CIBLE/api/v1/auth/password.*"
        - "$CIBLE/api/v1/account/(delete|suppression|email|pin).*"
        - "$CIBLE/api/v1/(admin|teacher|ecole|staff|relais|support|billing).*"
        - "$CIBLE/api/v1/ecoute/.*"
        - "$CIBLE/api/v1/profiles/[^/]*/ecoute/(verifier|direct).*"
        - "$CIBLE/api/v1/(lecons-audio/fichiers|quran/audio/file|quran/mushaf-exact/polices)/.*"
        - "$CIBLE/(_app|fonts|icons|mutun|i18n|riwayat|tajwid|traductions|documents|douas)/.*"
  parameters: {failOnError: false, failOnWarning: false, progressToStdout: true}
jobs:
  - type: replacer
    parameters: {deleteAllRules: true}
    rules:
      - {description: csrf, matchType: REQ_HEADER, matchString: x-awform, matchRegex: false, replacementString: "1"}
      - {description: session, matchType: REQ_HEADER, matchString: Cookie, matchRegex: false, replacementString: "$COOKIE"}
  - type: requestor
    requests:
      - {url: "$CIBLE/api/v1/auth/me", method: GET}
      - {url: "$CIBLE/api/v1/config", method: GET}
      - {url: "$CIBLE/api/v1/levels", method: GET}
      - {url: "$CIBLE/api/v1/levels/ad1/units", method: GET}
      - {url: "$CIBLE/api/v1/units/ad1.l01", method: GET}
      - {url: "$CIBLE/api/v1/fonctions", method: GET}
      - {url: "$CIBLE/api/v1/today/$PID", method: GET}
      - {url: "$CIBLE/api/v1/profiles/$PID/parcours", method: GET}
      - {url: "$CIBLE/api/v1/profiles/$PID/madjaliss", method: GET}
      - {url: "$CIBLE/api/v1/profiles/$PID/accueil", method: GET}
      - {url: "$CIBLE/api/v1/profiles/$PID/carnet", method: GET}
      - {url: "$CIBLE/api/v1/profiles/$PID/regularite", method: GET}
      - {url: "$CIBLE/api/v1/profiles/$PID/quran/reciters", method: GET}
      - {url: "$CIBLE/api/v1/profiles/$PID/sourates", method: GET}
      - {url: "$CIBLE/api/v1/profiles/$PID/espace/arabe", method: GET}
      - {url: "$CIBLE/api/v1/profiles/$PID/recitations", method: GET}
      - {url: "$CIBLE/api/v1/profiles/$PID/classes", method: GET}
      - {url: "$CIBLE/api/v1/profiles/$PID/certificats", method: GET}
      - {url: "$CIBLE/api/v1/dashboard/$PID", method: GET}
      - {url: "$CIBLE/api/v1/hifz/profiles/$PID", method: GET}
      - {url: "$CIBLE/api/v1/hifz/books", method: GET}
      - {url: "$CIBLE/api/v1/hifz/books/ad1", method: GET}
      - {url: "$CIBLE/api/v1/lecons-audio/niveaux", method: GET}
      - {url: "$CIBLE/api/v1/quran/audio/reciters", method: GET}
      - {url: "$CIBLE/api/v1/quran/audio/reciters/ayyoub-hafs/suras/1", method: GET}
      - {url: "$CIBLE/api/v1/quran/mushaf-exact/pages/1", method: GET}
      - {url: "$CIBLE/api/v1/quran/verses?s=1&from=1&to=7", method: GET}
      - {url: "$CIBLE/api/v1/quran/meta", method: GET}
      - {url: "$CIBLE/api/v1/famille/messages", method: GET}
      - {url: "$CIBLE/api/v1/notifications", method: GET}
      - {url: "$CIBLE/api/v1/progress/unit?profile=$PID&unit=ad1.l01", method: GET}
      - {url: "$CIBLE/api/v1/booklets", method: GET}
      - {url: "$CIBLE/api/v1/packs", method: GET}
      - {url: "$CIBLE/api/v1/usage", method: GET}
      - {url: "$CIBLE/api/v1/vivre", method: GET}
      - {url: "$CIBLE/api/v1/pays/FR/regles", method: GET}
      - {url: "$CIBLE/api/v1/public/certificats/cle", method: GET}
      - {url: "$CIBLE/api/v1/acces/statut", method: GET}
      - {url: "$CIBLE/api/v1/contenu/errata", method: GET}
      - {url: "$CIBLE/api/v1/attempts", method: POST, headers: ["Content-Type: application/json"], data: '{"events":[{"id":"3f0e7a52-5f6c-4b1e-9a60-0a1b2c3d4e5f","profileId":"$PID","unitId":"ad1.l01","eventType":"trace","response":{"item":"x","ok":true,"day":"2026-10-14"},"deviceAt":"2026-10-14T10:00:00.000Z"}]}'}
      - {url: "$CIBLE/api/v1/avis", method: POST, headers: ["Content-Type: application/json"], data: '{"texte":"essai de securite"}'}
      - {url: "$CIBLE/api/v1/auth/login", method: POST, headers: ["Content-Type: application/json"], data: '{"email":"charge-47@demo.awform.test","password":"x"}'}
      - {url: "$CIBLE/api/v1/auth/password-reset", method: POST, headers: ["Content-Type: application/json"], data: '{"email":"charge-47@demo.awform.test"}'}
      - {url: "$CIBLE/api/v1/acces/liste-attente", method: POST, headers: ["Content-Type: application/json"], data: '{"email":"zap@demo.awform.test"}'}
  - type: spider
    parameters: {context: awzid, url: "$CIBLE/", maxDuration: 3, maxDepth: 6}
  - type: spiderAjax
    parameters: {context: awzid, url: "$CIBLE/", maxDuration: 4, maxCrawlDepth: 4, browserId: firefox-headless}
  - type: passiveScan-wait
    parameters: {maxDuration: 5}
  - type: activeScan
    parameters: {context: awzid, maxRuleDurationInMins: 4, maxScanDurationInMins: $MIN, threadPerHost: 2, delayInMs: 15}
    policyDefinition: {defaultStrength: Medium, defaultThreshold: Medium}
  - type: passiveScan-wait
    parameters: {maxDuration: 5}
  - type: report
    parameters: {template: traditional-json, reportDir: /zap/wrk, reportFile: zap-actif, reportTitle: "Awzid demo - scan actif"}
  - type: report
    parameters: {template: traditional-md, reportDir: /zap/wrk, reportFile: zap-actif, reportTitle: "Awzid demo - scan actif"}
YAML
chmod 644 "$DIR/plan.yaml"
chmod 777 "$DIR"
docker run --rm --network host -v "$DIR:/zap/wrk:rw" zaproxy/zap-stable zap.sh -cmd -autorun /zap/wrk/plan.yaml > "$DIR/zap.log" 2>&1 || true
# le journal de ZAP recopie les règles de remplacement : le jeton de session du compte fictif en est expurgé
sed -i 's/awform_session=[A-Za-z0-9_-]*/awform_session=<expurgé>/g' "$DIR"/zap.log "$DIR"/*.json "$DIR"/*.md 2>/dev/null || true
echo "$DIR"
