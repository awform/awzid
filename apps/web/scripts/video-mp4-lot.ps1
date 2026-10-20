# Vidéos vivantes v2 — fabrication en lot des MP4 d'un niveau, depuis Windows : lance le lot sur la VM, puis copie
# le dossier sur le Bureau (Desktop\Awzid_reseaux\Videos_Vivantes_<niveau>\).
#
#   .\video-mp4-lot.ps1 ad1                         (versions courtes, 3 formats)
#   .\video-mp4-lot.ps1 ad1 courte,lettre 9x16
#   .\video-mp4-lot.ps1 ad1 -CopieSeulement         (copie d'un lot déjà fabriqué)
#
# Arguments simples seulement (PowerShell 5.1 retire les guillemets internes des arguments de ssh).
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9]+$')][string]$Niveau,
  [ValidatePattern('^[a-z,]+$')][string]$Modes = 'courte',
  [ValidatePattern('^[0-9x,]+$')][string]$Formats = '9x16,16x9,1x1',
  [string]$Depot = '~/awform-demo',
  [string]$Hote = 'awform-dev',
  [switch]$CopieSeulement
)
$ErrorActionPreference = 'Stop'
$nom = "Videos_Vivantes_$Niveau"
if (-not $CopieSeulement) {
  ssh $Hote "bash $Depot/apps/web/scripts/video-mp4-lot.sh $Niveau $Modes $Formats"
  if ($LASTEXITCODE -ne 0) { Write-Warning "lot terminé avec le code $LASTEXITCODE (voir lot.json)" }
}
$dest = Join-Path ([Environment]::GetFolderPath('Desktop')) "Awzid_reseaux\$nom"
New-Item -ItemType Directory -Force $dest | Out-Null
scp -q -r "${Hote}:videos-vivantes/$nom/*" "$dest\"
if ($LASTEXITCODE -ne 0) { throw 'copie impossible' }
$n = (Get-ChildItem $dest -Filter *.mp4).Count
Write-Output "$n films copiés dans $dest"
