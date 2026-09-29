# Test de restauration de la dernière sauvegarde, avec la clé PRIVÉE qui reste sur le PC : elle est envoyée
# par l'entrée standard de ssh, importée dans un trousseau temporaire EN MÉMOIRE sur le serveur, puis effacée.
#   .\test-restauration.ps1 [-Cle "<fichier .asc>"] [-VmHost awform-dev]
param(
  [string]$Cle = '',
  [string]$VmHost = 'awform-dev'
)
$ErrorActionPreference = 'Stop'
if (-not $Cle) {
  $dir = Join-Path $env:USERPROFILE 'Documents\khadija\AWFORM-production\cles-sauvegarde'
  $Cle = (Get-ChildItem $dir -Filter 'awform-sauvegardes-cle-privee-*.asc' | Sort-Object Name | Select-Object -Last 1).FullName
}
if (-not $Cle -or -not (Test-Path $Cle)) { throw 'clé privée introuvable' }
# redirection par cmd.exe : octets transmis tels quels (le tuyau de PowerShell 5.1 réencode le texte)
$ErrorActionPreference = 'Continue'  # les avis de PostgreSQL arrivent sur la sortie d'erreur
cmd /c "ssh $VmHost ~/awform-app/infra/prod/restore-test.sh < `"$Cle`""
if ($LASTEXITCODE -ne 0) { throw "test de restauration en échec ($LASTEXITCODE)" }
