# Application Android AWFORM (lot 16)

L'application Android est un **emballage Capacitor de la PWA** (`apps/android`) : elle ouvre le site AWFORM
(`AWFORM_ANDROID_URL`), avec le même code, les mêmes mises à jour et le même hors ligne (service worker).
Rien n'est dupliqué : une correction publiée sur le site vaut aussi pour l'application.

## 1. Version de débogage (sans compte Google)

1. **Une fois, par une personne** (licence du SDK Android à lire et accepter soi-même) :
   `infra/android/setup-sdk.sh` — installe le JDK 21, les outils en ligne de commande du SDK (versions
   épinglées : outils 13114758, plateforme 35, build-tools 35.0.0), affiche l'empreinte SHA-256 du fichier
   téléchargé à comparer avec celle de developer.android.com, puis `sdkmanager --licenses`.
2. **Construction** (reproductible : lockfile gelé, Gradle et SDK épinglés, horodatage du commit) :
   `ANDROID_HOME=~/android-sdk AWFORM_ANDROID_URL=https://192.168.50.10 infra/android/build-debug.sh`
   → `apps/android/android/app/build/outputs/apk/debug/app-debug.apk` et son empreinte.
3. **Installation sur un téléphone de test** : activer le « débogage USB », puis `adb install app-debug.apk`
   (ou copier le fichier et autoriser « sources inconnues » pour ce seul fichier).

La démonstration du réseau local utilise l'autorité de certification interne de Caddy : sur le téléphone,
installer son certificat racine (voir `application/TEST_APPAREILS.md`) ou utiliser un domaine réel.

## 2. Publication future sur Google Play (à faire par le client)

1. **Compte développeur Google Play** au nom de l'éditeur (frais d'inscription, vérification d'identité).
2. **Identifiant définitif** de l'application (`appId`, aujourd'hui provisoire `org.awform.app`) : il ne
   pourra plus changer après la première publication.
3. **Clé de signature de publication** : générée par le client (`keytool -genkeypair …`), conservée dans le
   coffre de secrets, JAMAIS dans le dépôt ; activer « Play App Signing » (Google conserve la clé de
   distribution, le client garde la clé d'envoi).
4. **Paquet de publication** : `./gradlew bundleRelease` (AAB) avec la configuration de signature lue dans
   des variables d'environnement ; niveau d'API cible exigé par Google Play (35 aujourd'hui).
5. **Fiche Play** : description, captures, icône, catégorie Éducation ; **politique de confidentialité**
   (URL de la page `/legal/confidentialite`, validée par le juriste) ; formulaire **« Sécurité des
   données »** (données collectées : e-mail du parent, pseudonymes, réponses, progression ; aucune
   publicité, aucun partage ; chiffrement en transit ; suppression sur demande) ; **classification du
   contenu** ; programme **« Familles »** (application pour enfants : exigences publicité et données).
6. **Tests** : piste de test interne puis fermée (école pilote), avant la production.
7. **Notifications** : les notifications web push fonctionnent dans la PWA ; dans l'application, elles
   passeront par Firebase Cloud Messaging (compte Firebase du client) — à décider avant publication.
