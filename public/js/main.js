(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var PHONE_RE = /^[+()\-.\s\d]{7,20}$/;
  var phoneOk = function (p) { return PHONE_RE.test(p) && p.replace(/\D/g, '').length >= 7; };

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function scrollToEl(el) {
    var head = document.querySelector('[data-header]');
    var top = el.getBoundingClientRect().top + scrollY - (head ? head.offsetHeight : 0) - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  // Lets the optional motion layer (public/js/motion.js) animate key moments. Behaviour never depends on it.
  function emit(name, detail) {
    try { document.dispatchEvent(new CustomEvent('site:' + name, { detail: detail })); } catch (err) { /* very old browser */ }
  }
  function setErr(el, msg) {
    if (!el) return;
    var field = el.closest('.field');
    var out = document.getElementById(el.id + '-err');
    if (field) field.classList.toggle('invalid', !!msg);
    if (el.setAttribute) el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (out) out.textContent = msg || '';
  }
  function postJSON(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { status: res.status, ok: res.ok, data: data }; }); });
  }

  /* ---------- Header ---------- */
  var header = $('[data-header]');
  var onScroll = function () { if (header) header.classList.toggle('scrolled', scrollY > 8); };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile navigation ---------- */
  var toggle = $('[data-nav-toggle]');
  var panel = $('[data-mobile-nav]');
  function setNav(open) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.sr-only').textContent = open ? 'Close menu' : 'Open menu';
    panel.hidden = !open;
    document.body.classList.toggle('nav-open', open);
    if (open) { var f = panel.querySelector('a'); if (f) f.focus(); }
  }
  if (toggle && panel) {
    toggle.addEventListener('click', function () { setNav(toggle.getAttribute('aria-expanded') !== 'true'); });
    panel.addEventListener('click', function (e) { if (e.target.closest('a')) setNav(false); });
    document.addEventListener('keydown', function (e) {
      if (panel.hidden) return;
      if (e.key === 'Escape') { setNav(false); toggle.focus(); }
      if (e.key === 'Tab') {
        var items = [toggle].concat($$('a, button', panel));
        var i = items.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
        else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
      }
    });
    matchMedia('(min-width: 1025px)').addEventListener('change', function (m) { if (m.matches) setNav(false); });
  }

  /* ---------- Active section in nav ---------- */
  var navLinks = $$('.main-nav a[href^="/#"]');
  if (location.pathname === '/' && navLinks.length && 'IntersectionObserver' in window) {
    var byId = {};
    navLinks.forEach(function (a) { byId[a.getAttribute('href').slice(2)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        navLinks.forEach(function (a) { a.removeAttribute('aria-current'); });
        if (byId[e.target.id]) byId[e.target.id].setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(byId).forEach(function (id) { var el = document.getElementById(id); if (el) spy.observe(el); });
  }

  /* ---------- Services index: the image panel follows the hovered/focused row ---------- */
  var rows = $$('.svc-row');
  function activate(slug) {
    rows.forEach(function (r) { r.classList.toggle('is-active', r.dataset.svc === slug); });
    $$('.stage-item').forEach(function (s) { s.classList.toggle('is-active', s.dataset.stage === slug); });
  }
  rows.forEach(function (r) {
    r.addEventListener('mouseenter', function () { activate(r.dataset.svc); });
    r.addEventListener('focusin', function () { activate(r.dataset.svc); });
  });
  if (rows.length) activate(rows[0].dataset.svc);

  /* ---------- Contact topic shortcuts ("Get a Repair Estimate") ---------- */
  var topicSelect = $('#c-topic');
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-topic]');
    if (!a || !topicSelect) return;
    e.preventDefault();
    topicSelect.value = a.dataset.topic;
    scrollToEl(document.getElementById('contact'));
    history.replaceState(null, '', '#contact');
    setTimeout(function () { $('#c-name').focus({ preventScroll: true }); }, reduceMotion ? 0 : 450);
  });

  /* ---------- Booking wizard ---------- */
  var form = $('[data-booking]');
  if (form) initBooking(form);

  function initBooking(form) {
    var vehicles = JSON.parse(form.dataset.vehicles || '{}');
    var steps = $$('[data-step]', form);
    var tabs = $$('[data-tab]', form);
    var make = $('#b-make'), makeOther = $('#b-make-other');
    var model = $('#b-model'), modelOther = $('#b-model-other');
    var year = $('#b-year'), service = $('#b-service'), date = $('#b-date');
    var slotsBox = $('[data-slots]', form), slotErr = $('#b-time-err');
    var summary = $('[data-summary]', form);
    var formError = $('[data-form-error]', form);
    var submitBtn = $('[data-submit]', form);
    var confirmation = $('[data-confirmation]');
    var submissionId = uid();
    var current = 1;
    var busy = false;
    var slotReq = 0;

    function show(n, focus) {
      var dir = n >= current ? 1 : -1;
      var changed = n !== current;
      current = n;
      steps.forEach(function (s) { s.hidden = Number(s.dataset.step) !== n; });
      tabs.forEach(function (t) {
        var i = Number(t.dataset.tab);
        if (i === n) t.setAttribute('aria-current', 'step'); else t.removeAttribute('aria-current');
        t.classList.toggle('done', i < n);
      });
      if (changed) emit('step', { el: steps[n - 1], dir: dir });
      if (focus) {
        var target = $('input:not([type=hidden]):not([tabindex="-1"]), select', steps[n - 1]);
        var top = form.getBoundingClientRect().top;
        if (top < 90 || top > innerHeight * 0.6) scrollToEl(form);
        if (target) setTimeout(function () { target.focus({ preventScroll: true }); }, 50);
      }
    }
    show(1);

    function fill(select, list, placeholder) {
      select.innerHTML = '<option value="">' + placeholder + '</option>' +
        list.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') +
        '<option value="__other">Other model</option>';
    }
    function otherField(name, on) {
      var f = $('[data-other="' + name + '"]', form);
      f.hidden = !on;
      if (!on) { f.querySelector('input').value = ''; setErr(f.querySelector('input'), ''); }
    }
    make.addEventListener('change', function () {
      setErr(make, '');
      var v = make.value;
      otherField('make', v === '__other');
      otherField('model', v === '__other');
      model.closest('.field').hidden = v === '__other';
      if (v && v !== '__other') { fill(model, vehicles[v] || [], 'Select model'); model.disabled = false; }
      else { model.innerHTML = '<option value="">Select make first</option>'; model.disabled = true; }
      if (v === '__other') makeOther.focus();
    });
    model.addEventListener('change', function () {
      setErr(model, '');
      otherField('model', model.value === '__other');
      if (model.value === '__other') modelOther.focus();
    });

    function values() {
      var v = function (el) { return el.value.trim(); };
      var checked = $('input[name="preferred_time"]:checked', form);
      return {
        vehicle_make: make.value === '__other' ? v(makeOther) : v(make),
        vehicle_model: make.value === '__other' || model.value === '__other' ? v(modelOther) : v(model),
        vehicle_year: v(year),
        service: v(service),
        preferred_date: v(date),
        preferred_time: checked ? checked.value : '',
        name: v($('#b-name')), phone: v($('#b-phone')), email: v($('#b-email')), message: v($('#b-message')),
        website: v($('#b-website')),
      };
    }

    function validate(step) {
      var d = values();
      var errs = [];
      var e = function (el, msg) { setErr(el, msg); if (msg) errs.push(el); };
      if (step === 1) {
        if (make.value === '__other') { e(make, ''); e(makeOther, d.vehicle_make ? '' : 'Enter the vehicle make.'); }
        else e(make, d.vehicle_make ? '' : 'Select the vehicle make.');
        var modelEl = make.value === '__other' || model.value === '__other' ? modelOther : model;
        if (modelEl === modelOther && model.value === '__other') e(model, '');
        e(modelEl, d.vehicle_model ? '' : (modelEl === model ? 'Select the model.' : 'Enter the model.'));
        var y = Number(d.vehicle_year), max = new Date().getFullYear() + 1;
        e(year, /^\d{4}$/.test(d.vehicle_year) && y >= 1950 && y <= max ? '' : 'Enter a year between 1950 and ' + max + '.');
      }
      if (step === 2) {
        e(service, d.service ? '' : 'Select a service.');
        e(date, d.preferred_date ? '' : 'Choose a date.');
        var msg = d.preferred_time ? '' : 'Choose an available time.';
        slotErr.textContent = msg;
        slotsBox.closest('.field').classList.toggle('invalid', !!msg);
        if (msg) errs.push(slotsBox.querySelector('input:not(:disabled)') || date);
      }
      if (step === 3) {
        e($('#b-name'), d.name.length >= 2 ? '' : 'Enter your full name.');
        e($('#b-phone'), phoneOk(d.phone) ? '' : d.phone ? 'Enter a valid phone number.' : 'Enter your phone number.');
        e($('#b-email'), EMAIL_RE.test(d.email) ? '' : d.email ? 'Enter a valid email address, like name@example.com.' : 'Enter your email address.');
      }
      if (errs[0]) errs[0].focus();
      return !errs.length;
    }

    function fmtDate(ymd) {
      var p = ymd.split('-');
      var d = new Date(+p[0], p[1] - 1, +p[2]);
      return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    function summaryRows(d) {
      return [
        ['Vehicle', d.vehicle_year + ' ' + d.vehicle_make + ' ' + d.vehicle_model],
        ['Service', d.service],
        ['Requested', fmtDate(d.preferred_date) + ', ' + d.preferred_time],
      ].map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('');
    }

    $$('[data-next]', form).forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!validate(current)) return;
        if (current === 2) summary.innerHTML = '<dl>' + summaryRows(values()) + '</dl>';
        show(current + 1, true);
      });
    });
    $$('[data-back]', form).forEach(function (btn) {
      btn.addEventListener('click', function () { show(current - 1, true); });
    });
    tabs.forEach(function (t) {
      t.addEventListener('click', function () { var n = Number(t.dataset.tab); if (n < current) show(n, true); });
    });

    // Available time slots for the chosen date
    function slotMsg(text, retry) {
      slotsBox.innerHTML = '<p class="slots-msg">' + text + (retry ? ' <button type="button" class="link" data-retry>Try again</button>' : '') + '</p>';
    }
    function loadSlots() {
      slotErr.textContent = '';
      slotsBox.closest('.field').classList.remove('invalid');
      if (!date.value) return slotMsg('Choose a date to see available times.');
      var req = ++slotReq;
      slotMsg('Checking availability…');
      slotsBox.setAttribute('aria-busy', 'true');
      fetch('/api/availability?date=' + encodeURIComponent(date.value), { headers: { Accept: 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
        .then(function (a) {
          if (req !== slotReq) return;
          if (!a.open) return slotMsg('We don’t take bookings on this date. Please choose another day.');
          var any = a.slots.some(function (s) { return s.available; });
          if (!any) return slotMsg('No times are available on this date. Please choose another day.');
          slotsBox.innerHTML = a.slots.map(function (s, i) {
            return '<label class="slot"><input type="radio" name="preferred_time" value="' + s.time + '"' + (s.available ? '' : ' disabled') +
              ' aria-label="' + s.time + (s.available ? '' : ', unavailable') + '"><span>' + s.time + '</span></label>';
          }).join('');
          emit('slots', { el: slotsBox });
        })
        .catch(function () { if (req === slotReq) slotMsg('We couldn’t load the available times.', true); })
        .then(function () { slotsBox.removeAttribute('aria-busy'); });
    }
    date.addEventListener('change', function () { setErr(date, ''); loadSlots(); });
    slotsBox.addEventListener('click', function (e) { if (e.target.closest('[data-retry]')) loadSlots(); });
    slotsBox.addEventListener('change', function () { slotErr.textContent = ''; slotsBox.closest('.field').classList.remove('invalid'); });
    [year, service, $('#b-name'), $('#b-phone'), $('#b-email'), makeOther, modelOther].forEach(function (el) {
      el.addEventListener('input', function () { if (el.getAttribute('aria-invalid') === 'true') setErr(el, ''); });
      el.addEventListener('change', function () { if (el.value) setErr(el, ''); });
    });

    var FIELD_STEP = { vehicle_make: [1, make], vehicle_model: [1, model], vehicle_year: [1, year], service: [2, service], preferred_date: [2, date], preferred_time: [2, null], name: [3, $('#b-name')], phone: [3, $('#b-phone')], email: [3, $('#b-email')] };

    function setBusy(state) {
      busy = state;
      submitBtn.disabled = state;
      submitBtn.classList.toggle('is-loading', state);
      form.setAttribute('aria-busy', String(state));
      submitBtn.querySelector('.btn-label').textContent = state ? 'Sending…' : 'Request Appointment';
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return; // stops double submissions
      formError.hidden = true;
      for (var s = 1; s <= 3; s++) { if (!validate(s)) { if (s !== current) { show(s); validate(s); } return; } }
      var d = values();
      d.submission_id = submissionId;
      setBusy(true);
      postJSON(form.getAttribute('action'), d)
        .then(function (r) {
          if (r.ok && r.data.ok) {
            $('[data-ref]', confirmation).textContent = r.data.reference;
            $('[data-confirm-summary]', confirmation).innerHTML = summaryRows(d);
            form.hidden = true;
            confirmation.hidden = false;
            emit('reveal', { el: confirmation });
            scrollToEl(confirmation.parentElement);
            confirmation.focus({ preventScroll: true });
            return;
          }
          var fields = r.data.fields || {};
          var first = Object.keys(fields).map(function (k) { return FIELD_STEP[k]; }).filter(Boolean).sort(function (a, b) { return a[0] - b[0]; })[0];
          if (first && first[0] !== 3) show(first[0], true);
          Object.keys(fields).forEach(function (k) {
            var m = FIELD_STEP[k];
            if (m && m[1]) setErr(m[1], fields[k]);
          });
          if (fields.preferred_time) { loadSlots(); setTimeout(function () { slotErr.textContent = fields.preferred_time; }, 0); }
          if (!first || first[0] === 3) {
            formError.textContent = r.data.error || 'Something went wrong. Please try again.';
            formError.hidden = false;
          }
        })
        .catch(function () {
          formError.textContent = 'We couldn’t reach the server. Check your connection and try again.';
          formError.hidden = false;
        })
        .then(function () { setBusy(false); });
    });

    $('[data-booking-reset]').addEventListener('click', function () {
      form.reset();
      make.dispatchEvent(new Event('change'));
      slotMsg('Choose a date to see available times.');
      summary.innerHTML = '';
      submissionId = uid();
      confirmation.hidden = true;
      form.hidden = false;
      show(1, true);
    });

    // Service pre-selection from "Book" links and ?service=slug
    function preselect(nameOrSlug) {
      $$('option', service).forEach(function (o) {
        if (o.value === nameOrSlug || o.dataset.slug === nameOrSlug) service.value = o.value;
      });
    }
    var qs = new URLSearchParams(location.search).get('service');
    if (qs) preselect(qs);
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-book-service]');
      if (!a) return;
      e.preventDefault();
      preselect(a.dataset.bookService);
      history.replaceState(null, '', a.getAttribute('href'));
      if (!form.hidden) show(1);
      scrollToEl(document.getElementById('book'));
      setTimeout(function () { make.focus({ preventScroll: true }); }, reduceMotion ? 0 : 450);
    });
  }

  /* ---------- Contact form ---------- */
  var cform = $('form[data-form="contact"]');
  if (cform) {
    var success = cform.parentElement.querySelector('[data-form-success]');
    var cErr = $('[data-form-error]', cform);
    var cBtn = $('[data-submit]', cform);
    var cId = uid();
    var cBusy = false;
    var cv = function (n) { return cform.elements[n].value.trim(); };
    function cValidate() {
      var errs = [];
      var e = function (id, msg) { var el = $('#' + id); setErr(el, msg); if (msg) errs.push(el); };
      e('c-name', cv('name').length >= 2 ? '' : 'Enter your name.');
      e('c-email', EMAIL_RE.test(cv('email')) ? '' : cv('email') ? 'Enter a valid email address, like name@example.com.' : 'Enter your email address.');
      e('c-phone', !cv('phone') || phoneOk(cv('phone')) ? '' : 'Enter a valid phone number, or leave it blank.');
      e('c-message', cv('message').length >= 10 ? '' : 'Write a message of at least 10 characters.');
      if (errs[0]) errs[0].focus();
      return !errs.length;
    }
    cform.addEventListener('input', function (e) { if (e.target.getAttribute('aria-invalid') === 'true') setErr(e.target, ''); });
    cform.addEventListener('submit', function (e) {
      e.preventDefault();
      if (cBusy || !cValidate()) return;
      cErr.hidden = true;
      cBusy = true;
      cBtn.disabled = true;
      cBtn.classList.add('is-loading');
      cBtn.querySelector('.btn-label').textContent = 'Sending…';
      postJSON(cform.getAttribute('action'), { submission_id: cId, subject: cv('subject'), name: cv('name'), email: cv('email'), phone: cv('phone'), message: cv('message'), website: cv('website') })
        .then(function (r) {
          if (r.ok && r.data.ok) {
            $('[data-ref]', success).textContent = '(' + r.data.reference + ')';
            cform.hidden = true;
            success.hidden = false;
            emit('reveal', { el: success });
            success.focus();
            return;
          }
          var f = r.data.fields || {};
          var map = { name: 'c-name', email: 'c-email', phone: 'c-phone', message: 'c-message', subject: 'c-topic' };
          Object.keys(f).forEach(function (k) { if (map[k]) setErr($('#' + map[k]), f[k]); });
          cErr.textContent = r.data.error || 'Something went wrong. Please try again.';
          cErr.hidden = false;
        })
        .catch(function () { cErr.textContent = 'We couldn’t reach the server. Check your connection and try again.'; cErr.hidden = false; })
        .then(function () { cBusy = false; cBtn.disabled = false; cBtn.classList.remove('is-loading'); cBtn.querySelector('.btn-label').textContent = 'Send Message'; });
    });
    $('[data-form-reset]', success).addEventListener('click', function () {
      cform.reset();
      cId = uid();
      success.hidden = true;
      cform.hidden = false;
      $('#c-name').focus();
    });
  }

  /* ---------- Gallery lightbox ---------- */
  var dlg = $('[data-lightbox-dialog]');
  var gdata = $('[data-gallery]');
  if (dlg && gdata && dlg.showModal) {
    var items = JSON.parse(gdata.textContent);
    var idx = 0, opener = null;
    var img = $('[data-lb-img]', dlg), cap = $('[data-lb-cap]', dlg), count = $('[data-lb-count]', dlg);
    var render = function () {
      var it = items[idx];
      img.src = it.src; img.alt = it.alt; cap.textContent = it.caption || it.alt;
      count.textContent = (idx + 1) + ' / ' + items.length;
    };
    var go = function (d) { idx = (idx + d + items.length) % items.length; render(); emit('lightbox', { el: img, dir: d }); };
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-lightbox]');
      if (!b) return;
      opener = b; idx = Number(b.dataset.lightbox); render(); dlg.showModal(); emit('lightbox', { el: img, dir: 0 });
    });
    $('[data-lb-close]', dlg).addEventListener('click', function () { dlg.close(); });
    $('[data-lb-prev]', dlg).addEventListener('click', function () { go(-1); });
    $('[data-lb-next]', dlg).addEventListener('click', function () { go(1); });
    dlg.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () { if (opener) opener.focus(); });
  }
})();
