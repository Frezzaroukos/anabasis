/* Anabasis landing — language toggle (EN/EL).
 * Kept as an external file because the production CSP is script-src 'self'
 * (no inline scripts). Strings live in data-en / data-el on each element; the
 * page renders EN with no JS, and this enhances it to EL when appropriate. */
(function () {
  'use strict';
  var KEY = 'anabasis.landing.lang';
  var nodes = document.querySelectorAll('[data-en]');
  var buttons = document.querySelectorAll('.lang button[data-lang]');

  function stored() {
    try {
      return window.localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }
  function remember(lang) {
    try {
      window.localStorage.setItem(KEY, lang);
    } catch (e) {
      /* storage disabled — fine, just no persistence */
    }
  }

  function apply(lang) {
    var l = lang === 'el' ? 'el' : 'en';
    document.documentElement.lang = l;
    nodes.forEach(function (node) {
      var text = node.getAttribute('data-' + l);
      if (text != null) node.innerHTML = text;
    });
    buttons.forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-lang') === l ? 'true' : 'false');
    });
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var lang = btn.getAttribute('data-lang');
      remember(lang);
      apply(lang);
    });
  });

  var initial = stored();
  if (!initial) {
    var nav = (navigator.language || 'en').toLowerCase();
    initial = nav.indexOf('el') === 0 ? 'el' : 'en';
  }
  apply(initial);
})();
