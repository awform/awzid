# Traductions à relire par un locuteur natif

| Fichier               | Langue                               | État                                                                                                                                                   |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `messages/fr.json`    | français                             | langue de référence (relue)                                                                                                                            |
| `static/i18n/en.json` | anglais                              | en préparation — relu par Claude, relecteur provisoire, le 04/10/2026 ; **relecture humaine courte à faire** (à relire par un locuteur natif)          |
| `static/i18n/es.json` | espagnol                             | en préparation (lot 25) — relu par Claude, relecteur provisoire, le 04/10/2026 ; **relecture humaine courte à faire** (à relire par un locuteur natif) |
| `static/i18n/de.json` | allemand                             | en préparation (lot 25) — relu par Claude, relecteur provisoire, le 04/10/2026 ; **relecture humaine courte à faire** (à relire par un locuteur natif) |
| `static/i18n/ar.json` | arabe (interface de droite à gauche) | en préparation (lot 25) — relu par Claude, relecteur provisoire, le 04/10/2026 ; **relecture humaine courte à faire** (à relire par un locuteur natif) |

Ces fichiers ne contiennent que les textes de l'**interface** : ni le contenu des livres, ni l'arabe étudié, ni le
Coran. Une langue « en préparation » n'est jamais proposée par défaut (`status: 'preparation'` dans
`index.ts`, contrôlé par `i18n.test.ts`) ; elle reste activable sur la démonstration
(`AWFORM_LANGUES_PREPARATION=on`) et ne passe à `relue` qu'après la relecture humaine et l'accord du client.

Pour le relecteur : garder à l'identique les arguments entre accolades (`{n}`, `{date}`, `{n, plural, …}`) ;
`node scripts/verifier-traduction.mjs` et `pnpm test` le contrôlent.

## Relecture provisoire de Claude (04/10/2026, décision du client)

Les 1 773 textes des quatre langues ont été lus en regard du français (dont les 53 textes `mp.*` du Muṣḥaf page
par page, arrivés dans `main` pendant la relecture) ; 252 textes corrigés (anglais 62, espagnol 58, allemand 47,
arabe 85). Les arguments ICU sont restés identiques (vérifiés). Règles appliquées :

