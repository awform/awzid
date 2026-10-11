/**
 * Modèles des e-mails (lot F3, revue M7) : sobres, en 5 langues (fr de référence ; en, es, de, ar en
 * préparation, à relire par un locuteur natif comme l'interface), texte brut + HTML minimal (aucune image,
 * aucun traceur, aucun lien autre que celui de l'action). La langue est celle du compte.
 */
export const MAIL_KINDS = [
  'verification',
  'reinitialisation',
  'changement_email',
  'email_deja_utilise',
  'email_modifie',
  'mot_de_passe_modifie',
] as const;
export type MailKind = (typeof MAIL_KINDS)[number];
export const MAIL_LOCALES = ['fr', 'en', 'es', 'de', 'ar'] as const;
type Loc = (typeof MAIL_LOCALES)[number];

interface Texts {
  hello: string;
  footer: string;
  fallback: string;
  kinds: Record<MailKind, { subject: string; before: string[]; button?: string; after: string[] }>;
}

const T: Record<Loc, Texts> = {
  fr: {
    hello: 'Bonjour,',
    footer: 'Awzid — message automatique, merci de ne pas y répondre.',
    fallback: 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :',
    kinds: {
      verification: {
        subject: 'Confirmez votre adresse e-mail',
        before: [
          'Pour confirmer l’adresse de votre compte Awzid, ouvrez ce lien (valable 24 heures, une seule fois).',
        ],
        button: 'Confirmer mon adresse',
        after: [
          'Si vous n’avez pas créé de compte Awzid, ignorez ce message : aucune action n’est nécessaire.',
        ],
      },
      reinitialisation: {
        subject: 'Choisir un nouveau mot de passe',
        before: [
          'Une demande de nouveau mot de passe a été faite pour votre compte Awzid. Pour le choisir, ouvrez ce lien (valable 30 minutes, une seule fois).',
        ],
        button: 'Choisir un nouveau mot de passe',
        after: [
          'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe ne change pas.',
        ],
      },
      changement_email: {
        subject: 'Confirmez votre nouvelle adresse e-mail',
        before: [
          'Une demande a été faite pour que cette adresse devienne celle de votre compte Awzid. Pour confirmer, ouvrez ce lien (valable 24 heures, une seule fois).',
        ],
        button: 'Confirmer cette adresse',
        after: ['Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.'],
      },
      email_deja_utilise: {
        subject: 'Demande de changement d’adresse',
        before: [
          'Une demande a été faite pour associer cette adresse à un compte Awzid, mais elle est déjà utilisée par un compte. Rien n’a été modifié.',
          'Si vous avez oublié votre mot de passe, utilisez « Mot de passe oublié » sur la page de connexion.',
        ],
        after: [],
      },
      email_modifie: {
        subject: 'L’adresse de votre compte a été modifiée',
        before: ['L’adresse e-mail de votre compte Awzid vient d’être remplacée par {email}.'],
        after: [
          'Si vous n’êtes pas à l’origine de ce changement, signalez-le sans attendre depuis la page « Aide » de l’application.',
        ],
      },
      mot_de_passe_modifie: {
        subject: 'Votre mot de passe a été modifié',
        before: [
          'Le mot de passe de votre compte Awzid vient d’être modifié ; vos autres appareils ont été déconnectés.',
        ],
        after: [
          'Si vous n’êtes pas à l’origine de ce changement, utilisez sans attendre « Mot de passe oublié » sur la page de connexion.',
        ],
      },
    },
  },
  en: {
    hello: 'Hello,',
    footer: 'Awzid — automated message, please do not reply.',
    fallback: 'If the button does not work, copy this link into your browser:',
    kinds: {
      verification: {
        subject: 'Confirm your email address',
        before: [
          'To confirm the address of your Awzid account, open this link (valid for 24 hours, single use).',
        ],
        button: 'Confirm my address',
        after: [
          'If you did not create an Awzid account, ignore this message: nothing else is needed.',
        ],
      },
      reinitialisation: {
        subject: 'Choose a new password',
        before: [
          'A new password was requested for your Awzid account. To choose it, open this link (valid for 30 minutes, single use).',
        ],
        button: 'Choose a new password',
        after: [
          'If you did not make this request, ignore this message: your password stays the same.',
        ],
      },
      changement_email: {
        subject: 'Confirm your new email address',
        before: [
          'A request was made for this address to become the address of your Awzid account. To confirm, open this link (valid for 24 hours, single use).',
        ],
        button: 'Confirm this address',
        after: ['If you did not make this request, ignore this message.'],
      },
      email_deja_utilise: {
        subject: 'Address change request',
        before: [
          'A request was made to link this address to an Awzid account, but it is already used by an account. Nothing was changed.',
          'If you forgot your password, use “Forgot password” on the sign-in page.',
        ],
        after: [],
      },
      email_modifie: {
        subject: 'The address of your account was changed',
        before: ['The email address of your Awzid account has just been replaced by {email}.'],
        after: [
          'If you did not make this change, report it right away from the “Help” page of the app.',
        ],
      },
      mot_de_passe_modifie: {
        subject: 'Your password was changed',
        before: [
          'The password of your Awzid account has just been changed; your other devices have been signed out.',
        ],
        after: [
          'If you did not make this change, use “Forgot password” on the sign-in page right away.',
        ],
      },
    },
  },
  es: {
    hello: 'Hola:',
    footer: 'Awzid — mensaje automático, por favor no responda.',
    fallback: 'Si el botón no funciona, copie este enlace en su navegador:',
    kinds: {
      verification: {
        subject: 'Confirme su dirección de correo electrónico',
        before: [
          'Para confirmar la dirección de su cuenta Awzid, abra este enlace (válido 24 horas, un solo uso).',
        ],
        button: 'Confirmar mi dirección',
        after: ['Si no ha creado una cuenta Awzid, ignore este mensaje: no tiene que hacer nada.'],
      },
      reinitialisation: {
        subject: 'Elegir una nueva contraseña',
        before: [
          'Se ha solicitado una nueva contraseña para su cuenta Awzid. Para elegirla, abra este enlace (válido 30 minutos, un solo uso).',
        ],
        button: 'Elegir una nueva contraseña',
        after: ['Si no ha hecho esta solicitud, ignore este mensaje: su contraseña no cambia.'],
      },
      changement_email: {
        subject: 'Confirme su nueva dirección de correo electrónico',
        before: [
          'Se ha solicitado que esta dirección pase a ser la de su cuenta Awzid. Para confirmarlo, abra este enlace (válido 24 horas, un solo uso).',
        ],
        button: 'Confirmar esta dirección',
        after: ['Si no ha hecho esta solicitud, ignore este mensaje.'],
      },
      email_deja_utilise: {
        subject: 'Solicitud de cambio de dirección',
        before: [
          'Se ha solicitado asociar esta dirección a una cuenta Awzid, pero ya la utiliza una cuenta. No se ha modificado nada.',
          'Si ha olvidado su contraseña, utilice «¿Olvidó su contraseña?» en la página de inicio de sesión.',
        ],
        after: [],
      },
      email_modifie: {
        subject: 'La dirección de su cuenta ha cambiado',
        before: [
          'La dirección de correo electrónico de su cuenta Awzid acaba de ser sustituida por {email}.',
        ],
        after: [
          'Si no ha hecho este cambio, comuníquelo de inmediato desde la página «Ayuda» de la aplicación.',
        ],
      },
      mot_de_passe_modifie: {
        subject: 'Su contraseña ha cambiado',
        before: [
          'La contraseña de su cuenta Awzid acaba de cambiar; sus demás dispositivos se han desconectado.',
        ],
        after: [
          'Si no ha hecho este cambio, utilice de inmediato «¿Olvidó su contraseña?» en la página de inicio de sesión.',
        ],
      },
    },
  },
  de: {
    hello: 'Guten Tag,',
    footer: 'Awzid — automatische Nachricht, bitte nicht antworten.',
    fallback:
      'Falls die Schaltfläche nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:',
    kinds: {
      verification: {
        subject: 'Bestätigen Sie Ihre E-Mail-Adresse',
        before: [
          'Um die Adresse Ihres Awzid-Kontos zu bestätigen, öffnen Sie diesen Link (24 Stunden gültig, nur einmal verwendbar).',
        ],
        button: 'Adresse bestätigen',
        after: [
          'Falls Sie kein Awzid-Konto erstellt haben, ignorieren Sie diese Nachricht: Sie müssen nichts tun.',
        ],
      },
      reinitialisation: {
        subject: 'Neues Passwort wählen',
        before: [
          'Für Ihr Awzid-Konto wurde ein neues Passwort angefordert. Um es zu wählen, öffnen Sie diesen Link (30 Minuten gültig, nur einmal verwendbar).',
        ],
        button: 'Neues Passwort wählen',
        after: [
          'Falls Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese Nachricht: Ihr Passwort bleibt unverändert.',
        ],
      },
      changement_email: {
        subject: 'Bestätigen Sie Ihre neue E-Mail-Adresse',
        before: [
          'Es wurde angefragt, dass diese Adresse die Adresse Ihres Awzid-Kontos wird. Zur Bestätigung öffnen Sie diesen Link (24 Stunden gültig, nur einmal verwendbar).',
        ],
        button: 'Diese Adresse bestätigen',
        after: ['Falls Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese Nachricht.'],
      },
      email_deja_utilise: {
        subject: 'Anfrage zur Adressänderung',
        before: [
          'Es wurde angefragt, diese Adresse mit einem Awzid-Konto zu verknüpfen, sie wird aber bereits von einem Konto verwendet. Es wurde nichts geändert.',
          'Falls Sie Ihr Passwort vergessen haben, nutzen Sie „Passwort vergessen“ auf der Anmeldeseite.',
        ],
        after: [],
      },
      email_modifie: {
        subject: 'Die Adresse Ihres Kontos wurde geändert',
        before: ['Die E-Mail-Adresse Ihres Awzid-Kontos wurde soeben durch {email} ersetzt.'],
        after: [
          'Falls Sie diese Änderung nicht vorgenommen haben, melden Sie es sofort über die Seite „Hilfe“ der App.',
        ],
      },
      mot_de_passe_modifie: {
        subject: 'Ihr Passwort wurde geändert',
        before: [
          'Das Passwort Ihres Awzid-Kontos wurde soeben geändert; Ihre anderen Geräte wurden abgemeldet.',
        ],
        after: [
          'Falls Sie diese Änderung nicht vorgenommen haben, nutzen Sie sofort „Passwort vergessen“ auf der Anmeldeseite.',
        ],
      },
    },
  },
  ar: {
    hello: 'السلام عليكم،',
    footer: 'Awzid — رسالة آلية، يرجى عدم الرد عليها.',
    fallback: 'إذا لم يعمل الزر، انسخ هذا الرابط في متصفحك:',
    kinds: {
      verification: {
        subject: 'أكّد عنوان بريدك الإلكتروني',
        before: ['لتأكيد عنوان حسابك في Awzid، افتح هذا الرابط (صالح لمدة 24 ساعة، ولمرة واحدة).'],
        button: 'تأكيد عنواني',
        after: ['إذا لم تُنشئ حسابًا في Awzid، فتجاهل هذه الرسالة: لا يلزمك أي إجراء.'],
      },
      reinitialisation: {
        subject: 'اختيار كلمة مرور جديدة',
        before: [
          'طُلبت كلمة مرور جديدة لحسابك في Awzid. لاختيارها، افتح هذا الرابط (صالح لمدة 30 دقيقة، ولمرة واحدة).',
        ],
        button: 'اختيار كلمة مرور جديدة',
        after: ['إذا لم تكن صاحب هذا الطلب، فتجاهل هذه الرسالة: كلمة مرورك لن تتغير.'],
      },
      changement_email: {
        subject: 'أكّد عنوان بريدك الإلكتروني الجديد',
        before: [
          'طُلب أن يصبح هذا العنوان عنوانَ حسابك في Awzid. للتأكيد، افتح هذا الرابط (صالح لمدة 24 ساعة، ولمرة واحدة).',
        ],
        button: 'تأكيد هذا العنوان',
        after: ['إذا لم تكن صاحب هذا الطلب، فتجاهل هذه الرسالة.'],
      },
      email_deja_utilise: {
        subject: 'طلب تغيير العنوان',
        before: [
          'طُلب ربط هذا العنوان بحساب في Awzid، لكنه مستعمل في حساب آخر. لم يتغير شيء.',
          'إذا نسيت كلمة مرورك، فاستعمل «نسيت كلمة المرور» في صفحة تسجيل الدخول.',
        ],
        after: [],
      },
      email_modifie: {
        subject: 'تغيّر عنوان حسابك',
        before: ['استُبدل للتو عنوان البريد الإلكتروني لحسابك في Awzid بالعنوان:'],
        after: ['إذا لم تكن صاحب هذا التغيير، فأبلغ عنه فورًا من صفحة «المساعدة» في التطبيق.'],
      },
      mot_de_passe_modifie: {
        subject: 'تغيّرت كلمة مرورك',
        before: ['تغيّرت للتو كلمة مرور حسابك في Awzid، وسُجّل خروج أجهزتك الأخرى.'],
        after: [
          'إذا لم تكن صاحب هذا التغيير، فاستعمل فورًا «نسيت كلمة المرور» في صفحة تسجيل الدخول.',
        ],
      },
    },
  },
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

/**
 * Message prêt à envoyer. `link` : lien d'action (vérification, réinitialisation) ; `email` : adresse masquée
 * citée dans l'avis de changement. En arabe, l'adresse et le lien sont sur LEUR PROPRE LIGNE (jamais mêlés au
 * texte arabe), isolés de gauche à droite.
 */
export function renderMail(
  kind: MailKind,
  locale: string,
  vars: { link?: string; email?: string } = {},
): RenderedMail {
  const loc: Loc = (MAIL_LOCALES as readonly string[]).includes(locale) ? (locale as Loc) : 'fr';
  const tx = T[loc];
  const k = tx.kinds[kind];
  const rtl = loc === 'ar';
  const fill = (s: string) => s.replace('{email}', vars.email ?? '');
  const before = k.before.map(fill);
  const after = k.after.map(fill);
  const emailLine = rtl && kind === 'email_modifie' && vars.email ? [vars.email] : [];
  const text = [
    tx.hello,
    '',
    ...before.flatMap((p) => [p, '']),
    ...emailLine.flatMap((p) => [p, '']),
    ...(vars.link ? [vars.link, ''] : []),
    ...after.flatMap((p) => [p, '']),
    '—',
    tx.footer,
    '',
  ].join('\n');
  const p = (s: string) => `<p style="margin:0 0 14px;line-height:1.5">${esc(s)}</p>`;
  const ltr = (s: string) =>
    `<p dir="ltr" style="margin:0 0 14px;text-align:left;word-break:break-all">${esc(s)}</p>`;
  const html = [
    '<!doctype html>',
    `<html lang="${loc}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(k.subject)}</title></head>`,
    '<body style="margin:0;padding:24px 12px;background:#f4f6f3;color:#1c2a22;font-family:Arial,Helvetica,sans-serif;font-size:16px">',
    '<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">',
    '<p style="margin:0 0 18px;font-weight:bold;color:#0f5132" dir="ltr">Awzid</p>',
    p(tx.hello),
    ...before.map(p),
    ...emailLine.map(ltr),
    ...(vars.link && k.button
      ? [
          `<p style="margin:18px 0"><a href="${esc(vars.link)}" style="display:inline-block;background:#0f5132;color:#ffffff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:bold">${esc(k.button)}</a></p>`,
          `<p style="margin:0 0 6px;font-size:13px;color:#555555">${esc(tx.fallback)}</p>`,
          ltr(vars.link),
        ]
      : []),
    ...after.map(p),
    `<p style="margin:18px 0 0;font-size:13px;color:#555555">${esc(tx.footer)}</p>`,
    '</div></body></html>',
  ].join('\n');
  return { subject: k.subject, text, html };
}

/** Adresse masquée (« ab…@exemple.fr ») pour les avis : jamais l'adresse complète dans un message à un tiers. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}…@${domain}`;
}
