(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  root.classList.add('js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  var KEY = 'anabasis.landing.lang';
  var META = {
    en: {
      title: 'Anabasis — weighted calisthenics & skill progression',
      description:
        'A training log for weighted calisthenics and skills. Log weighted basics and skill ladders in one place — offline-first, private, no signup to try.',
    },
    el: {
      title: 'Anabasis — weighted calisthenics & skill progression',
      description:
        'Training log για weighted calisthenics και skills. Κατέγραψε βασικές ασκήσεις και skill ladders σε ένα μέρος — offline-first, ιδιωτικό, χωρίς εγγραφή για να δοκιμάσεις.',
    },
  };

  var currentLang = 'en';
  var all = function (selector, scope) {
    return Array.prototype.slice.call((scope || doc).querySelectorAll(selector));
  };
  var one = function (selector, scope) {
    return (scope || doc).querySelector(selector);
  };

  var languageNodes = all('[data-en]');
  var languageButtons = all('.lang button[data-lang]');
  var revealItems = all('[data-reveal]');
  var liveItems = all('[data-live]');
  var foundingCtas = all('[data-founding-cta]');
  var elements = {};
  var state = { limit: 250, remaining: null, mode: 'loading' };
  var pollTimer = null;
  var fetching = false;

  function storedLanguage() {
    try {
      return window.localStorage.getItem(KEY);
    } catch (error) {
      return null;
    }
  }

  function rememberLanguage(lang) {
    try {
      window.localStorage.setItem(KEY, lang);
    } catch (error) {
      return;
    }
  }

  function t(en, el) {
    return currentLang === 'el' ? el : en;
  }

  function animateNumber(el, to, instant) {
    if (!el) return;
    var target = Math.max(0, Math.round(to));
    if (el._numberFrame) {
      cancelAnimationFrame(el._numberFrame);
      el._numberFrame = 0;
    }
    var from = parseInt(String(el.textContent || '').replace(/[^\d]/g, ''), 10);
    if (instant || reduceMotion.matches || !isFinite(from) || from === target) {
      el.textContent = String(target);
      return;
    }
    var started = null;
    var duration = 620;
    function step(now) {
      if (started === null) started = now;
      var progress = Math.min(1, (now - started) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = String(Math.round(from + (target - from) * eased));
      if (progress < 1) {
        el._numberFrame = requestAnimationFrame(step);
      } else {
        el._numberFrame = 0;
      }
    }
    el._numberFrame = requestAnimationFrame(step);
  }

  function setLiveText(text) {
    if (elements.live && elements.live.textContent !== text) elements.live.textContent = text;
  }

  function renderFounding(instant) {
    if (!elements.meter) return;
    var closed = state.mode === 'closed';
    var live = state.mode === 'live';
    var neutral = !closed && !live;
    var limit = state.limit || 250;
    var remaining = live || closed ? state.remaining : null;
    var percent = live && limit > 0 ? Math.max(0, Math.min(100, (remaining / limit) * 100)) : 0;

    root.classList.toggle('founding-closed', closed);
    elements.strip.classList.toggle('is-neutral', neutral);
    elements.strip.classList.toggle('is-closed', closed);
    elements.stripLead.textContent = closed ? t('Founding closed', 'Το founding έκλεισε') : 'Founding';
    elements.strip.setAttribute(
      'aria-label',
      closed
        ? t('Founding closed. See pricing.', 'Το founding έκλεισε. Δες τιμές.')
        : live
          ? t(
              'Founding: ' + remaining + ' of ' + limit + ' spots left. See pricing.',
              'Founding: ' + remaining + ' από ' + limit + ' θέσεις. Δες τιμές.'
            )
          : t(
              'Founding: 250 spots, live status unavailable. See pricing.',
              'Founding: 250 θέσεις, η ζωντανή κατάσταση δεν είναι διαθέσιμη. Δες τιμές.'
            )
    );

    if (closed) {
      elements.stripCount.textContent = '0';
      elements.stripTail.textContent = '';
      elements.stripBar.style.width = '0%';
    } else if (live) {
      animateNumber(elements.stripCount, remaining, instant);
      elements.stripTail.textContent = ' / ' + limit + ' ' + t('left', 'θέσεις');
      elements.stripBar.style.width = percent + '%';
    } else {
      elements.stripCount.textContent = '250';
      elements.stripTail.textContent = ' ' + t('spots · live', 'θέσεις · live');
      elements.stripBar.style.width = '100%';
    }

    elements.meter.classList.toggle('is-neutral', neutral);
    elements.meter.classList.toggle('is-closed', closed);
    elements.meter.classList.toggle('is-live', live);
    elements.total.textContent = '/ ' + limit;
    elements.bar.setAttribute('aria-valuemax', String(limit));
    elements.bar.setAttribute('aria-label', t('Founding spots remaining', 'Θέσεις founding που απομένουν'));
    elements.heading.textContent = closed
      ? t('The founding window is closed.', 'Το founding παράθυρο έκλεισε.')
      : live
        ? t('The founding window is live.', 'Το founding παράθυρο είναι ανοιχτό.')
        : t('First 250. One price.', 'Οι πρώτοι 250. Μία τιμή.');

    if (closed) {
      animateNumber(elements.count, 0, instant);
      elements.unit.textContent = t('left', 'θέσεις');
      elements.state.textContent = t('Founding closed', 'Το founding έκλεισε');
      elements.note.textContent = t(
        'Founding is closed. Standard lifetime is still available below.',
        'Το founding έκλεισε. Το standard lifetime παραμένει διαθέσιμο παρακάτω.'
      );
      setLiveText(t('Founding closed.', 'Το founding έκλεισε.'));
      elements.barFill.style.width = '0%';
      elements.bar.setAttribute('aria-valuenow', '0');
      elements.bar.setAttribute('aria-valuetext', t('Founding closed', 'Το founding έκλεισε'));
      elements.bar.setAttribute('aria-hidden', 'false');
    } else if (live) {
      animateNumber(elements.count, remaining, instant);
      elements.unit.textContent = t('left', 'θέσεις');
      elements.state.textContent = t('Live from checkout', 'Ζωντανά από το checkout');
      elements.note.textContent = t('Updates every 20 seconds', 'Ανανεώνεται κάθε 20 δευτερόλεπτα');
      setLiveText(
        t(
          remaining + ' of ' + limit + ' founding spots left.',
          remaining + ' από ' + limit + ' founding θέσεις.'
        )
      );
      elements.barFill.style.width = percent + '%';
      elements.bar.setAttribute('aria-valuenow', String(remaining));
      elements.bar.setAttribute(
        'aria-valuetext',
        remaining + ' / ' + limit + ' ' + t('spots remaining', 'θέσεις διαθέσιμες')
      );
      elements.bar.setAttribute('aria-hidden', 'false');
    } else {
      elements.count.textContent = '250';
      elements.unit.textContent = t('spots', 'θέσεις');
      elements.state.textContent = t('250 spots · live', '250 θέσεις · live');
      elements.note.textContent = state.mode === 'loading'
        ? t('Checking live spots…', 'Έλεγχος ζωντανών θέσεων…')
        : t('Live counter unavailable.', 'Ο μετρητής δεν είναι διαθέσιμος.');
      setLiveText(
        state.mode === 'loading'
          ? t('Checking founding spots.', 'Έλεγχος θέσεων founding.')
          : t('Live founding counter unavailable.', 'Ο ζωντανός μετρητής δεν είναι διαθέσιμος.')
      );
      elements.barFill.style.width = '0%';
      elements.bar.setAttribute('aria-hidden', 'true');
    }

    elements.closedNote.hidden = !closed;
    foundingCtas.forEach(function (cta) {
      if (closed) cta.setAttribute('aria-disabled', 'true');
      else cta.removeAttribute('aria-disabled');
    });

    if (elements.short) {
      if (closed) elements.short.textContent = t('Founding closed', 'Το founding έκλεισε');
      else if (live) elements.short.textContent = 'Founding · ' + remaining + ' ' + t('left', 'θέσεις');
      else elements.short.textContent = t('Founding · 250 spots · live', 'Founding · 250 θέσεις · live');
    }
  }

  function parseConfig(data) {
    if (!data || data.enabled !== true) return null;
    var plans = Array.isArray(data.plans) ? data.plans : [];
    var founding = null;
    for (var index = 0; index < plans.length; index += 1) {
      if (plans[index] && plans[index].id === 'founding') {
        founding = plans[index];
        break;
      }
    }
    if (!founding || typeof founding.remaining !== 'number' || !isFinite(founding.remaining)) return null;
    var limit = Number(data.founding_limit);
    if (!isFinite(limit) || limit <= 0) limit = 250;
    limit = Math.round(limit);
    return {
      limit: limit,
      remaining: Math.max(0, Math.min(limit, Math.round(founding.remaining))),
    };
  }

  function setNeutral() {
    if (state.mode === 'closed') return;
    state.mode = 'neutral';
    state.remaining = null;
    renderFounding(false);
  }

  function schedulePoll() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(fetchFounding, 20000);
  }

  function fetchFounding() {
    if (fetching || doc.hidden) return;
    fetching = true;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var abortTimer = controller
      ? setTimeout(function () {
          controller.abort();
        }, 8000)
      : null;

    fetch('/api/billing/config', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : undefined,
    })
      .then(function (response) {
        if (!response.ok) throw new Error('billing config ' + response.status);
        return response.json();
      })
      .then(function (data) {
        var parsed = parseConfig(data);
        if (!parsed) {
          setNeutral();
          return;
        }
        state.limit = parsed.limit;
        state.remaining = parsed.remaining;
        state.mode = parsed.remaining <= 0 ? 'closed' : 'live';
        renderFounding(false);
      })
      .catch(function () {
        setNeutral();
      })
      .then(function () {
        if (abortTimer) clearTimeout(abortTimer);
        fetching = false;
        schedulePoll();
      });
  }

  function applyLanguage(lang) {
    currentLang = lang === 'el' ? 'el' : 'en';
    doc.documentElement.lang = currentLang;
    doc.title = META[currentLang].title;
    var meta = doc.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', META[currentLang].description);
    languageNodes.forEach(function (node) {
      var text = node.getAttribute('data-' + currentLang);
      if (text !== null) node.innerHTML = text;
    });
    languageButtons.forEach(function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-lang') === currentLang ? 'true' : 'false');
    });
    renderFounding(true);
  }

  function setupLanguage() {
    languageButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        var lang = button.getAttribute('data-lang');
        rememberLanguage(lang);
        applyLanguage(lang);
      });
    });
    var initial = storedLanguage();
    if (!initial) {
      var nav = (navigator.language || 'en').toLowerCase();
      initial = nav.indexOf('el') === 0 ? 'el' : 'en';
    }
    applyLanguage(initial);
  }

  function setupReveal() {
    all('[data-stagger]').forEach(function (group) {
      all('[data-reveal]', group).forEach(function (item, index) {
        if (!item.style.getPropertyValue('--reveal-delay')) {
          item.style.setProperty('--reveal-delay', index * 70 + 'ms');
        }
      });
    });

    if (reduceMotion.matches || !('IntersectionObserver' in window)) {
      revealItems.forEach(function (item) {
        item.classList.add('is-visible');
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    );
    revealItems.forEach(function (item) {
      observer.observe(item);
    });
  }

  function setupLive() {
    if (reduceMotion.matches || !('IntersectionObserver' in window)) {
      liveItems.forEach(function (item) {
        item.classList.add('is-live');
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-live');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.3 }
    );
    liveItems.forEach(function (item) {
      observer.observe(item);
    });
  }

  function setupPointerFx() {
    if (!finePointer.matches || reduceMotion.matches) return;

    all('.btn').forEach(function (button) {
      button.addEventListener('pointermove', function (event) {
        var rect = button.getBoundingClientRect();
        var dx = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
        var dy = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
        button.style.setProperty('--mx', (Math.max(-1, Math.min(1, dx)) * 4).toFixed(2) + 'px');
        button.style.setProperty('--my', (Math.max(-1, Math.min(1, dy)) * 3).toFixed(2) + 'px');
      });
      button.addEventListener('pointerleave', function () {
        button.style.setProperty('--mx', '0px');
        button.style.setProperty('--my', '0px');
      });
    });

    all('[data-glow]').forEach(function (card) {
      card.addEventListener('pointermove', function (event) {
        var rect = card.getBoundingClientRect();
        card.style.setProperty('--px', ((event.clientX - rect.left) / rect.width) * 100 + '%');
        card.style.setProperty('--py', ((event.clientY - rect.top) / rect.height) * 100 + '%');
      });
    });
  }

  function setupScroll() {
    var progress = one('[data-scroll-progress]');
    var header = one('.site-header');
    var topo = one('.topo');
    var glowA = one('.glow-a');
    var glowB = one('.glow-b');
    var sticky = one('#mobile-cta');
    var pricing = one('#pricing');
    var ticking = false;

    function update() {
      ticking = false;
      var y = window.scrollY || doc.documentElement.scrollTop || 0;
      var max = doc.documentElement.scrollHeight - window.innerHeight;
      if (progress) {
        progress.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
      }
      if (header) header.classList.toggle('is-scrolled', y > 12);
      if (reduceMotion.matches) {
        if (topo) topo.style.transform = '';
        if (glowA) glowA.style.transform = '';
        if (glowB) glowB.style.transform = '';
      } else {
        if (topo) topo.style.transform = 'translate3d(0,' + Math.min(28, y * 0.02).toFixed(1) + 'px,0)';
        if (glowA) glowA.style.transform = 'translate3d(0,' + (-Math.min(40, y * 0.025)).toFixed(1) + 'px,0)';
        if (glowB) glowB.style.transform = 'translate3d(0,' + (-Math.min(24, y * 0.015)).toFixed(1) + 'px,0)';
      }
      if (sticky) {
        var pricingTop = pricing ? pricing.getBoundingClientRect().top : window.innerHeight + 1;
        var show =
          window.innerWidth <= 759 &&
          y > window.innerHeight * 0.72 &&
          pricingTop > window.innerHeight &&
          y + window.innerHeight < doc.documentElement.scrollHeight - 160;
        var wasVisible = sticky.classList.contains('is-visible');
        if (show !== wasVisible) {
          sticky.classList.toggle('is-visible', show);
          if (show) {
            sticky.removeAttribute('inert');
            sticky.setAttribute('aria-hidden', 'false');
          } else {
            sticky.setAttribute('inert', '');
            sticky.setAttribute('aria-hidden', 'true');
          }
        }
      }
    }

    function requestUpdate() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate, { passive: true });
    update();
  }

  function init() {
    elements.strip = one('[data-founding-strip]');
    elements.stripLead = one('[data-founding-strip-lead]');
    elements.stripCount = one('[data-founding-strip-count]');
    elements.stripTail = one('[data-founding-strip-tail]');
    elements.stripBar = one('[data-founding-strip-bar]');
    elements.meter = one('[data-founding-meter]');
    elements.count = one('[data-founding-count]');
    elements.total = one('[data-founding-total]');
    elements.unit = one('[data-founding-unit]');
    elements.state = one('[data-founding-state]');
    elements.bar = one('[data-founding-bar]');
    elements.live = one('[data-founding-live]');
    elements.barFill = one('[data-founding-bar-fill]');
    elements.note = one('[data-founding-note]');
    elements.heading = one('[data-founding-heading]');
    elements.closedNote = one('[data-founding-closed-note]');
    elements.short = one('[data-founding-short]');
    if (!elements.strip || !elements.meter) return;

    foundingCtas.forEach(function (cta) {
      cta.addEventListener('click', function (event) {
        if (root.classList.contains('founding-closed')) event.preventDefault();
      });
    });

    setupLanguage();
    renderFounding(true);
    setupReveal();
    setupLive();
    setupPointerFx();
    setupScroll();

    var motionListener = function () {
      if (reduceMotion.matches) {
        revealItems.forEach(function (item) {
          item.classList.add('is-visible');
        });
        liveItems.forEach(function (item) {
          item.classList.add('is-live');
        });
      }
    };
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', motionListener);
    else if (reduceMotion.addListener) reduceMotion.addListener(motionListener);

    doc.addEventListener('visibilitychange', function () {
      if (!doc.hidden) fetchFounding();
    });
    window.addEventListener('online', fetchFounding);
    fetchFounding();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
