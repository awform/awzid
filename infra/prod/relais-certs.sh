#!/bin/sh
# Relais d'école (lot 17) — serveur CENTRAL : copie, depuis le stockage de Caddy, les certificats des SEULS
# sous-domaines des relais (*.RELAIS_DOMAINE) vers un volume lisible par l'API (compte « node », droits 600).
# L'API les remet ensuite au relais authentifié (GET /api/v1/relais/certificat). La clé du site principal
# n'est jamais copiée (moindre privilège : l'API ne lit pas le stockage de Caddy).
#   SRC  stockage de Caddy (défaut /data/caddy)      OUT  dossier lu par l'API (défaut /out)
#   RELAIS_DOMAINE  ex. relais.awzid.org (vide : rien n'est copié)
#   UNE_FOIS=1      une seule passe (tests) ; sinon toutes les 10 minutes
set -eu
SRC="${SRC:-/data/caddy}"
OUT="${OUT:-/out}"
OWNER="${OWNER:-1000:1000}"
umask 077

passe() {
  dom="${RELAIS_DOMAINE:-}"
  [ -n "$dom" ] || return 0
  for d in "$SRC"/certificates/*/*."$dom"; do
    [ -d "$d" ] || continue
    host="$(basename "$d")"
    issuer="$(basename "$(dirname "$d")")"
    # nom strict : un seul niveau sous le domaine des relais, caractères sûrs
    case "$host" in *[!a-z0-9.-]*) continue ;; esac
    label="${host%."$dom"}"
    case "$label" in '' | *.*) continue ;; esac
    if [ ! -f "$d/$host.crt" ] || [ ! -f "$d/$host.key" ]; then continue; fi
    dst="$OUT/certificates/$issuer/$host"
    mkdir -p "$dst"
    for f in "$host.crt" "$host.key"; do
      if ! cmp -s "$d/$f" "$dst/$f" 2>/dev/null; then
        cp "$d/$f" "$dst/.$f.tmp"
        chmod 600 "$dst/.$f.tmp"
        [ "$(id -u)" = 0 ] && chown "$OWNER" "$dst/.$f.tmp"
        mv -f "$dst/.$f.tmp" "$dst/$f"
      fi
    done
  done
  # un relais dont Caddy n'a plus le certificat n'en garde pas de copie
  for d in "$OUT"/certificates/*/*; do
    [ -d "$d" ] || continue
    [ -d "$SRC/certificates/$(basename "$(dirname "$d")")/$(basename "$d")" ] || rm -rf "$d"
  done
  if [ "$(id -u)" = 0 ] && [ -d "$OUT/certificates" ]; then chown -R "$OWNER" "$OUT/certificates"; fi
  return 0
}

if [ "${UNE_FOIS:-}" = 1 ]; then
  passe
  exit 0
fi
while :; do
  passe || echo "relais-certs : passe en échec" >&2
  sleep 600
done
