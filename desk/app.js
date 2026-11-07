(function () {
  const state = {
    token: null,
    tab: 'home',
    range: 'LIVE',
    lastOk: Date.now(),
    offline: false,
  };

  function onPages() {
    return /(^|\.)github\.io$/i.test(location.hostname || "");
  }

  function bootToken() {
    if (onPages()) {
      state.token = null;
      try { localStorage.removeItem("desk_app_token"); } catch (e) {}
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    const hash = location.hash || '';
    const m = hash.match(/[#&]t=([^&]+)/);
    if (m) {
      state.token = decodeURIComponent(m[1]);
      try { localStorage.setItem('desk_app_token', state.token); } catch (e) {}
      history.replaceState(null, '', location.pathname + location.search);
    } else {
      try { state.token = localStorage.getItem('desk_app_token'); } catch (e) {}
    }
  }

  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {}, {
      'X-App-Token': state.token || '',
      'Accept': 'application/json',
    });
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    if (res.status === 401) throw new Error('unauthorized');
    if (!res.ok) throw new Error('http ' + res.status);
    state.lastOk = Date.now();
    setOffline(false);
    return res.json();
  }

  function setOffline(on, n) {
    state.offline = on;
    const el = document.getElementById('offline');
    if (!on) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const t = new Date(state.lastOk).toLocaleTimeString();
    el.textContent = `Desk offline · retrying in ${n || 3}s · last update ${t}`;
  }

  function showTab(name) {
    state.tab = name;
    document.querySelectorAll('main > .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.overlay').forEach(t => t.classList.add('hidden'));
    const el = document.getElementById('tab-' + name);
    if (el) el.classList.add('active');
    document.querySelectorAll('.tabbar button').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === name);
    });
  }

  async function refreshHome() {
    const s = await api('/api/state');
    document.getElementById('balance').textContent = '$' + Number(s.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('todayPct').textContent = (s.todayPct >= 0 ? '+' : '') + s.todayPct.toFixed(2) + '%';
    document.getElementById('mult').textContent = s.multiplier.toFixed(2) + '×';
    document.getElementById('paperBadge').classList.toggle('hidden', s.mode !== 'PAPER');
    const car = document.getElementById('agentCarousel');
    car.innerHTML = '';
    (s.agents || []).forEach(a => {
      const d = document.createElement('div');
      d.className = 'agent-card';
      d.innerHTML = `<h3 style="color:${a.color}">${a.title}</h3>
        <div class="meta">${a.status}${a.paused ? ' · paused' : ''}</div>
        <div style="font-size:28px;font-weight:700">${a.count}</div>
        ${a.name === 'risk' ? `<div style="margin-top:12px"><span class="pill red">stop -${a.stop_pct}%</span> <span class="pill green">trail ${a.trail_pct}%</span></div>` : ''}`;
      car.appendChild(d);
    });
    const running = (s.agents || []).filter(a => !a.paused).length;
    document.getElementById('agentRunning').textContent = running + ' running';

    const chart = await api('/api/chart?range=' + state.range);
    DeskCharts.lineChart(document.getElementById('homeChart'), chart.points, chart.marks);

    const act = await api('/api/activity');
    renderActivity(document.getElementById('homeActivity'), (act.rows || []).slice(0, 5));
  }

  function renderActivity(el, rows) {
    el.innerHTML = '';
    if (!rows.length) {
      el.innerHTML = '<div class="empty">Nothing yet tonight</div>';
      return;
    }
    rows.forEach(r => {
      const b = document.createElement('button');
      b.className = 'activity-row';
      b.innerHTML = `<div class="title">${escapeHtml(r.title)}</div>
        <div class="val">${escapeHtml(r.value || '')}</div>
        <div class="sub">${escapeHtml(r.subtitle || '')}</div>`;
      b.onclick = () => {
        if (r.kind === 'rejected') openAudit(r.mint);
        else if (r.mint) openCoin(r.mint);
      };
      el.appendChild(b);
    });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function refreshAgents() {
    const s = await api('/api/state');
    const box = document.getElementById('agentsList');
    box.innerHTML = '';
    for (const a of s.agents || []) {
      const card = document.createElement('div');
      card.className = 'card';
      const dec = await api('/api/agents/' + a.name + '/decisions');
      const rows = (dec.decisions || []).slice(0, 5).map(d => {
        const mint = d.mint || '';
        const label = d.name || d.symbol || (mint ? mint.slice(0, 8) : '—');
        const verdict = d.verdict || (d.passed === false ? 'reject' : d.passed ? 'pass' : d.status || '');
        const reason = d.reason || (d.failed && d.failed[0]) || '';
        const url = d.coin_url || (mint ? 'https://pump.fun/coin/' + mint : '#');
        return `<a class="row between" href="${url}" target="_blank" rel="noopener"><span>${escapeHtml(label)} · ${escapeHtml(verdict)}</span><span class="secondary">${escapeHtml(reason)}</span></a>`;
      }).join('');
      card.innerHTML = `<div class="row between" style="padding-top:14px">
          <strong>${a.title}</strong>
          <span class="secondary">${a.paused ? 'paused' : 'running'} · ${a.count}</span>
        </div>
        <div class="row between">
          <span>Pause</span>
          <input type="checkbox" data-agent="${a.name}" ${a.paused ? 'checked' : ''} ${a.name==='risk' && a.count>0 ? 'disabled' : ''}/>
        </div>
        ${rows || '<div class="empty">No decisions yet</div>'}`;
      box.appendChild(card);
      const cb = card.querySelector('input[type=checkbox]');
      if (cb) cb.onchange = async () => {
        const path = cb.checked ? '/pause' : '/resume';
        await api('/api/agents/' + a.name + path, { method: 'POST' });
        refreshAgents();
      };
    }
  }

  async function refreshActivity() {
    const act = await api('/api/activity');
    const rows = act.rows || [];
    document.getElementById('activityEmpty').classList.toggle('hidden', rows.length > 0);
    renderActivity(document.getElementById('activityList'), rows);
  }

  async function refreshAccount() {
    const a = await api('/api/account');
    document.getElementById('modePaper').classList.toggle('active', a.mode === 'PAPER');
    document.getElementById('modeLive').classList.toggle('active', a.mode === 'LIVE');
    document.getElementById('acctStack').textContent = '$' + Number(a.stack).toFixed(2);
    document.getElementById('profileLink').href = a.profile_url;
    document.getElementById('profileLink').querySelector('.secondary').textContent = a.pump_handle + ' ›';
    document.getElementById('tgStatus').textContent = a.telegram ? ('connected · @' + (a.owner || '')) : 'not connected';
    document.getElementById('inviteBtn').onclick = async () => {
      const url = a.invite_url || 'https://pump.fun';
      if (navigator.share) {
        try { await navigator.share({ title: 'Pump.fun', url }); return; } catch (e) {}
      }
      try { await navigator.clipboard.writeText(url); alert('Link copied'); } catch (e) { prompt('Copy', url); }
    };
    const settings = await api('/api/settings');
    const box = document.getElementById('settingsBox');
    const keys = Object.keys(settings).filter(k =>
      k.startsWith('scanner.') || k.startsWith('auditor.') || k.startsWith('analyst.') ||
      k.startsWith('executor.') || k.startsWith('risk.') || k === 'desk.paper_start_stack' ||
      k === 'desk.fees_ref_discount' || k === 'desk.push_rejects'
    ).sort();
    box.innerHTML = keys.map(k => {
      const v = settings[k];
      if (typeof v === 'boolean') {
        return `<label>${k}<input type="checkbox" data-k="${k}" ${v ? 'checked' : ''} style="float:right"/></label>`;
      }
      return `<label>${k}<input type="number" data-k="${k}" value="${v}" step="any"/></label>`;
    }).join('');
    box.querySelectorAll('input').forEach(inp => {
      inp.onchange = async () => {
        let val = inp.type === 'checkbox' ? inp.checked : Number(inp.value);
        await api('/api/settings', { method: 'POST', body: { settings: { [inp.dataset.k]: val } } });
      };
    });
  }

  async function openCoin(mint) {
    showTab('home');
    const scr = document.getElementById('screen-coin');
    scr.classList.remove('hidden');
    const c = await api('/api/coin/' + mint);
    document.getElementById('coinHeader').innerHTML =
      `<div style="font-size:22px;font-weight:700">${escapeHtml(c.name || mint.slice(0,8))}</div>
       <div class="secondary">${escapeHtml(c.symbol || '')} · Solana</div>
       <div style="font-size:36px;font-weight:700;margin:8px 0">$${c.price != null ? Number(c.price).toPrecision(4) : '—'}</div>`;
    DeskCharts.candles(document.getElementById('coinChart'), c.candles || [], c.exitLine);
    document.getElementById('coinStats').innerHTML =
      `<div><div class="label">Holders</div><div class="v">${c.holders != null ? c.holders : 'n/a'}</div></div>
       <div><div class="label">Shield</div><div class="v">${(c.auditLayers||[]).filter(l=>l.pass && l.value!=='not checked').length}/8</div></div>`;
    const btn = document.getElementById('coinBtn');
    btn.href = c.coin_url;
    btn.textContent = c.position ? 'Sell on Pump.fun' : 'Buy on Pump.fun';
    const pos = document.getElementById('coinPos');
    if (c.position) {
      pos.innerHTML = `<div class="card"><div class="row between"><span>Your position</span><span>$${Number(c.position.size_usd).toFixed(2)}</span></div>
        <div class="row between"><span>Entry</span><span>${Number(c.position.entry_price)}</span></div>
        <div class="row between"><span>Stop</span><span class="pill red">-${c.position.stop_pct}%</span></div></div>`;
    } else pos.innerHTML = '';
  }

  async function openAudit(mint) {
    showTab('home');
    const scr = document.getElementById('screen-audit');
    scr.classList.remove('hidden');
    const a = await api('/api/audit/' + mint);
    document.getElementById('auditTitle').innerHTML =
      a.passed ? `<h2>Cleared · 8/8 parts</h2><div class="secondary">Sent toward Executor</div>`
               : `<h2>Rejected · ${escapeHtml(a.reason || '')}</h2><div class="secondary">Grok Bot won't buy</div>`;
    const discs = document.getElementById('auditDiscs');
    const layers = a.layers || [];
    discs.innerHTML = '';
    const list = document.getElementById('auditLayers');
    list.innerHTML = '';
    layers.forEach((L, i) => {
      const d = document.createElement('div');
      d.className = 'disc' + (L.value === 'not checked' ? '' : (L.pass ? ' ok' : ' bad'));
      d.textContent = `${L.n}. ${L.name}`;
      discs.appendChild(d);
      const row = document.createElement('div');
      row.className = 'row between';
      row.style.padding = '10px 0';
      row.innerHTML = `<span>${escapeHtml(L.name)}</span><span class="secondary">${escapeHtml(L.value)}</span>`;
      list.appendChild(row);
      // beam animation
      setTimeout(() => {
        d.classList.add('beam');
        setTimeout(() => d.classList.remove('beam'), 350);
      }, i * 350);
    });
    const btn = document.getElementById('auditBtn');
    btn.href = 'https://pump.fun/coin/' + mint;
  }

  function bindSSE() {
    if (!state.token || !window.EventSource) return;
    // EventSource can't set headers — use query token
    const es = new EventSource('/api/stream?t=' + encodeURIComponent(state.token));
    ['scan','audit_layer','audit','verdict','signal','fill','exit','balance','activity'].forEach(ev => {
      es.addEventListener(ev, () => { softRefresh(); });
    });
    es.onerror = () => { setOffline(true, 5); };
  }

  let refreshTimer;
  function softRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if (state.tab === 'home') refreshHome().catch(err);
      if (state.tab === 'activity') refreshActivity().catch(err);
      if (state.tab === 'agents') refreshAgents().catch(err);
    }, 300);
  }

  function err(e) {
    console.warn(e);
    setOffline(true, 3);
    setTimeout(() => loop().catch(() => {}), 3000);
  }

  async function loop() {
    try {
      if (state.tab === 'home') await refreshHome();
      else if (state.tab === 'agents') await refreshAgents();
      else if (state.tab === 'activity') await refreshActivity();
      else if (state.tab === 'account') await refreshAccount();
    } catch (e) { err(e); }
  }

  function showHost(text) {
    const banner = document.getElementById("hostBanner");
    if (!banner) return;
    banner.textContent = text;
    banner.classList.remove("hidden");
  }

  async function refreshWallet() {
    const status = document.getElementById("walletStatus");
    const detected = (typeof describePhantom === "function") ? describePhantom(window) : { state: "unsupported", message: "Wallet script missing." };
    if (onPages()) {
      if (status) status.textContent = detected.message + " This static host is not connected to the desk API.";
      return;
    }
    if (detected.state !== "available") {
      if (status) status.textContent = detected.message;
      return;
    }
    try {
      const res = await fetch("/api/session", { credentials: "same-origin", headers: { "Accept": "application/json" } });
      if (!res.ok) throw new Error("session");
      const body = await res.json();
      if (status) status.textContent = body.connected ? "Session connected" : "Phantom is available. Not signed in.";
      const addr = document.getElementById("walletAddress");
      if (addr) addr.textContent = body.wallet || "";
      const hist = document.getElementById("intentHistory");
      if (body.connected && hist) {
        const rows = await fetch("/api/intents", { credentials: "same-origin" });
        if (rows.ok) {
          const data = await rows.json();
          hist.textContent = (data.rows || []).length ? ((data.rows || []).length + " simulated intents. Not Solana fills.") : "No simulated intents.";
        }
      }
    } catch (e) {
      if (status) status.textContent = "Desk API is not reachable from this page.";
    }
  }

  async function connectWallet() {
    const detected = describePhantom(window);
    if (detected.state !== "available") {
      document.getElementById("walletStatus").textContent = detected.message;
      return;
    }
    if (onPages()) {
      showHost("GitHub Pages cannot complete wallet login. Open the desk on its API origin.");
      return;
    }
    const provider = window.phantom.solana;
    const resp = await provider.connect();
    const wallet = resp.publicKey.toString();
    const nonceRes = await fetch("/api/session/nonce", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Requested-With": "pumpdesk" },
      body: JSON.stringify({ wallet: wallet, cluster: "devnet" }),
    });
    if (!nonceRes.ok) {
      document.getElementById("walletStatus").textContent = "Login nonce was refused. Cluster is devnet-only.";
      return;
    }
    const nonce = await nonceRes.json();
    const signed = await provider.signMessage(new TextEncoder().encode(nonce.message), "utf8");
    const csrf = (document.cookie.match(/(?:^|; )desk_csrf=([^;]+)/) || [])[1];
    const verify = await fetch("/api/session/verify", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "pumpdesk",
        "X-CSRF-Token": decodeURIComponent(csrf || ""),
      },
      body: JSON.stringify({
        wallet: wallet,
        cluster: "devnet",
        nonce: nonce.nonce,
        public_key_hex: Array.from(resp.publicKey.toBytes()).map(function (b) { return b.toString(16).padStart(2, "0"); }).join(""),
        signature_hex: Array.from(signed.signature).map(function (b) { return b.toString(16).padStart(2, "0"); }).join(""),
      }),
    });
    document.getElementById("walletStatus").textContent = verify.ok ? "Signed in with Phantom. Preview only." : "Wallet signature was not accepted.";
    refreshWallet();
  }

  function init() {
    bootToken();
    const live = document.getElementById("modeLive");
    if (live) live.disabled = true;
    document.getElementById("connectWallet").onclick = function () { connectWallet().catch(function () { showHost("Wallet connect failed before a session was created."); }); };
    const disconnect = document.getElementById("disconnectWallet");
    if (disconnect) disconnect.onclick = async function () {
      if (onPages()) return;
      const csrf = (document.cookie.match(/(?:^|; )desk_csrf=([^;]+)/) || [])[1];
      await fetch("/api/session/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-Requested-With": "pumpdesk", "X-CSRF-Token": decodeURIComponent(csrf || "") },
      });
      refreshWallet();
    };
    refreshWallet();
    document.querySelectorAll('.tabbar button').forEach(b => {
      b.onclick = () => { showTab(b.dataset.tab); if (state.token && !onPages()) loop(); };
    });
    document.getElementById('avatar').onclick = () => { showTab('account'); if (state.token && !onPages()) loop(); };
    if (onPages()) {
      showHost("GitHub Pages is static. The desk API is not on this host, so paper data and wallet login stay disconnected.");
      return;
    }
    if (!state.token) {
      showHost("Paper numbers stay blank until this same-origin API accepts the desk token. That token cannot approve a wallet preview.");
      return;
    }
    document.getElementById('seeAll').onclick = () => { showTab('activity'); loop(); };
    document.getElementById('ranges').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      state.range = b.dataset.r;
      document.querySelectorAll('#ranges button').forEach(x => x.classList.toggle('active', x === b));
      refreshHome().catch(err);
    };
    document.getElementById('coinBack').onclick = () => document.getElementById('screen-coin').classList.add('hidden');
    document.getElementById('auditBack').onclick = () => document.getElementById('screen-audit').classList.add('hidden');
    document.getElementById('modePaper').onclick = async () => {
      await api('/api/mode', { method: 'POST', body: { mode: 'PAPER' } });
      refreshAccount(); refreshHome();
    };
    document.getElementById('modeLive').onclick = () => {
      showHost("LIVE is unavailable. This screen cannot enable mainnet sending.");
    };
    document.getElementById('testPush').onclick = async () => {
      await api('/api/test-push', { method: 'POST' });
      alert('Test push sent');
    };
    bindSSE();
    loop();
    setInterval(() => loop().catch(() => {}), 15000);
  }

  init();
})();
