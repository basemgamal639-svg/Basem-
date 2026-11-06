(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var state = { tab: 'appointments', status: '', q: '', upcoming: false, rows: [], statuses: [] };
  var tbody = $('[data-tbody]'), thead = $('[data-thead]'), statsEl = $('[data-stats]');
  var statusSel = $('[data-filter-status]'), qInput = $('[data-filter-q]');
  var upcoming = $('[data-filter-upcoming]'), whenWrap = $('[data-when-wrap]');
  var drawer = $('[data-drawer]'), backdrop = $('[data-drawer-backdrop]'), toastEl = $('[data-toast]');
  var capacity = Number($('#main').dataset.capacity) || 1;
  var lastFocus = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  function fmtDay(ymd) {
    var d = new Date(ymd + 'T00:00:00');
    return isNaN(d) ? ymd : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  function toast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('toast-error', !!isError);
    toastEl.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { toastEl.hidden = true; }, isError ? 6000 : 3000);
  }
  function api(method, url, body) {
    return fetch(url, { method: method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
      .then(function (res) {
        if (res.status === 401) { location.href = '/admin/login'; throw new Error('Signed out'); }
        return res.json().then(function (data) { if (!res.ok) throw new Error(data.error || 'Request failed'); return data; });
      });
  }
  var badge = function (s) { return '<span class="badge badge-' + esc(s.toLowerCase()) + '">' + esc(s === 'Pending' ? 'New request' : s) + '</span>'; };
  var tel = function (p) { return 'tel:' + String(p).replace(/[^\d+]/g, ''); };

  var COLS = {
    appointments: [
      ['Reference', function (r) { return '<span class="ref">' + esc(r.reference) + '</span>'; }],
      ['Customer', function (r) { return '<strong>' + esc(r.name) + '</strong><span class="sub">' + esc(r.phone) + '</span>'; }],
      ['Vehicle', function (r) { return esc(r.vehicle_year + ' ' + r.vehicle_make + ' ' + r.vehicle_model); }],
      ['Service', function (r) { return esc(r.service); }],
      ['Requested slot', function (r) {
        var clash = r.status !== 'Confirmed' && r.status !== 'Cancelled' && r.status !== 'Completed' && r.slot_confirmed >= capacity;
        return esc(fmtDay(r.preferred_date)) + '<span class="sub">' + esc(r.preferred_time) + '</span>' + (clash ? '<span class="clash">Slot already taken</span>' : '');
      }],
      ['Status', function (r) { return badge(r.status); }],
      ['Received', function (r) { return '<span class="sub">' + esc(fmtDate(r.created_at)) + '</span>'; }],
    ],
    inquiries: [
      ['Reference', function (r) { return '<span class="ref">' + esc(r.reference) + '</span>'; }],
      ['From', function (r) { return '<strong>' + esc(r.name) + '</strong><span class="sub">' + esc(r.email) + '</span>'; }],
      ['Message', function (r) { return '<strong>' + esc(r.subject || 'Message') + '</strong><span class="sub clamp">' + esc(r.message) + '</span>'; }],
      ['Status', function (r) { return badge(r.status); }],
      ['Received', function (r) { return '<span class="sub">' + esc(fmtDate(r.created_at)) + '</span>'; }],
    ],
    customers: [
      ['Customer', function (r) { return '<strong>' + esc(r.name) + '</strong><span class="sub"><a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a></span>'; }],
      ['Phone', function (r) { return '<a href="' + tel(r.phone) + '">' + esc(r.phone) + '</a>'; }],
      ['Vehicles', function (r) { return esc(String(r.vehicles || '').split(',').join(', ')); }],
      ['Requests', function (r) { return esc(r.requests) + '<span class="sub">' + esc(r.completed || 0) + ' completed</span>'; }],
      ['Last request', function (r) { return '<span class="sub">' + esc(fmtDate(r.last_request)) + '</span>'; }],
    ],
  };

  function load() {
    var p = new URLSearchParams();
    if (state.status) p.set('status', state.status);
    if (state.q) p.set('q', state.q);
    if (state.upcoming && state.tab === 'appointments') p.set('when', 'upcoming');
    return api('GET', '/admin/api/' + state.tab + '?' + p).then(function (data) {
      state.rows = data.rows;
      if (state.tab === 'customers') { statsEl.innerHTML = ''; render(); return; }
      if (state.statuses.join() !== data.statuses.join()) {
        state.statuses = data.statuses;
        statusSel.innerHTML = '<option value="">All statuses</option>' + data.statuses.map(function (s) { return '<option value="' + s + '">' + (s === 'Pending' ? 'New requests' : s) + '</option>'; }).join('');
      }
      statusSel.value = state.status;
      statsEl.innerHTML = data.statuses.map(function (s) {
        return '<button type="button" class="stat' + (state.status === s ? ' active' : '') + '" data-stat="' + s + '" aria-pressed="' + (state.status === s) + '"><span class="stat-n">' + data.counts[s] + '</span>' + badge(s) + '</button>';
      }).join('');
      var open = state.tab === 'appointments' ? data.counts.Pending : data.counts.New;
      $('[data-count="' + state.tab + '"]').textContent = open || '';
      render();
    }).catch(function (e) { if (e.message !== 'Signed out') toast(e.message, true); });
  }

  function render() {
    var cols = COLS[state.tab];
    thead.innerHTML = '<tr>' + cols.map(function (c) { return '<th scope="col">' + c[0] + '</th>'; }).join('') + '</tr>';
    if (!state.rows.length) {
      tbody.innerHTML = '<tr><td class="empty" colspan="' + cols.length + '">' + (state.status || state.q || state.upcoming ? 'Nothing matches these filters.' : 'Nothing here yet. New submissions from the website appear here.') + '</td></tr>';
      return;
    }
    var clickable = state.tab !== 'customers';
    tbody.innerHTML = state.rows.map(function (r, i) {
      return '<tr' + (clickable ? ' tabindex="0" data-id="' + r.id + '" aria-label="Open ' + esc(r.reference) + '"' : ' data-cust="' + i + '"') + '>' +
        cols.map(function (c) { return '<td data-label="' + c[0] + '"><div>' + c[1](r) + '</div></td>'; }).join('') + '</tr>';
    }).join('');
  }

  var row = function (l, v) { return '<div class="dl-row"><dt>' + l + '</dt><dd>' + v + '</dd></div>'; };

  function slotOptions(date, selected, id) {
    var sel = $('#d-time');
    if (!date) { sel.innerHTML = '<option value="">Choose a date</option>'; return; }
    api('GET', '/admin/api/slots?date=' + encodeURIComponent(date) + '&exclude=' + id).then(function (d) {
      var opts = d.slots.map(function (s) {
        var full = s.confirmed >= d.capacity;
        return '<option value="' + s.time + '"' + (s.time === selected ? ' selected' : '') + '>' + s.time + (full ? ' (fully booked)' : '') + '</option>';
      });
      if (selected && !d.slots.some(function (s) { return s.time === selected; })) opts.unshift('<option value="' + esc(selected) + '" selected>' + esc(selected) + ' (outside schedule)</option>');
      sel.innerHTML = opts.length ? opts.join('') : '<option value="">Closed on this date</option>';
      checkClash();
    }).catch(function (e) { toast(e.message, true); });
  }
  function checkClash() {
    var warn = $('[data-clash]');
    var opt = $('#d-time').selectedOptions[0];
    var full = opt && /fully booked/.test(opt.textContent);
    warn.hidden = !(full && $('#d-status').value === 'Confirmed');
  }

  function openDrawer(id) {
    var r = state.rows.find(function (x) { return x.id === id; });
    if (!r) return;
    lastFocus = document.activeElement;
    var appt = state.tab === 'appointments';
    $('[data-drawer-title]').textContent = r.reference;
    var notified = r.notified_at ? 'Email alert sent ' + esc(fmtDate(r.notified_at)) : r.notify_error ? '<span class="clash">Email alert failed: ' + esc(r.notify_error) + '</span>' : '<span class="sub">No email alert sent</span>';
    var details = appt
      ? row('Customer', esc(r.name)) + row('Phone', '<a href="' + tel(r.phone) + '">' + esc(r.phone) + '</a>') +
        row('Email', '<a href="mailto:' + esc(r.email) + '?subject=' + encodeURIComponent('Your appointment ' + r.reference) + '">' + esc(r.email) + '</a>') +
        row('Vehicle', esc(r.vehicle_year + ' ' + r.vehicle_make + ' ' + r.vehicle_model)) + row('Service', esc(r.service)) +
        row('Customer’s notes', r.message ? '<span class="pre">' + esc(r.message) + '</span>' : '—')
      : row('Name', esc(r.name)) + row('Email', '<a href="mailto:' + esc(r.email) + '?subject=' + encodeURIComponent('Re: ' + (r.subject || 'your message')) + '">' + esc(r.email) + '</a>') +
        row('Phone', r.phone ? '<a href="' + tel(r.phone) + '">' + esc(r.phone) + '</a>' : '—') + row('Topic', esc(r.subject || '—')) +
        row('Message', '<span class="pre">' + esc(r.message) + '</span>');
    details += row('Received', esc(fmtDate(r.created_at))) + row('Updated', esc(fmtDate(r.updated_at))) + row('Alert', notified);

    $('[data-drawer-body]').innerHTML = '<dl class="dl">' + details + '</dl>' +
      '<form class="form drawer-form" data-edit>' +
      (appt ? '<div class="grid-2"><div class="field"><label for="d-date">Date</label><input id="d-date" type="date" name="preferred_date" value="' + esc(r.preferred_date) + '"></div>' +
        '<div class="field"><label for="d-time">Time</label><select id="d-time" name="preferred_time"><option>' + esc(r.preferred_time) + '</option></select></div></div>' : '') +
      '<div class="field"><label for="d-status">Status</label><select id="d-status" name="status">' +
      state.statuses.map(function (s) { return '<option value="' + s + '"' + (s === r.status ? ' selected' : '') + '>' + (s === 'Pending' ? 'New request (pending)' : s) + '</option>'; }).join('') + '</select>' +
      (appt ? '<p class="hint">Set to Confirmed only after you have agreed the time with the customer.</p>' : '') + '</div>' +
      (appt ? '<p class="warn" data-clash hidden>Another confirmed appointment already uses this slot. Choose a different time to confirm.</p>' : '') +
      '<div class="field"><label for="d-notes">Internal notes <span class="opt">Staff only</span></label><textarea id="d-notes" name="admin_notes" rows="4" maxlength="5000">' + esc(r.admin_notes) + '</textarea></div>' +
      '<div class="drawer-actions"><button class="btn btn-primary" type="submit">Save changes</button><button class="btn btn-danger" type="button" data-delete>Delete</button></div>' +
      '<div class="confirm-row" data-confirm-delete hidden><span>Delete this record permanently?</span><button class="btn btn-danger btn-xs" type="button" data-delete-yes>Yes, delete</button><button class="btn btn-ghost btn-xs" type="button" data-delete-no>Keep it</button></div>' +
      '</form>';

    var form = $('[data-edit]');
    if (appt) {
      slotOptions(r.preferred_date, r.preferred_time, r.id);
      $('#d-date').addEventListener('change', function () { slotOptions($('#d-date').value, '', r.id); });
      $('#d-time').addEventListener('change', checkClash);
      $('#d-status').addEventListener('change', checkClash);
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('[type=submit]');
      var body = { status: form.status.value, admin_notes: form.admin_notes.value };
      if (appt) { body.preferred_date = form.preferred_date.value; body.preferred_time = form.preferred_time.value; }
      btn.disabled = true;
      api('PATCH', '/admin/api/' + state.tab + '/' + r.id, body)
        .then(function () { toast('Saved.'); closeDrawer(); return load(); })
        .catch(function (err) { toast(err.message, true); })
        .then(function () { btn.disabled = false; });
    });
    var confirmRow = $('[data-confirm-delete]', form);
    $('[data-delete]', form).addEventListener('click', function () { confirmRow.hidden = false; $('[data-delete-no]', form).focus(); });
    $('[data-delete-no]', form).addEventListener('click', function () { confirmRow.hidden = true; });
    $('[data-delete-yes]', form).addEventListener('click', function () {
      api('DELETE', '/admin/api/' + state.tab + '/' + r.id)
        .then(function () { toast('Deleted.'); closeDrawer(); return load(); })
        .catch(function (err) { toast(err.message, true); });
    });

    backdrop.hidden = false;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    drawer.focus();
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  tbody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-id]');
    if (tr && !e.target.closest('a')) openDrawer(Number(tr.dataset.id));
  });
  tbody.addEventListener('keydown', function (e) {
    var tr = e.target.closest('tr[data-id]');
    if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDrawer(Number(tr.dataset.id)); }
  });
  $('[data-drawer-close]').addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });

  statsEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-stat]');
    if (!b) return;
    state.status = state.status === b.dataset.stat ? '' : b.dataset.stat;
    load();
  });
  statusSel.addEventListener('change', function () { state.status = statusSel.value; load(); });
  upcoming.addEventListener('change', function () { state.upcoming = upcoming.checked; load(); });
  var t;
  qInput.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { state.q = qInput.value.trim(); load(); }, 250); });

  var tabs = document.querySelectorAll('[data-tab]');
  function selectTab(btn) {
    tabs.forEach(function (b) { var on = b === btn; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $('#panel').setAttribute('aria-labelledby', btn.id);
    state.tab = btn.dataset.tab;
    state.status = ''; state.q = ''; qInput.value = ''; state.statuses = [];
    statusSel.hidden = state.tab === 'customers';
    whenWrap.hidden = state.tab !== 'appointments';
    load();
  }
  tabs.forEach(function (btn, i) {
    btn.addEventListener('click', function () { selectTab(btn); });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        next.focus(); selectTab(next);
      }
    });
  });

  api('GET', '/admin/api/inquiries').then(function (d) { $('[data-count="inquiries"]').textContent = d.counts.New || ''; }).catch(function () {});
  load();
  setInterval(function () { if (!drawer.classList.contains('open') && !document.hidden) load(); }, 60000);
})();
