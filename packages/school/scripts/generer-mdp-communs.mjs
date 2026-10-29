// Génère `src/mdp-communs.ts` : liste LOCALE de mots de passe courants (V2-1, 29/10/2026).
// Aucun appel externe, aucune donnée personnelle : mots et prénoms usuels (français, anglais, arabe translittéré,
// Sénégal), suites du clavier, nombres, combinés avec les suffixes que les gens ajoutent le plus (1, 123, 2026, !…).
// Seules les entrées de 8 caractères ou plus sont gardées (en dessous, la règle de longueur refuse déjà).
// Sortie triée et dédoublonnée : relancer ce script donne exactement le même fichier.
//   node scripts/generer-mdp-communs.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mots = `
password motdepasse azerty qwerty qwertz bonjour bonsoir salut soleil lune etoile amour amoureux famille maison
bienvenue welcome hello admin administrateur administrator login secret secure monde monmotdepasse mypassword
letmein trustno1 iloveyou iloveu princesse prince princess king queen roi reine dragon master monkey shadow
superman batman spiderman pokemon naruto goku sasuke minecraft fortnite roblox football foot basket basketball
tennis soccer barcelona realmadrid madrid psg marseille lyon monaco liverpool chelsea arsenal manchester juventus
milan inter bayern messi ronaldo neymar mbappe benzema zidane drogba eto sadio mane salah lewandowski
senegal dakar thies touba saintlouis kaolack ziguinchor mbour rufisque pikine guediawaye diourbel louga tambacounda
mauritanie nouakchott mali bamako guinee conakry gambie banjul cotedivoire abidjan burkina ouagadougou niger niamey
maroc rabat casablanca marrakech alger algerie tunisie tunis egypte caire paris france bruxelles belgique canada
montreal quebec suisse geneve london england america newyork usa
allah allahou bismillah alhamdulillah subhanallah mashallah inchallah insha astaghfirullah allahuakbar
islam muslim musulman musulmane coran quran koran sourate hadith sunnah prophete muhammad mohammed mohamed
mouhamed mamadou abdoulaye cheikh serigne ibrahima ibrahim ismael ismail ousmane oumar omar moussa moustapha
assane babacar modou pape papa mama maman fatou fatoumata fatima fatimata khadija khadidiatou aissatou aicha aisha
aminata awa mariama mariam maimouna ndeye ndiaye diop fall sow ba sy sarr gueye faye ndao seck cisse diallo
thiam diouf sene mbaye samb lo kane niang wade sall dione tall toure traore kone coulibaly keita camara bah
ahmed ahmad ali hassan hussein hamza bilal yusuf youssef yacine yassine amine anas ayoub zakaria khalid khaled
idrissa mansour abdallah abdelkader abdou rokhaya soda sokhna sophie marie jean pierre paul jacques michel
nicolas thomas julien kevin david daniel samuel emma lea chloe sarah laura julie camille manon ines lina jade
louise alice lucas hugo gabriel arthur raphael adam nathan louis maxime antoine alexandre alexis romain clement
john michael james robert william richard charles joseph jennifer jessica ashley amanda nicole stephanie
dallas pepper ginger cookie cheese coffee summer winter spring autumn sunshine rainbow flower butterfly angel
heaven freedom whatever starwars matrix dolphin tigger buster hunter ranger soccer hockey baseball yankees
computer internet google facebook youtube twitter instagram snapchat tiktok whatsapp telegram gmail hotmail
yahoo outlook orange sfr free wave orangemoney wizall paypal samsung iphone android nokia huawei tecno infinix
awzid awform arabe arabic apprendre apprentissage ecole eleve eleves enseignant professeur maitre classe
classes lecon lecons cahier livre livres madrassa madrasa daara daaras medina mecque makkah kaaba ramadan
eid tabaski korite tamkharit gamou magal maouloud
chocolat banane fraise pomme citron cerise tomate carotte poulet poisson thieboudienne mafe yassa
chat chien cheval lion tigre panda lapin tortue poney requin aigle faucon loup
rouge bleu vert jaune noir blanc violet rose marron gris
lundi mardi mercredi jeudi vendredi samedi dimanche janvier fevrier mars avril juin juillet aout septembre
octobre novembre decembre
voiture moto velo avion train bateau telephone ordinateur tablette clavier souris musique chanson guitare piano
football1 passw0rd p4ssword p455w0rd pa55word pass1234 passe passer motdepasse mdp
liberte egalite fraternite victoire champion gagnant meilleur numero premier dernier toujours jamais ensemble
bonheur sante santee chance destin reussite succes espoir foi paix lumiere vie coeur
abcdefgh abcdefghi abcdefghij abcdefghijk abcdefghijkl abcd efgh
qwertyuiop qwertyuiopasdfghjkl asdfghjkl asdfghjk zxcvbnm azertyuiop azertyuiopqsdfghjklm qsdfghjklm wxcvbn
qazwsx qazwsxedc 1qaz2wsx 1qaz2wsx3edc 1q2w3e4r 1q2w3e4r5t 1q2w3e4r5t6y q1w2e3r4 q1w2e3r4t5 zaq12wsx
poiuytreza mlkjhgfdsq lkjhgfdsa mnbvcxz
aaaaaaaa bbbbbbbb cccccccc dddddddd eeeeeeee llllllll mmmmmmmm nnnnnnnn oooooooo pppppppp xxxxxxxx zzzzzzzz
`
  .split(/\s+/)
  .filter(Boolean);

const suffixes = [
  '',
  ...[
    '1',
    '2',
    '3',
    '7',
    '01',
    '10',
    '11',
    '12',
    '13',
    '21',
    '22',
    '23',
    '69',
    '77',
    '99',
    '00',
    '123',
    '321',
    '234',
    '1234',
    '12345',
    '123456',
    '1234567',
    '12345678',
    '007',
    '000',
    '111',
    '222',
    '333',
    '444',
    '555',
    '666',
    '777',
    '888',
    '999',
    '2020',
    '2021',
    '2022',
    '2023',
    '2024',
    '2025',
    '2026',
    '2027',
    '1990',
    '1995',
    '2000',
    '2005',
    '2010',
    '!',
    '!!',
    '@',
    '#',
    '*',
    '.',
    '_',
    '-',
    '1!',
    '123!',
    '@123',
    '@1234',
    '#123',
    '$',
    '?',
    '&',
    'x',
    'xx',
    'z',
  ],
];

const sortie = new Set();
const ajouter = (s) => {
  const m = s.toLowerCase();
  if ([...m].length >= 8 && [...m].length <= 40) sortie.add(m);
};

for (const m of mots) {
  for (const s of suffixes) ajouter(m + s);
  for (const p of ['mon', 'ma', 'my', 'i']) ajouter(p + m);
}
// mots accolés deux à deux, parmi les plus courants (prénoms et mots d'amour, de foi)
const tetes = mots
  .slice(0, 25)
  .concat(['allah', 'amour', 'bismillah', 'fatima', 'mamadou', 'senegal', 'dakar']);
for (const a of tetes) for (const b of tetes) if (a !== b) ajouter(a + b);

// nombres : répétitions, suites, miroirs, paires
for (let c = 0; c <= 9; c++) for (let n = 8; n <= 16; n++) ajouter(String(c).repeat(n));
const suites = [
  '0123456789',
  '1234567890',
  '123456789',
  '12345678901234567890',
  '9876543210',
  '987654321',
  '98765432',
];
for (const s of suites) {
  for (let n = 8; n <= s.length; n++) {
    ajouter(s.slice(0, n));
    ajouter(s.slice(s.length - n));
  }
}
for (let a = 0; a <= 9; a++)
  for (let b = 0; b <= 9; b++) {
    ajouter(`${a}${b}`.repeat(4));
    ajouter(`${a}${a}${b}${b}`.repeat(2));
    ajouter(`${a}${b}`.repeat(5));
  }
// années et dates collées (jjmmaaaa du 1er janvier, aaaa + aaaa), indicatifs et numéros usuels du Sénégal
for (let y = 1950; y <= 2026; y++) {
  ajouter(`0101${y}`);
  ajouter(`${y}${y}`);
  ajouter(`01012${String(y).slice(-3)}`);
  ajouter(`${y}1234`);
  ajouter(`${y}0101`);
}
for (const op of ['77', '78', '76', '70', '75', '33']) {
  for (const f of [
    '0000000',
    '1111111',
    '1234567',
    '7654321',
    '1212121',
    '1231231',
    '0123456',
    '5555555',
  ])
    ajouter(op + f);
}
// motifs clavier numériques et « mot + année » pour les mots les plus courants
const courants = mots.slice(0, 40);
for (const m of courants) for (let y = 1990; y <= 2026; y++) ajouter(`${m}${y}`);

const liste = [...sortie].sort();
const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const corps =
  `/**\n * Mots de passe courants (liste LOCALE, aucun appel externe) — GÉNÉRÉ par scripts/generer-mdp-communs.mjs, ne pas\n` +
  ` * modifier à la main. ${liste.length} entrées en minuscules, 8 caractères ou plus. Une liste de mots de passe\n` +
  ` * réellement fuités (même format : un mot par ligne) peut remplacer ce contenu sans toucher au code.\n * Utilisée par l'API seulement (jamais envoyée à l'application : poids).\n */\n` +
  `export const MDP_COMMUNS_TEXTE =\n  ${JSON.stringify(liste.join('\n'))};\n`;
writeFileSync(join(racine, 'src', 'mdp-communs.ts'), corps);
console.log(`${liste.length} entrées`);
