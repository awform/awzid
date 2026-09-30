# Traductions à relire par un locuteur natif

| Fichier               | Langue                               | État                                                         |
| --------------------- | ------------------------------------ | ------------------------------------------------------------ |
| `messages/fr.json`    | français                             | langue de référence (relue)                                  |
| `static/i18n/en.json` | anglais                              | en préparation — **à relire par un locuteur natif**          |
| `static/i18n/es.json` | espagnol                             | en préparation (lot 25) — **à relire par un locuteur natif** |
| `static/i18n/de.json` | allemand                             | en préparation (lot 25) — **à relire par un locuteur natif** |
| `static/i18n/ar.json` | arabe (interface de droite à gauche) | en préparation (lot 25) — **à relire par un locuteur natif** |

Ces fichiers ne contiennent que les textes de l'**interface** : ni le contenu des livres, ni l'arabe étudié, ni le
Coran. Une langue « en préparation » n'est jamais proposée par défaut (`status: 'preparation'` dans
`index.ts`) ; elle ne passe à `relue` qu'après relecture et accord du client.

Pour le relecteur : garder à l'identique les arguments entre accolades (`{n}`, `{date}`, `{n, plural, …}`) ;
`node scripts/verifier-traduction.mjs` et `pnpm test` le contrôlent.

Points à vérifier en priorité par le relecteur arabe : les flèches `←` / `→` des boutons (laissées comme en
français, à inverser si le sens de lecture l'exige), les sigles d'autorités et de lois gardés en lettres latines
(CNIL, RGPD…), le prénom d'exemple écrit en lettres arabes (`classe.prenom_initiale`).
