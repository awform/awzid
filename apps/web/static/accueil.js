/* Page d'accueil publique : envoi de la demande de liste d'attente (mécanisme existant de l'API).
   Sans suivi, sans cookie, sans bibliothèque. Le jeton anti-robots est signé par le serveur (3 s à 2 h de validité). */
(function () {
  'use strict';
  /* Pages des liens reçus par e-mail : le jeton est dans le fragment de l'adresse (#t=…), jamais envoyé au serveur web
     ni gardé dans les journaux ; un clic explicite envoie la confirmation ou la désinscription à l'API. */
  function gererLien(form) {
    var M2 = {};
    try {
      M2 = JSON.parse(form.getAttribute('data-msg') || '{}');
    } catch (e) {
      M2 = {};
    }
    var etat2 = document.getElementById('etat');
    var btn = form.querySelector('button');
    var action = form.getAttribute('data-action');
    var m = /(?:^|[#&])t=([\w-]+)/.exec(location.hash);
    var jeton2 = m ? m[1] : '';
    function dire2(texte, genre) {
      etat2.textContent = texte;
      etat2.className = 'etat ' + (genre || '');
    }
    if (!jeton2) {
      btn.hidden = true;
      dire2(M2.invalide, 'erreur');
      return;
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (btn.disabled) return;
      btn.disabled = true;
      dire2(M2.attente || '', '');
      fetch('/api/v1/acces/liste-attente/' + action, {
        method: 'POST',
        credentials: 'omit',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-awform': '1',
        },
        body: JSON.stringify({ token: jeton2 }),
      })
        .then(function (r) {
          return r
            .json()
            .catch(function () {
              return null;
            })
            .then(function (j) {
              if (r.ok) {
                btn.hidden = true;
                history.replaceState(null, '', location.pathname + location.search);
                dire2(
                  action === 'desinscrire'
                    ? M2.desinscr_ok
                    : j && j.etat === 'deja'
                      ? M2.deja
                      : M2.confirmer_ok,
                  'ok',
                );
                etat2.focus();
                return;
              }
              btn.disabled = false;
              if (r.status === 400) {
                btn.hidden = true;
                dire2(M2.invalide, 'erreur');
              } else dire2(r.status === 429 ? M2.e_trop : M2.e_reseau, 'erreur');
            });
        })
        .catch(function () {
          btn.disabled = false;
          dire2(M2.e_reseau, 'erreur');
        });
    });
  }
  var lienForm = document.getElementById('lien');
  if (lienForm) return gererLien(lienForm);
  var f = document.getElementById('attente');
  if (!f) return;
  /* Provenance (?src= des affiches, validée par le serveur dans un champ caché) : gardée dans le stockage de SESSION
     de l'onglet (ni cookie ni traceur, effacé à la fermeture) pour la retrouver après un changement de langue ou sur
     /inscription ; envoyée avec la demande. */
  var SRC_RE = /^[a-z0-9-]{1,40}$/;
  var source = f.elements['src'] ? f.elements['src'].value : '';
  try {
    if (SRC_RE.test(source)) sessionStorage.setItem('awzid_src', source);
    else source = sessionStorage.getItem('awzid_src') || '';
  } catch (e) {
    /* stockage indisponible : le champ caché suffit */
  }
  if (!SRC_RE.test(source)) source = '';
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
          body: JSON.stringify(
            Object.assign(
              {
                email: f.elements['email'].value.trim(),
                langue: f.getAttribute('data-lang') || 'fr',
                consentement: f.elements['consentement'].checked === true,
                jeton: jeton,
                site_web: piege,
              },
              source ? { src: source } : {},
            ),
          ),
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
