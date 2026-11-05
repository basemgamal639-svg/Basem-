(function () {
  'use strict';
  var doc = document.documentElement;

  /* ---------- Reveal on scroll ---------- */
  var reveal = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Elements already on screen are shown immediately so nothing flashes.
    reveal.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) el.classList.add('in');
    });
    doc.classList.add('js');
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    reveal.forEach(function (el) {
      if (!el.classList.contains('in')) io.observe(el);
    });
  }

  /* ---------- Header ---------- */
  var header = document.querySelector('[data-header]');
  var onScroll = function () {
    if (header) header.classList.toggle('scrolled', scrollY > 10);
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile navigation ---------- */
  var toggle = document.querySelector('[data-nav-toggle]');
  var panel = document.querySelector('[data-mobile-nav]');
  function setNav(open) {
    if (!toggle || !panel) return;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.sr-only').textContent = open ? 'Close menu' : 'Open menu';
    panel.hidden = !open;
    document.body.classList.toggle('nav-open', open);
    if (open) {
      var first = panel.querySelector('a');
      if (first) first.focus();
    }
  }
  if (toggle && panel) {
    toggle.addEventListener('click', function () {
      setNav(toggle.getAttribute('aria-expanded') !== 'true');
    });
    panel.addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) {
        setNav(false);
        toggle.focus();
      }
      // Keep keyboard focus inside the open menu
      if (e.key === 'Tab' && !panel.hidden) {
        var items = [toggle].concat([].slice.call(panel.querySelectorAll('a, button')));
        var idx = items.indexOf(document.activeElement);
        if (e.shiftKey && idx <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
        else if (!e.shiftKey && idx === items.length - 1) { e.preventDefault(); items[0].focus(); }
      }
    });
    matchMedia('(min-width: 1025px)').addEventListener('change', function (m) {
      if (m.matches) setNav(false);
    });
  }

  /* ---------- Active nav link ---------- */
  var navLinks = document.querySelectorAll('.main-nav a[href^="/#"]');
  if (location.pathname === '/' && navLinks.length && 'IntersectionObserver' in window) {
    var map = {};
    navLinks.forEach(function (a) { map[a.getAttribute('href').slice(2)] = a; });
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          navLinks.forEach(function (a) { a.removeAttribute('aria-current'); });
          var link = map[e.target.id];
          if (link) link.setAttribute('aria-current', 'true');
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    Object.keys(map).forEach(function (id) {
      var el = id === 'top' ? document.querySelector('.hero') : document.getElementById(id);
      if (el) { if (id === 'top') el.id = el.id || 'hero'; map[el.id] = map[id]; spy.observe(el); }
    });
  }

  /* ---------- Service pre-selection ---------- */
  var serviceSelect = document.getElementById('a-service');
  function selectService(slugOrName) {
    if (!serviceSelect || !slugOrName) return;
    for (var i = 0; i < serviceSelect.options.length; i++) {
      var o = serviceSelect.options[i];
      if (o.dataset.slug === slugOrName || o.value === slugOrName) {
        serviceSelect.selectedIndex = i;
        clearFieldError(serviceSelect);
        return;
      }
    }
  }
  if (serviceSelect) {
    var qs = new URLSearchParams(location.search).get('service');
    if (qs) selectService(qs);
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-book-service]');
      if (!a) return;
      e.preventDefault();
      selectService(a.getAttribute('data-book-service'));
      var book = document.getElementById('book');
      book.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      history.replaceState(null, '', a.getAttribute('href'));
      setTimeout(function () { document.getElementById('a-name').focus({ preventScroll: true }); }, 500);
    });
  }

  /* ---------- Forms ---------- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var PHONE_RE = /^[+()\-.\s\d]{7,20}$/;

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function today() {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  document.querySelectorAll('[data-min-today]').forEach(function (el) { el.min = today(); });

  function setFieldError(input, msg) {
    var field = input.closest('.field');
    var err = document.getElementById(input.id + '-err');
    if (field) field.classList.toggle('invalid', !!msg);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (err) err.textContent = msg || '';
  }
  function clearFieldError(input) { setFieldError(input, ''); }

  function validate(form) {
    var errors = {};
    var v = function (n) { var el = form.elements[n]; return el ? el.value.trim() : ''; };
    var type = form.dataset.form;
    if (v('name').length < 2) errors.name = 'Please enter your ' + (type === 'appointment' ? 'full name.' : 'name.');
    if (!EMAIL_RE.test(v('email'))) errors.email = v('email') ? 'Please enter a valid email address (e.g. name@example.com).' : 'Please enter your email address.';
    var phone = v('phone');
    var phoneBad = !PHONE_RE.test(phone) || phone.replace(/\D/g, '').length < 7;
    if (type === 'appointment') {
      if (phoneBad) errors.phone = phone ? 'Please enter a valid phone number.' : 'Please enter your phone number.';
      if (!v('vehicle_make')) errors.vehicle_make = 'Please enter the vehicle make.';
      if (!v('vehicle_model')) errors.vehicle_model = 'Please enter the vehicle model.';
      var y = Number(v('vehicle_year')), max = new Date().getFullYear() + 1;
      if (!/^\d{4}$/.test(v('vehicle_year')) || y < 1950 || y > max) errors.vehicle_year = 'Enter a year between 1950 and ' + max + '.';
      if (!v('service')) errors.service = 'Please choose a service.';
      if (!v('preferred_date')) errors.preferred_date = 'Please choose a preferred date.';
      else if (v('preferred_date') < today()) errors.preferred_date = 'Please choose a date in the future.';
      if (!v('preferred_time')) errors.preferred_time = 'Please choose a preferred time.';
    } else {
      if (phone && phoneBad) errors.phone = 'Please enter a valid phone number or leave it blank.';
      if (v('message').length < 10) errors.message = 'Please enter a message (at least 10 characters).';
    }
    return errors;
  }

  function showErrors(form, errors) {
    var first = null;
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.name === 'website') return;
      setFieldError(el, errors[el.name]);
      if (errors[el.name] && !first) first = el;
    });
    if (first) first.focus();
    return !first;
  }

  document.querySelectorAll('form[data-form]').forEach(function (form) {
    var card = form.parentElement;
    var success = card.querySelector('[data-form-success]');
    var formError = form.querySelector('[data-form-error]');
    var btn = form.querySelector('[data-submit]');
    var submissionId = uid();
    var busy = false;

    form.addEventListener('input', function (e) {
      if (e.target.getAttribute('aria-invalid') === 'true') {
        var errs = validate(form);
        setFieldError(e.target, errs[e.target.name]);
      }
    });
    form.addEventListener('change', function (e) {
      if (e.target.tagName === 'SELECT' && e.target.value) clearFieldError(e.target);
    });

    function setBusy(state) {
      busy = state;
      btn.disabled = state;
      btn.classList.toggle('is-loading', state);
      form.setAttribute('aria-busy', String(state));
      btn.querySelector('.btn-label').textContent = state ? 'Sending…' : btn.dataset.label;
    }
    btn.dataset.label = btn.querySelector('.btn-label').textContent;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return; // prevents duplicate submissions while processing
      formError.hidden = true;
      if (!showErrors(form, validate(form))) return;

      var payload = { submission_id: submissionId };
      new FormData(form).forEach(function (val, key) { payload[key] = typeof val === 'string' ? val.trim() : val; });

      setBusy(true);
      fetch(form.getAttribute('action'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; });
        })
        .then(function (r) {
          if (r.res.ok && r.data.ok) {
            success.querySelector('[data-ref]').textContent = r.data.reference ? '(ref. ' + r.data.reference + ')' : '';
            form.hidden = true;
            success.hidden = false;
            success.focus();
            return;
          }
          if (r.res.status === 422 && r.data.fields) showErrors(form, r.data.fields);
          formError.textContent = r.data.error || 'Something went wrong. Please try again.';
          formError.hidden = false;
        })
        .catch(function () {
          formError.textContent = 'We couldn’t reach the server. Please check your connection and try again.';
          formError.hidden = false;
        })
        .then(function () { setBusy(false); });
    });

    var resetBtn = success && success.querySelector('[data-form-reset]');
    if (resetBtn)
      resetBtn.addEventListener('click', function () {
        form.reset();
        submissionId = uid();
        Array.prototype.forEach.call(form.elements, function (el) { if (el.name) clearFieldError(el); });
        success.hidden = true;
        form.hidden = false;
        var first = form.querySelector('input:not([tabindex="-1"])');
        if (first) first.focus();
      });
  });
})();
