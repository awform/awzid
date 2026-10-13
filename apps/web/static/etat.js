// Page d'état du service (/etat.html) : interroge /api/v1/health (rien de personnel : état, base, version) toutes les
// 30 secondes. Script autonome, sans bibliothèque ; textes en cinq langues d'après la langue du navigateur.
(function () {
  var T = {
    fr: [
      'État du service Awzid',
      'Le service fonctionne normalement.',
      'Le service est dégradé : la base de données ne répond pas.',
      'Le service est injoignable pour le moment.',
      'Base de données',
      'Version',
      'Vérifié à',
      'oui',
      'non',
      'Cette page se met à jour toute seule.',
    ],
    en: [
      'Awzid service status',
      'The service is working normally.',
      'The service is degraded: the database is not responding.',
      'The service cannot be reached right now.',
      'Database',
      'Version',
      'Checked at',
      'yes',
      'no',
      'This page refreshes by itself.',
    ],
    es: [
      'Estado del servicio Awzid',
      'El servicio funciona con normalidad.',
      'El servicio está degradado: la base de datos no responde.',
      'No se puede acceder al servicio por ahora.',
      'Base de datos',
      'Versión',
      'Comprobado a las',
      'sí',
      'no',
      'Esta página se actualiza sola.',
    ],
    de: [
      'Status des Awzid-Dienstes',
      'Der Dienst funktioniert normal.',
      'Der Dienst ist eingeschränkt: Die Datenbank antwortet nicht.',
      'Der Dienst ist im Moment nicht erreichbar.',
      'Datenbank',
      'Version',
      'Geprüft um',
      'ja',
      'nein',
      'Diese Seite aktualisiert sich selbst.',
    ],
    ar: [
      'حالة خدمة Awzid',
      'الخدمة تعمل بشكل طبيعي.',
      'الخدمة متدهورة: قاعدة البيانات لا تستجيب.',
      'تعذّر الوصول إلى الخدمة حاليًا.',
      'قاعدة البيانات',
      'الإصدار',
      'وقت التحقق',
      'نعم',
      'لا',
      'تتحدث هذه الصفحة تلقائيًا.',
    ],
  };
  var lang = 'fr';
  var prefs =
    navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || 'fr'];
  for (var i = 0; i < prefs.length; i++) {
    var b = String(prefs[i]).toLowerCase().split('-')[0];
    if (T[b]) {
      lang = b;
      break;
    }
  }
  var x = T[lang];
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.getElementById('titre').textContent = x[0];
  document.title = 'Awzid — ' + x[0];
  document.getElementById('note').textContent = x[9];
  function ligne(dl, k, v) {
    var dt = document.createElement('dt');
    dt.textContent = k;
    var dd = document.createElement('dd');
    dd.textContent = v;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
  function afficher(etat, h) {
    var el = document.getElementById('etat');
    el.setAttribute('data-etat', etat);
    el.textContent = etat === 'ok' ? x[1] : etat === 'degrade' ? x[2] : x[3];
    var dl = document.getElementById('details');
    dl.textContent = '';
    if (h) {
      ligne(dl, x[4], h.db ? x[7] : x[8]);
      if (h.version) ligne(dl, x[5], String(h.version));
    }
    ligne(dl, x[6], new Date().toLocaleTimeString(lang));
  }
  function verifier() {
    fetch('/api/v1/health', { cache: 'no-store' })
      .then(function (r) {
        return r.json();
      })
      .then(function (h) {
        afficher(h.status === 'ok' && h.db ? 'ok' : 'degrade', h);
      })
      .catch(function () {
        afficher('injoignable', null);
      });
  }
  verifier();
  setInterval(verifier, 30000);
})();
