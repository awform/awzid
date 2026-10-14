/* Page d'accueil publique : envoi de la demande de liste d'attente (mécanisme existant de l'API).
   Sans suivi, sans cookie, sans bibliothèque. Le jeton anti-robots est signé par le serveur (3 s à 2 h de validité). */
(function () {
  'use strict';
  var f = document.getElementById('attente');
  if (!f) return;
  var M = {};
  try {
    M = JSON.parse(f.getAttribute('data-msg') || '{}');
  } catch (e) {
    M = {};
  }
  var etat = document.getElementById('etat');
  var bouton = f.querySelector('button');
  var jeton = '';
  var recu = 0;
  var MIN = 3200;

  function dire(texte, genre) {
    etat.textContent = texte;
    etat.className = 'etat ' + (genre || '');
  }
  function chargerJeton() {
    return fetch('/api/v1/acces/jeton', { cache: 'no-store', credentials: 'omit' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (j) {
        jeton = j && j.jeton ? j.jeton : '';
        recu = Date.now();
      })
      .catch(function () {
        jeton = '';
      });
  }
  function attendre(ms) {
    return new Promise(function (ok) {
      setTimeout(ok, ms);
    });
  }
  function messageErreur(code, statut) {
    if (code === 'consentement_requis') return M.e_consent;
    if (code === 'trop_de_demandes' || statut === 429) return M.e_trop;
    if (code === 'antibot_echec') return M.e_robot;
    if (code === 'acces_ferme' || statut === 503) return M.e_ferme;
    if (statut === 400) return M.e_email;
    return M.e_reseau;
  }

  chargerJeton();

  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (bouton.disabled) return;
    if (!f.checkValidity()) {
      f.reportValidity();
      return;
    }
    bouton.disabled = true;
    dire(M.envoi || '', '');
    var piege = f.elements['site_web'] ? f.elements['site_web'].value : '';
    var pret = jeton ? Promise.resolve() : chargerJeton();
    pret
      .then(function () {
        var reste = MIN - (Date.now() - recu);
        return reste > 0 ? attendre(reste) : null;
      })
      .then(function () {
        return fetch('/api/v1/acces/liste-attente', {
          method: 'POST',
          credentials: 'omit',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            'x-awform': '1',
          },
          body: JSON.stringify({
            email: f.elements['email'].value.trim(),
            langue: f.getAttribute('data-lang') || 'fr',
            consentement: f.elements['consentement'].checked === true,
            jeton: jeton,
            site_web: piege,
          }),
        });
      })
      .then(function (r) {
        if (r.ok) {
          f.reset();
          Array.prototype.forEach.call(
            f.querySelectorAll('label, input, button, noscript'),
            function (n) {
              n.hidden = true;
            },
          );
          dire(M.ok, 'ok');
          etat.focus();
          return;
        }
        return r
          .json()
          .catch(function () {
            return null;
          })
          .then(function (j) {
            var code = j && j.error ? j.error.code : null;
            dire(messageErreur(code, r.status), 'erreur');
            jeton = '';
            chargerJeton();
            bouton.disabled = false;
          });
      })
      .catch(function () {
        dire(M.e_reseau, 'erreur');
        jeton = '';
        chargerJeton();
        bouton.disabled = false;
      });
  });
})();
