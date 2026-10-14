#!/usr/bin/env bash
# Branche l'envoi d'e-mails du service sur le SMTP d'OVH (lot 8, 14/10/2026) — À EXÉCUTER PAR LE CLIENT, SUR LE SERVEUR :
#   bash ~/awform-app/infra/prod/smtp-ovh.sh
# Pose dans prod.env (droits 600) : AWFORM_MAIL=smtp, AWFORM_SMTP_HOST=smtp.mail.ovh.net, AWFORM_SMTP_PORT=587,
# AWFORM_SMTP_TLS=starttls, AWFORM_SMTP_USER=no-reply@awzid.com (modifiable à la question) et AWFORM_SMTP_PASSWORD.
# LE MOT DE PASSE : demandé en lecture MASQUÉE (rien ne s'affiche), jamais passé en argument de commande (donc ni dans
# l'historique du shell, ni dans `ps`), jamais écrit dans un journal ni affiché. Un second saisie le confirme. Refusé : les
# caractères ' " $ ` \ # espace et fin de ligne (ils seraient mal lus par Docker) — choisissez-en un autre dans l'espace OVH.
# Aucun envoi n'est fait ici. Ensuite : `bash ~/awform-app/infra/prod/alerte.sh --essai` envoie un e-mail d'essai.
# Refuse de tourner sur la DÉMONSTRATION (AWFORM_DEMO=1 dans prod.env) : la démonstration n'envoie jamais de vrai e-mail.
# Variables : AWFORM_ENV_DIR (défaut ~/.config/awform), AWFORM_SMTP_REDEMARRER=0 (ne pas relancer l'API).
set -euo pipefail
CONF="${AWFORM_ENV_DIR:-$HOME/.config/awform}"
ENVF="$CONF/prod.env"
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$ENVF" ] || { echo "prod.env introuvable ($ENVF) : le serveur n'est pas déployé ici." >&2; exit 1; }
if grep -qE '^AWFORM_DEMO=1' "$ENVF"; then echo "REFUS : ce serveur est la démonstration (jamais d'e-mail réel)." >&2; exit 2; fi
# pas d'écho, pas d'historique : lecture sur le terminal (ou sur l'entrée standard pour les essais automatiques)
lire() { # lire <invite> <secret 0|1> → valeur dans REPLY_V
  if [ -t 0 ]; then
    if [ "$2" = 1 ]; then IFS= read -rs -p "$1" REPLY_V; echo >&2; else IFS= read -r -p "$1" REPLY_V; fi
  else IFS= read -r REPLY_V || REPLY_V=""; fi
}
lire "Identifiant OVH [no-reply@awzid.com] : " 0
USER_SMTP="${REPLY_V:-no-reply@awzid.com}"
case "$USER_SMTP" in *[!A-Za-z0-9@._+-]* | '') echo "Identifiant invalide." >&2; exit 1 ;; esac
lire "Mot de passe de la boîte (invisible) : " 1
PW="$REPLY_V"
lire "Confirmez le mot de passe (invisible) : " 1
[ "$PW" = "$REPLY_V" ] || { echo "Les deux saisies diffèrent : rien n'a été modifié." >&2; exit 1; }
REPLY_V=""
[ "${#PW}" -ge 8 ] || { echo "Mot de passe trop court ou vide : rien n'a été modifié." >&2; exit 1; }
case "$PW" in *[\'\"\$\`\\\#\ ]*) echo "Ce mot de passe contient un caractère non pris en charge (' \" \$ \` \\ # espace) : changez-le dans l'espace OVH. Rien n'a été modifié." >&2; exit 1 ;; esac
umask 077
TMP="$(mktemp "$CONF/.prod.env.XXXXXX")"
grep -vE '^(AWFORM_MAIL|AWFORM_SMTP_HOST|AWFORM_SMTP_PORT|AWFORM_SMTP_TLS|AWFORM_SMTP_USER|AWFORM_SMTP_PASSWORD)=' "$ENVF" > "$TMP" || true
{
  echo 'AWFORM_MAIL=smtp'
  echo 'AWFORM_SMTP_HOST=smtp.mail.ovh.net'
  echo 'AWFORM_SMTP_PORT=587'
  echo 'AWFORM_SMTP_TLS=starttls'
  echo "AWFORM_SMTP_USER=$USER_SMTP"
  echo "AWFORM_SMTP_PASSWORD=$PW"
} >> "$TMP"
PW=""
chmod 600 "$TMP"
mv -f "$TMP" "$ENVF"
bash "$HERE/env-split.sh" "$ENVF" "$CONF"
echo "OK : prod.env mis à jour (droits 600) : OVH smtp.mail.ovh.net:587 STARTTLS, expéditeur no-reply@awzid.com, identifiant $USER_SMTP."
V="$(cat "$CONF/version-en-service" 2>/dev/null || true)"
if [ "${AWFORM_SMTP_REDEMARRER:-1}" = 1 ] && [ -n "$V" ] && command -v docker >/dev/null 2>&1; then
  ( cd "$HERE/../.." && AWFORM_VERSION="$V" AWFORM_ENV_DIR="$CONF" docker compose -f infra/prod/compose.yml --profile ecoute up -d --no-deps api >/dev/null ) \
    && echo "API relancée avec le nouveau réglage." || echo "API non relancée : relancez le déploiement." >&2
else
  echo "API non relancée automatiquement : relancez le déploiement pour prendre le réglage en compte."
fi
echo "Prochaine étape : bash $HERE/alerte.sh --essai   (envoie UN e-mail d'essai à AWFORM_ALERTE_A)."