- **Un seul terme par notion dans chaque langue** — anglais : « learner » (et non « pupil »), « surah »,
  « Quran » (et non « Qur'an »), « Quran reader », « notebook » pour le carnet de hifẓ ; espagnol : « profesor »
  (et non « docente »), « código parental », « aleya », « Evaluación » pour un bilan, « Señalar » ; allemand :
  « App » (et non « Anwendung »), « Eltern-Code », « Lernkontrolle » pour un bilan (« Test » gardé pour l'essai
  gratuit : « Testphase »), « Koran-Player » ; arabe : « المرشد » pour le tuteur, « القسم » pour la classe,
  « الولي » pour le parent, « يافع » pour un ado, « الدفتر » pour le carnet de hifẓ, « النقطة » pour une note.
- **Termes religieux** : comme le français et le glossaire du projet (`GLOSSAIRE_TERMES.md`) — « tajwid » et
  « fiqh » sans signe diacritique dans toutes les langues latines (« Tajweed », « Tadschwid » remplacés) ;
  hifẓ, riwāya, Muṣḥaf, juzʾ, ḥizb, ijāza gardés tels qu'en français ; « le rebond (الْقَلْقَلَةُ) » rendu par
  « bounce » / « rebote » / « Abprall » (et non « echo » / « Nachhall »).
- **Arabe (droite à gauche)** : flèches harmonisées — « retour » `→` en tête, « suivant » `←` en fin (11 textes
  qui gardaient la flèche du français corrigés) ; unités « ك.ب » / « م.ب » au lieu de « Ko » / « Mo » ; accord du
  nombre par ICU (`offre.jours`, `offre.mois`) ; vouvoiement (pluriel) rétabli là où le français vouvoie, sur les
  écrans où les deux registres se mêlaient (offres, paiement, abonnement, garanties, cas pratiques, accueil
  adulte, notifications).
- **Petits écrans** : aucun texte de bouton allongé ; aucun texte nettement plus long que le français ajouté.

**Reste à trancher par le relecteur humain** (non modifié, faute de certitude) :

- arabe : registre de l'adresse — singulier dans l'espace Coran (`ca.*`) et une partie des écrans enseignant
  (`classe.*`, `epreuve.*`) alors que le français vouvoie ; textes vocalisés (`carnetp.*`, `tj.*`) au milieu
  d'une interface non vocalisée ; prénom d'exemple « آوا د. » (`classe.prenom_initiale`) ;
- allemand : « Schüler » (masculin générique) gardé, à remplacer si l'école préfère une forme neutre ;
- espagnol : « Repaso » garde le sens de « révision » (hifẓ, cartes) ; « Evaluación » pour les bilans ;
- recherche du Muṣḥaf (`mp.recherche_aide`) : l'aide cite les mots-clés « page » et « juz » ; vérifier que la
  recherche comprend aussi « página », « Seite », « صفحة », « جزء », sinon garder les mots-clés français ;
- les sigles d'autorités et de lois gardés en lettres latines (CNIL, RGPD…) ;
- `legal.brouillon` (anglais) annonce encore une relecture native : à retirer après la relecture humaine.

Lot 28 : 30 textes `qc.*` (livrets « Lecture du Coran ») et `coran.qaida_texte` ajoutés ou modifiés dans les
quatre langues en préparation — relus avec le reste le 04/10/2026.

Lot F1 (05/10/2026) : 60 textes `signal.*`, `contenu.*`, `errata.*`, `sync.*`, `madhhab.*` et 6 `erreur.*`
(signaler une erreur, file du référent, errata, réponses mises de côté) traduits par Claude, relecteur
provisoire, dans les quatre langues en préparation — à relire avec le reste ; « référent » rendu par
« reviewer » / « referente » / « Prüfperson » / « المرجع ».

Lot F2 (05/10/2026) : 100 textes `etab.*` (école : personnel, classes, transfert, années, passage de fin d'année,
élève papier → profil, consentement papier, code pour le parent, tablette de classe, archives), `fam.*` (famille
et responsables : rattachement, second parent, émancipation, reprise du profil), `compte.type.ecole` et 19
`erreur.*` traduits par Claude, relecteur provisoire, dans les quatre langues en préparation — à relire avec le
reste. Termes appliqués : anglais « learner » (jamais « pupil »), « head » pour la direction, « main teacher »
pour le titulaire ; espagnol « profesor », « dirección », « titular » ; allemand « Schulleitung »,
« Klassenlehrkraft », « Schüler » ; arabe « الإدارة », « المعلّم الرئيسي », « القسم », « الولي », « الحلقات »
pour les cercles. À vérifier en priorité : la formule juridique du consentement papier (`etab.consentement_papier`)
et l'explication de l'émancipation (`fam.emancipation_aide`), dans chaque langue.

Chantier A27 (05/10/2026) : 144 textes `parc.*` (accueil « Ma prochaine activité », Mon arabe / Mon Coran / Mes
sciences / Au quotidien / Ma classe, espace du niveau et ses onglets, anciens livres, aperçu du suivant, test de
positionnement, épreuve de passage, Mon cahier, fiche à imprimer, « J'écris le Coran » et l'explication du rasm
ʿuthmānī, mots du Coran et couverture), 10 `fam.*` (demande d'autonomie du jeune, proposition de réinscription),
`msg.ancien_enseignant` et 7 `erreur.*`, traduits par Claude, relecteur provisoire — à relire avec le reste. Arabe
sans voyelles comme le reste de l'interface ; « القسم » pour la classe ; espagnol « profesor », « aleya ». À vérifier
en priorité : `parc.rasm_texte` (orthographe du Muṣḥaf) et `fam.demande_aide` (âge légal, « de droit à 18 ans »).

## Coran épuré (06/10/2026)

Les 54 textes `cl.*` (écran de lecture unique : puce, sélecteur, menu du verset, réglages d'écoute et préréglages,
affichage, lecture guidée, accueil) écrits par Claude dans les quatre langues, **à relire** ; « juzʾ », « ḥizb »
gardés tels qu'en français (allemand : « Dschuzʾ », comme ailleurs). Nom affiché : « Awzid » dans tous les textes.

Chantier A21b (05/10/2026) : textes `viv.*` — 9 ajoutés (`viv.m_racine`, `viv.m_conjugaison`, `viv.m_nombre`,
`viv.m_heure`, `viv.demo_choisir`, `viv.demo_livre`, `viv.demo_lecon`, `viv.demo_exemples`, `viv.demo_hors_ligne`), 2 changés
(`viv.niveaux`, `viv.demo_intro` : animations actives partout, désactivables par niveau), 2 retirés (`viv.pilotes`,
`viv.lecon1`) ; traduits par Claude, relecteur provisoire, dans les quatre langues en préparation — à relire avec le
reste. Arabe vocalisé comme les autres textes `viv.*` ; « الْجَذْرُ وَالْوَزْنُ » pour « racine et schème ».

## Corrections du lecteur (06/10/2026)

Textes `cl.*` ajoutés par Claude dans les quatre langues, **à relire** : puce en toutes lettres
(`cl.puce`, `cl.puce_detail` : « verset · page · juzʾ », plus d'abréviations), panneau unique « Réglages »
(`cl.reglages`, `cl.sec_*`), style des pages (`cl.style_*`), riwāyāt décrites
(`cl.riwaya_desc_*`, `cl.riwaya_recitateurs`, `cl.riwaya_sans_recitateur`), taille du texte (`cl.taille*`),
avis du lecteur (`cl.avis_*`), tuiles des enfants (`cl.k_*`), `cl.en_ligne`. Retirés (plus d'état « autre riwāya ») : `ca.autre_riwaya_texte`,
`rw.autre_texte`, `rw.voir_texte`.
## A37 « Vivre l'islam » (06/10/2026)

Les 74 textes `vi.*` (onglet Bon comportement : sous-onglets, défi de la semaine, 18 cercles, 9 lieux, 5 statuts
— arabe : واجب، مستحب، مباح، مكروه، حرام —, fiche, « Que fais-tu si… ? », Transmettre les valeurs) et `nav.vivre`
(« Living Islam », « Vivir el islam », « Den Islam leben », « عِشِ الْإِسْلَامَ » demandés par le client) ; `qt.titre`,
`parc.au_quotidien`, `parc.quotidien_texte` mis à jour. Écrits par Claude, **à relire**. Les textes français du
personnel sont désormais dans `static/i18n/fr-personnel.json` (mêmes clés, hors de la coquille de l'élève).
