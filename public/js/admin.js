(function () {
  'use strict';
  var state = { tab: 'appointments', status: '', q: '', rows: [], statuses: [] };
  var $ = function (s) { return document.querySelector(s); };
  var tbody = $('[data-tbody]');
  var thead = $('[data-thead]');
  var statsEl = $('[data-stats]');
  var statusSel = $('[data-filter-status]');
  var qInput = $('[data-filter-q]');
  var drawer = $('[data-drawer]');
  var backdrop = $('[data-drawer-backdrop]');
  var toastEl = $('[data-toast]');
  var lastFocus = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
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
    toast.t = setTimeout(function () { toastEl.hidden = true; }, 3200);
  }
  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    }).then(function (res) {
      if (res.status === 401) { location.href = '/admin/login'; throw new Error('Signed out'); }
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
      });
    });
  }
  var badge = function (s) { return '<span class="badge badge-' + esc(s.toLowerCase()) + '">' + esc(s) + '</span>'; };

  var COLS = {
    appointments: [
      ['Ref', function (r) { return '<span class="mono">APT-' + r.id + '</span>'; }],
      ['Customer', function (r) { return '<strong>' + esc(r.name) + '</strong><span class="sub">' + esc(r.phone) + '</span>'; }],
      ['Vehicle', function (r) { return esc(r.vehicle_year + ' ' + r.vehicle_make + ' ' + r.vehicle_model); }],
      ['Service', function (r) { return esc(r.service); }],
      ['Preferred', function (r) { return esc(fmtDay(r.preferred_date)) + '<span class="sub">' + esc(r.preferred_time) + '</span>'; }],
      ['Status', function (r) { return badge(r.status); }],
      ['Received', function (r) { return '<span class="sub">' + esc(fmtDate(r.created_at)) + '</span>'; }],
    ],
    inquiries: [
      ['Ref', function (r) { return '<span class="mono">MSG-' + r.id + '</span>'; }],
      ['From', function (r) { return '<strong>' + esc(r.name) + '</strong><span class="sub">' + esc(r.email) + '</span>'; }],
      ['Subject', function (r) { return '<strong>' + esc(r.subject || '(no subject)') + '</strong><span class="sub clamp">' + esc(r.message) + '</span>'; }],
      ['Status', function (r) { return badge(r.status); }],
      ['Received', function (r) { return '<span class="sub">' + esc(fmtDate(r.created_at)) + '</span>'; }],
    ],
  };

  function load() {
    var params = new URLSearchParams();
    if (state.status) params.set('status', state.status);
    if (state.q) params.set('q', state.q);
    return api('GET', '/admin/api/' + state.tab + '?' + params).then(function (data) {
      state.rows = data.rows;
      if (state.statuses.join() !== data.statuses.join()) {
        state.statuses = data.statuses;
        statusSel.innerHTML = '<option value="">All statuses</option>' + data.statuses.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
        statusSel.value = state.status;
      }
      var total = 0;
      statsEl.innerHTML = data.statuses
        .map(function (s) {
          total += data.counts[s];
          return '<button type="button" class="stat' + (state.status === s ? ' active' : '') + '" data-stat="' + esc(s) + '"><span class="stat-n">' + data.counts[s] + '</span><span class="stat-l">' + badge(s) + '</span></button>';
        })
        .join('');
      var open = state.tab === 'appointments' ? data.counts.Pending : data.counts.New;
      document.querySelector('[data-count="' + state.tab + '"]').textContent = open ? open : '';
      render();
      return total;
    }).catch(function (e) { if (e.message !== 'Signed out') toast(e.message, true); });
  }

  function render() {
    var cols = COLS[state.tab];
    thead.innerHTML = '<tr>' + cols.map(function (c) { return '<th scope="col">' + c[0] + '</th>'; }).join('') + '</tr>';
    if (!state.rows.length) {
      tbody.innerHTML = '<tr><td class="empty" colspan="' + cols.length + '">' + (state.status || state.q ? 'No records match your filters.' : 'Nothing here yet. New submissions from the website will appear here.') + '</td></tr>';
      return;
    }
    tbody.innerHTML = state.rows
      .map(function (r) {
        return '<tr tabindex="0" data-id="' + r.id + '" aria-label="Open record ' + r.id + '">' +
          cols.map(function (c) { return '<td data-label="' + c[0] + '"><div>' + c[1](r) + '</div></td>'; }).join('') + '</tr>';
      })
      .join('');
  }

  function row(label, value) {
    return '<div class="dl-row"><dt>' + label + '</dt><dd>' + value + '</dd></div>';
  }

  function openDrawer(id) {
    var r = state.rows.find(function (x) { return x.id === id; });
    if (!r) return;
    lastFocus = document.activeElement;
    var isAppt = state.tab === 'appointments';
    $('[data-drawer-title]').textContent = (isAppt ? 'Appointment APT-' : 'Message MSG-') + r.id;
    var details = isAppt
      ? row('Customer', esc(r.name)) +
        row('Phone', '<a href="tel:' + esc(r.phone.replace(/[^\d+]/g, '')) + '">' + esc(r.phone) + '</a>') +
        row('Email', '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>') +
        row('Vehicle', esc(r.vehicle_year + ' ' + r.vehicle_make + ' ' + r.vehicle_model)) +
        row('Service', esc(r.service)) +
        row('Preferred date', esc(fmtDay(r.preferred_date))) +
        row('Preferred time', esc(r.preferred_time)) +
        row('Details', r.message ? '<span class="pre">' + esc(r.message) + '</span>' : '<span class="sub">—</span>')
      : row('Name', esc(r.name)) +
        row('Email', '<a href="mailto:' + esc(r.email) + '?subject=' + encodeURIComponent('Re: ' + (r.subject || 'Your message')) + '">' + esc(r.email) + '</a>') +
        row('Phone', r.phone ? '<a href="tel:' + esc(r.phone.replace(/[^\d+]/g, '')) + '">' + esc(r.phone) + '</a>' : '<span class="sub">—</span>') +
        row('Subject', esc(r.subject || '—')) +
        row('Message', '<span class="pre">' + esc(r.message) + '</span>');
    details += row('Received', esc(fmtDate(r.created_at))) + row('Last updated', esc(fmtDate(r.updated_at)));

    $('[data-drawer-body]').innerHTML =
      '<dl class="dl">' + details + '</dl>' +
      '<form class="form drawer-form" data-edit>' +
      '<div class="field"><label for="d-status">Status</label><select id="d-status" name="status">' +
      state.statuses.map(function (s) { return '<option' + (s === r.status ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') +
      '</select>' + (isAppt ? '<p class="hint">Only set “Confirmed” after you have agreed the date and time with the customer.</p>' : '') + '</div>' +
      '<div class="field"><label for="d-notes">Internal notes <span class="opt">(staff only)</span></label><textarea id="d-notes" name="admin_notes" rows="4" maxlength="5000">' + esc(r.admin_notes) + '</textarea></div>' +
      '<div class="drawer-actions"><button class="btn btn-accent" type="submit">Save changes</button>' +
      '<button class="btn btn-ghost btn-danger" type="button" data-delete>Delete</button></div>' +
      '</form>';

    var form = $('[data-edit]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      api('PATCH', '/admin/api/' + state.tab + '/' + r.id, { status: form.status.value, admin_notes: form.admin_notes.value })
        .then(function () { toast('Saved.'); closeDrawer(); return load(); })
        .catch(function (err) { toast(err.message, true); })
        .then(function () { btn.disabled = false; });
    });
    form.querySelector('[data-delete]').addEventListener('click', function () {
      if (!confirm('Delete this record permanently? This cannot be undone.')) return;
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
    statusSel.value = state.status;
    load();
  });
  statusSel.addEventListener('change', function () { state.status = statusSel.value; load(); });
  var t;
  qInput.addEventListener('input', function () {
    clearTimeout(t);
    t = setTimeout(function () { state.q = qInput.value.trim(); load(); }, 250);
  });

  var tabs = document.querySelectorAll('[data-tab]');
  function selectTab(btn) {
    tabs.forEach(function (b) {
      var on = b === btn;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    $('#panel').setAttribute('aria-labelledby', btn.id);
    state.tab = btn.dataset.tab;
    state.status = '';
    state.q = '';
    qInput.value = '';
    state.statuses = [];
    load();
  }
  tabs.forEach(function (btn, i) {
    btn.addEventListener('click', function () { selectTab(btn); });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        next.focus();
        selectTab(next);
      }
    });
  });

  // Load the badge count for the inactive tab too
  api('GET', '/admin/api/inquiries').then(function (d) {
    document.querySelector('[data-count="inquiries"]').textContent = d.counts.New || '';
  }).catch(function () {});
  load();
  // Refresh periodically so new requests show up without reloading
  setInterval(function () { if (!drawer.classList.contains('open') && !document.hidden) load(); }, 60000);
})();
