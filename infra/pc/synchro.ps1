# AWFORM — synchronisation SÛRE du code depuis le PC (lot 17) : git est la seule source.
# Remplace les anciennes copies de fichiers (awapp-push.ps1 / awapp-pull.ps1) : rien n'est jamais écrasé.
# Utilise le bash de Git for Windows et la même logique que sur la VM (infra/synchro.sh) :
# refus si des modifications ne sont pas enregistrées, refus en cas de divergence, avance sans risque, envoi sans --force.
#   .\infra\pc\synchro.ps1 [-Envoyer] [-Branche lot18-wip]
param([switch]$Envoyer, [string]$Branche = '')
$ErrorActionPreference = 'Stop'
$racine = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$opts = @()
if ($Envoyer) { $opts += '--envoyer' }
if ($Branche) { $opts += @('--branche', $Branche) }
Push-Location $racine
try {
  & bash infra/synchro.sh @opts
  if ($LASTEXITCODE -ne 0) { throw "Synchronisation refusée (code $LASTEXITCODE) : voir le message ci-dessus. Rien n'a été écrasé." }
} finally { Pop-Location }
