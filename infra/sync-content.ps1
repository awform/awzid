# AWFORM — copie du contenu des livres (PC Windows, lecture seule) vers la VM de développement.
# Lancer depuis le PC :  .\sync-content.ps1 -W "<dossier W>" [-Levels en1,ad1] [-VmHost awform-dev]
# Ne modifie RIEN côté PC : lecture seule, copie par scp vers ~/awform-content (hors dépôt git).
# Ne copie jamais le dossier awform\audio (clé Azure).
param(
  [Parameter(Mandatory = $true)][string]$W,
  [string[]]$Levels = @('en1', 'ad1'),
  [string]$VmHost = 'awform-dev',
  [string]$Dest = 'awform-content'
)
$ErrorActionPreference = 'Stop'
$aw = Join-Path $W 'awform'
$items = @()
foreach ($l in $Levels) { $items += , @("$aw\data\$l", "data/") }
$items += , @("$aw\data\index-lecons.js", 'data/')
$items += , @("$aw\data\hifz", 'data/')
$items += , @("$aw\ECARTS_VERSETS.md", '')
$items += , @("$W\coran\tanzil-uthmani.tsv", 'coran/')
ssh $VmHost "rm -rf ~/$Dest.tmp && mkdir -p ~/$Dest.tmp/data ~/$Dest.tmp/registre ~/$Dest.tmp/coran"
foreach ($it in $items) {
  if (-not (Test-Path $it[0])) { throw "Introuvable : $($it[0])" }
  scp -q -r $it[0] "${VmHost}:$Dest.tmp/$($it[1])"
}
# registre : uniquement les fichiers JSON de premier niveau (pas les sauvegardes)
$reg = Get-ChildItem "$aw\registre" -Filter '*.json' -File | ForEach-Object { $_.FullName }
scp -q $reg "${VmHost}:$Dest.tmp/registre/"
# on ne garde pas les sources de génération des carnets (data/hifz/src)
ssh $VmHost "rm -rf ~/$Dest.tmp/data/hifz/src && date -Iseconds > ~/$Dest.tmp/COPIE.txt && (cd ~/$Dest.tmp && find . -type f ! -name MANIFEST.sha256 ! -name COPIE.txt -print0 | sort -z | xargs -0 sha256sum > MANIFEST.sha256) && rm -rf ~/$Dest && mv ~/$Dest.tmp ~/$Dest && wc -l < ~/$Dest/MANIFEST.sha256"
