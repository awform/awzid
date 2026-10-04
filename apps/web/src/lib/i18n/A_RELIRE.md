# Traductions à relire par un locuteur natif

| Fichier               | Langue                               | État                                                                                                                   |
| --------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `messages/fr.json`    | français                             | langue de référence (relue)                                                                                            |
| `static/i18n/en.json` | anglais                              | en préparation — relu par Claude, relecteur provisoire, le 04/10/2026 ; **relecture humaine courte à faire** (à relire par un locuteur natif)           |
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
