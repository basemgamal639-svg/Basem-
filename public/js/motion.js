/* Motion layer — progressive enhancement built on Motion (motion.dev, the successor to Framer Motion).
 *
 * Principles: animate only transform and opacity; slow-in/slow-out easing for choreographed reveals,
 * springs for interactive moments; children follow through with a short stagger; nothing is hidden
 * unless this script is running, and nothing runs for visitors who prefer reduced motion.
 */
(function () {
  var M = window.Motion;
  if (!M || !M.animate || !document.documentElement.animate) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var animate = M.animate, inView = M.inView, stagger = M.stagger, spring = M.spring;
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var EASE = [0.22, 0.61, 0.36, 1]; // matches --ease in the stylesheet
  var T = { fast: 0.18, normal: 0.35, slow: 0.7 };
  var SPRING = { type: spring, visualDuration: 0.45, bounce: 0.18 };
  var SETTLE = { type: spring, visualDuration: 0.5, bounce: 0 };

  var rise = function (distance) { return { opacity: [0, 1], transform: ['translateY(' + distance + 'px)', 'translateY(0)'] }; };

  /* ---------- Scroll reveals (the whileInView pattern) ----------
   * Each group is one parent; its children follow each other with a small stagger.
   * Only elements that start below the fold are hidden, so nothing visible on load ever flickers. */
  var groups = [
    ['.section-head', ':scope > *'],
    ['.svc-list', '.svc-row'],
    ['.about-copy', ':scope > *'],
    ['.pillars', 'li'],
    ['.why-head', ':scope > *'],
    ['.why-grid', 'li'],
    ['.booking-intro', ':scope > *'],
    ['.gallery', '.g-item'],
    ['.reviews', '.review'],
    ['.faq-head', ':scope > *'],
    ['.faq-list', '.faq-item'],
    ['.contact-info', ':scope > *'],
    ['.svc-cols', ':scope > div'],
    ['.other-svcs', 'li'],
  ];
  var fold = innerHeight * 0.92;

  groups.forEach(function (g) {
    $$(g[0]).forEach(function (parent) {
      if (parent.getBoundingClientRect().top < fold) return;
      var kids = $$(g[1], parent);
      if (!kids.length) return;
      kids.forEach(function (k) { k.style.opacity = '0'; });
      inView(parent, function () {
        animate(kids, rise(22), { duration: T.slow, ease: EASE, delay: stagger(0.06) });
      }, { amount: 0.12 });
    });
  });

  // Larger single panels: settle in with a spring instead of a stagger.
  ['.svc-stage', '.booking-panel', '.contact-form-wrap', '.about-media', '.svc-page-media'].forEach(function (sel) {
    $$(sel).forEach(function (el) {
      if (el.getBoundingClientRect().top < fold) return;
      el.style.opacity = '0';
      inView(el, function () {
        animate(el, { opacity: [0, 1], transform: ['translateY(32px) scale(0.985)', 'translateY(0) scale(1)'] }, SETTLE);
      }, { amount: 0.15 });
    });
  });

  /* ---------- Hero: staging ----------
   * The headline already rises in with CSS (works without JS); the photo settles slowly behind it. */
  var heroImg = document.querySelector('.hero-photo .hero-img');
  if (heroImg) animate(heroImg, { transform: ['scale(1.06)', 'scale(1)'] }, { duration: 1.8, ease: EASE });

  /* ---------- Services: the image panel follows the hovered row ---------- */
  var activeStage = null;
  new MutationObserver(function () {
    var el = document.querySelector('.stage-item.is-active img');
    if (!el || el === activeStage) return;
    activeStage = el;
    animate(el, { transform: ['scale(1.04)', 'scale(1)'] }, { duration: 0.9, ease: EASE });
  }).observe(document.querySelector('.svc-stage') || document.createElement('div'), { subtree: true, attributes: true, attributeFilter: ['class'] });

  /* ---------- Booking: step changes, time slots, confirmation ---------- */
  document.addEventListener('site:step', function (e) {
    var d = e.detail;
    animate(d.el, { opacity: [0, 1], transform: ['translateX(' + 20 * d.dir + 'px)', 'translateX(0)'] }, SPRING);
  });

  document.addEventListener('site:slots', function (e) {
    animate($$('.slot', e.detail.el), rise(8), { duration: T.normal, ease: EASE, delay: stagger(0.025) });
  });

  // Confirmation screens: the card settles, then its contents follow through; the status pill pops slightly.
  document.addEventListener('site:reveal', function (e) {
    var el = e.detail.el;
    animate(el, { opacity: [0, 1], transform: ['translateY(16px)', 'translateY(0)'] }, SETTLE);
    animate($$(':scope > *', el), rise(12), { duration: 0.55, ease: EASE, delay: stagger(0.07, { startDelay: 0.12 }) });
    var pill = el.querySelector('.status-pill');
    if (pill) animate(pill, { transform: ['scale(0.9)', 'scale(1)'] }, { type: spring, visualDuration: 0.4, bounce: 0.45, delay: 0.15 });
  });

  /* ---------- Lightbox ---------- */
  document.addEventListener('site:lightbox', function (e) {
    var d = e.detail;
    var from = d.dir === 0 ? 'scale(0.97)' : 'translateX(' + 28 * d.dir + 'px)';
    var to = d.dir === 0 ? 'scale(1)' : 'translateX(0)';
    animate(d.el, { opacity: [0, 1], transform: [from, to] }, d.dir === 0 ? SETTLE : { duration: T.normal, ease: EASE });
  });
})();
