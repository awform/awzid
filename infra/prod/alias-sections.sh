#!/usr/bin/env bash
# ALIAS DE SECTIONS (désactivés par défaut pendant la bêta) : des noms courts qui redirigent en 301 vers une SECTION de
# l'application, qui reste UNE seule origine canonique (https://$SITE, ex. awzid.com) :
#     arabe.awzid.com → / (livres et leçons d'arabe)      quran.awzid.com → /coran
#     fiqh.awzid.com et fikh.awzid.com → /madjaliss        adab.awzid.com et akhlaq.awzid.com → /vivre (bon comportement, douas)
# Aucune application séparée, aucun cookie sur le domaine parent (le cookie de session n'a pas d'attribut Domain), aucun joker :
# UN certificat Let's Encrypt PAR NOM, demandé seulement quand l'alias est activé (son CNAME doit alors pointer vers awzid.com.).
#   infra/prod/alias-sections.sh liste                      état de chaque alias
#   infra/prod/alias-sections.sh activer quran vivre …      active ces alias (ou « tous »)
#   infra/prod/alias-sections.sh desactiver quran …         les désactive (ou « tous ») : retour arrière immédiat
# Sans redéploiement du code : écrit ~/.config/awform/alias/sections.caddy (importé par le Caddyfile) puis redémarre le seul conteneur Caddy (≈ 2 s).
# Réglages : AWFORM_ENV_DIR (défaut ~/.config/awform), AWFORM_ALIAS_SANS_RECHARGE=1 (essais : n'appelle pas Docker),
# AWFORM_DOMAINE (défaut : SITE lu dans caddy.env, fichier sans secret).
set -euo pipefail
PROD="$(cd "$(dirname "$0")" && pwd)"
CONF="${AWFORM_ENV_DIR:-$HOME/.config/awform}"
DIR="$CONF/alias"
ACTIFS="$DIR/actifs.txt"
CIBLES=(arabe:/ quran:/coran fiqh:/madjaliss fikh:/madjaliss adab:/vivre akhlaq:/vivre)
umask 077
mkdir -p "$DIR"
touch "$ACTIFS"
DOMAINE="${AWFORM_DOMAINE:-$(sed -n 's/^SITE=//p' "$CONF/caddy.env" 2>/dev/null | head -1)}"
[ -n "$DOMAINE" ] || { echo "domaine inconnu : AWFORM_DOMAINE=awzid.com ou SITE dans $CONF/caddy.env" >&2; exit 2; }
case "$DOMAINE" in *[!a-z0-9.-]* | .* | *..*) echo "domaine invalide : $DOMAINE" >&2; exit 2 ;; esac
chemin() { local c; for c in "${CIBLES[@]}"; do [ "${c%%:*}" = "$1" ] && { echo "${c#*:}"; return 0; }; done; return 1; }

generer() {
  {
    echo "# Généré par infra/prod/alias-sections.sh — ne pas éditer à la main. Alias de sections ACTIFS (un certificat par nom)."
    local nom cible
    while read -r nom; do
      [ -n "$nom" ] || continue
      cible="$(chemin "$nom")" || continue
      cat <<EOF
http://$nom.$DOMAINE {
	redir https://{\$SITE}$cible 301
}
https://$nom.$DOMAINE {
	import {\$AWFORM_TLS:tls_interne}
	header Strict-Transport-Security "max-age={\$AWFORM_HSTS_SECONDES:31536000}"
	header X-Robots-Tag "noindex, nofollow, noarchive, nosnippet, noimageindex"
	redir https://{\$SITE}$cible 301
}
EOF
    done < "$ACTIFS"
  } > "$DIR/sections.caddy.tmp"
  mv -f "$DIR/sections.caddy.tmp" "$DIR/sections.caddy"
}
recharger() {
  [ "${AWFORM_ALIAS_SANS_RECHARGE:-0}" = 1 ] && return 0
  # l'API d'administration de Caddy est coupée (« admin off ») : on redémarre le seul conteneur Caddy (≈ 2 s d'interruption)
  if docker compose -f "$PROD/compose.yml" restart caddy >/dev/null 2>&1; then
    echo "Caddy redémarré (≈ 2 s) : la configuration des alias est en service."
  else
    echo "Caddy n'a pas pu être redémarré (arrêté ?) : la configuration sera lue au prochain démarrage." >&2
  fi
}
noms() { # arguments → liste de noms valides (« tous » = les cinq)
  local a c out=()
  for a in "$@"; do
    if [ "$a" = tous ]; then for c in "${CIBLES[@]}"; do out+=("${c%%:*}"); done; continue; fi
    chemin "$a" >/dev/null || { echo "alias inconnu : $a (arabe, quran, fiqh, fikh, adab, akhlaq, tous)" >&2; exit 2; }
    out+=("$a")
  done
  printf '%s\n' "${out[@]}"
}
CMD="${1:-liste}"
shift || true
case "$CMD" in
  liste)
    for c in "${CIBLES[@]}"; do
      n="${c%%:*}"
      if grep -qx "$n" "$ACTIFS"; then e="ACTIF     "; else e="désactivé "; fi
      printf '%s %-6s %-22s → https://%s%s\n' "$e" "$n" "$n.$DOMAINE" "$DOMAINE" "${c#*:}"
    done
    ;;
  activer | desactiver)
    [ $# -gt 0 ] || { echo "indiquer au moins un alias (ou « tous »)" >&2; exit 2; }
    LISTE="$(noms "$@")"
    TMP="$(mktemp)"
    if [ "$CMD" = activer ]; then
      { cat "$ACTIFS"; printf '%s\n' "$LISTE"; } | grep -v '^$' | sort -u > "$TMP"
    else
      grep -vxF -f <(printf '%s\n' "$LISTE") "$ACTIFS" > "$TMP" || true
    fi
    cat "$TMP" > "$ACTIFS"
    find "$TMP" -delete
    generer
    recharger
    "$0" liste
    if [ "$CMD" = activer ]; then
      echo "Chaque alias activé doit avoir son enregistrement DNS : CNAME <nom> → $DOMAINE. (un certificat par nom, demandé à l'activation)"
    fi
    ;;
  *)
    echo "usage : $0 liste | activer <alias…|tous> | desactiver <alias…|tous>" >&2
    exit 2
    ;;
esac
