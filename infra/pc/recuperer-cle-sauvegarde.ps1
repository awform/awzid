# Récupère sur le PC la clé PRIVÉE des sauvegardes créée sur le serveur (backup-keygen.sh), vérifie la copie,
# puis l'EFFACE du serveur : le serveur ne garde que la clé publique (il chiffre, il ne peut pas déchiffrer).
# Emporte aussi l'ancienne clé symétrique (backup.key) si elle existe encore (anciennes sauvegardes).
#   .\recuperer-cle-sauvegarde.ps1 [-Dossier "<dossier protégé>"] [-VmHost awform-dev]
# Ensuite : faire une DEUXIÈME copie hors ligne (clé USB rangée), puis, dès qu'il existe, le coffre de secrets.
param(
  [string]$Dossier = (Join-Path $env:USERPROFILE 'Documents\khadija\AWFORM-production\cles-sauvegarde'),
  [string]$VmHost = 'awform-dev'
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Dossier | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
foreach ($f in @('A-EMPORTER-backup-private.asc', 'backup.key')) {
  $remote = ".config/awform/$f"
  $exists = ssh $VmHost "test -f ~/$remote && echo oui || echo non"
  if ($exists -ne 'oui') { continue }
  $name = if ($f -eq 'backup.key') { "ancienne-cle-symetrique-$stamp.key" } else { "awform-sauvegardes-cle-privee-$stamp.asc" }
  $local = Join-Path $Dossier $name
  scp -q "${VmHost}:$remote" $local
  $h1 = (Get-FileHash $local -Algorithm SHA256).Hash.ToLower()
  $h2 = (ssh $VmHost "sha256sum ~/$remote | cut -d' ' -f1").Trim()
  if ($h1 -ne $h2) { throw "copie de $f incorrecte (empreintes différentes) : rien n'est effacé sur le serveur" }
  # effacement sur le serveur (écrasement puis suppression)
  ssh $VmHost "shred -u ~/$remote"
  Write-Output "clé copiée : $local (sha256 $($h1.Substring(0,16))) ; effacée du serveur"
}
# dossier réservé à l'utilisateur courant (héritage des droits coupé)
icacls $Dossier /inheritance:r /grant:r "${env:USERNAME}:(OI)(CI)F" | Out-Null
Write-Output "dossier : $Dossier (accès : $env:USERNAME seulement)"
