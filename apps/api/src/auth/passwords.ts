/**
 * Politique des mots de passe (OWASP ASVS 5.0 V6.2) : au moins 12 caractères, jusqu'à 128, tous les
 * caractères admis (espaces, lettres accentuées, arabe), AUCUNE règle de composition imposée, refus des
 * mots de passe courants ou contenant l'adresse e-mail. (Pas de normalisation Unicode : règle du projet.)
 */
export const MIN_LENGTH = 12;
export const MAX_LENGTH = 128;

const COMMON = new Set(
  `123456789012 1234567890123 azertyuiop12 azertyuiopqs qwertyuiop12 motdepasse12 motdepasse123
  password1234 password12345 passwordpassword 000000000000 111111111111 123123123123 abcdefghijkl
  azerty123456 qwerty123456 iloveyou1234 bismillah123 bismillah1234 soleil123456 bonjour12345
  marseille123 football1234 administrator changemenow1 welcome12345 letmein12345 motdepasse00
  awform123456 awzid1234567 azertyazerty qwertyqwerty 1q2w3e4r5t6y 1qaz2wsx3edc aaaaaaaaaaaa
  allahuakbar1 alhamdulillah subhanallah1 mashallah123 inchallah123 senegal12345 dakar1234567
  france123456 paris1234567 motdepasse!! password!!!! 12345678910! azertyuiop!!`
    .split(/\s+/)
    .filter(Boolean),
);

export type PasswordProblem = 'trop_court' | 'trop_long' | 'trop_courant' | 'contient_email';

export function checkPassword(pw: string, email = ''): PasswordProblem | null {
  const chars = [...pw].length;
  if (chars < MIN_LENGTH) return 'trop_court';
  if (chars > MAX_LENGTH) return 'trop_long';
  const low = pw.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(pw) || /^(0123456789|123456789)+/.test(pw))
    return 'trop_courant';
  const local = email.toLowerCase().split('@')[0] ?? '';
  if (local.length >= 4 && low.includes(local)) return 'contient_email';
  return null;
}
