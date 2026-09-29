# AWFORM — copie du contenu des livres (PC Windows, lecture seule) vers la VM de développement.
# Lancer depuis le PC :  .\sync-content.ps1 -W "<dossier W>" [-Levels en1,ad1] [-VmHost awform-dev]
# Ne modifie RIEN côté PC : lecture seule, copie par scp vers ~/awform-content (hors dépôt git).
# Ne copie jamais le dossier awform\audio (clé Azure).
param(
  [Parameter(Mandatory = $true)][string]$W,
  [string[]]$Levels = @('en1', 'ad1', 'en2', 'ad2', 're1', 're2', 'ra1', 'ra2'),
  [string]$VmHost = 'awform-dev',
  [string]$Dest = 'awform-content'
)
$ErrorActionPreference = 'Stop'
$aw = Join-Path $W 'awform'
$items = @()
foreach ($l in $Levels) { $items += , @("$aw\data\$l", "data/") }
$items += , @("$aw\data\index-lecons.js", 'data/')
$items += , @("$aw\data\hifz", 'data/')
# bibliothèque des livrets gradués (catalogue.js + livrets)
if (Test-Path "$aw\data\lect") { $items += , @("$aw\data\lect", 'data/') }
$items += , @("$aw\ECARTS_VERSETS.md", '')
$items += , @("$aw\illus", '')
$items += , @("$W\coran\tanzil-uthmani.tsv", 'coran/')
# métadonnées officielles Tanzil (ajzāʾ, quarts de ḥizb, pages de Médine ; CC BY 3.0) : empreinte contrôlée à l'import
if (Test-Path "$W\coran\tanzil-quran-data.js") { $items += , @("$W\coran\tanzil-quran-data.js", 'coran/') }
# tables de correspondance des identifiants d'exercices (gel des livres) : ancien identifiant → id explicite
if (Test-Path "$W\application\ids") { $items += , @("$W\application\ids", '') }
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
