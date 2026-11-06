(function (global) {
  function dprCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor((canvas.height || rect.height) * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: rect.width, h: canvas.height || rect.height };
  }

  function lineChart(canvas, points, marks, opts) {
    const { ctx, w, h } = dprCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!points || points.length === 0) {
      ctx.strokeStyle = 'rgba(235,235,245,0.3)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(0, h * 0.6); ctx.lineTo(w, h * 0.6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(235,235,245,0.6)';
      ctx.font = '14px -apple-system, sans-serif';
      ctx.fillText('Waiting for the first trade', 16, h * 0.6 - 12);
      return;
    }
    const vals = points.map(p => +p.value);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const pad = 12;
    const start = vals[0];
    const y = v => pad + (1 - (v - min) / (max - min)) * (h - pad * 2);
    const x = i => (i / Math.max(1, points.length - 1)) * (w - 1);

    // gradient fill
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(0,211,90,0.35)');
    g.addColorStop(1, 'rgba(0,211,90,0)');
    ctx.beginPath();
    points.forEach((p, i) => {
      const X = x(i), Y = y(+p.value);
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    });
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();

    // dashed start
    ctx.strokeStyle = 'rgba(235,235,245,0.3)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, y(start)); ctx.lineTo(w, y(start)); ctx.stroke();
    ctx.setLineDash([]);

    // line
    ctx.strokeStyle = '#00d35a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const X = x(i), Y = y(+p.value);
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    });
    ctx.stroke();

    // marks
    if (marks && marks.length) {
      let row = 0;
      marks.slice(-8).forEach((m, i) => {
        const idx = Math.min(points.length - 1, Math.floor(points.length * (0.2 + 0.1 * i)));
        const X = x(idx);
        const Y = y(+points[idx].value) - 14 - row * 14;
        ctx.fillStyle = m.kind === 'bought' ? '#0a84ff' : (m.kind === 'stopped' ? '#ff453a' : '#00d35a');
        ctx.font = '11px -apple-system, sans-serif';
        ctx.fillText(m.label || m.value || '', X, Y);
        row = (row + 1) % 3;
      });
    }
  }

  function candles(canvas, data, exitLine) {
    const { ctx, w, h } = dprCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!data || !data.length) {
      ctx.fillStyle = 'rgba(235,235,245,0.6)';
      ctx.font = '14px -apple-system';
      ctx.fillText('No candles yet', 16, h / 2);
      return;
    }
    const highs = data.map(d => d.h), lows = data.map(d => d.l);
    let min = Math.min(...lows), max = Math.max(...highs);
    if (exitLine != null) { min = Math.min(min, exitLine); max = Math.max(max, exitLine); }
    if (min === max) { min -= 1; max += 1; }
    const pad = 10;
    const y = v => pad + (1 - (v - min) / (max - min)) * (h - pad * 2 - 30);
    const slot = w / data.length;
    data.forEach((d, i) => {
      const X = i * slot + slot / 2;
      const up = d.c >= d.o;
      ctx.strokeStyle = up ? '#00d35a' : '#ff453a';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath(); ctx.moveTo(X, y(d.h)); ctx.lineTo(X, y(d.l)); ctx.stroke();
      const top = y(Math.max(d.o, d.c)), bot = y(Math.min(d.o, d.c));
      ctx.fillRect(X - Math.max(1, slot * 0.3), top, Math.max(2, slot * 0.6), Math.max(1, bot - top));
      // volume
      const vh = Math.min(28, (d.v || 0) / (Math.max(...data.map(x => x.v || 1))) * 28);
      ctx.globalAlpha = 0.35;
      ctx.fillRect(X - slot * 0.3, h - vh, slot * 0.6, vh);
      ctx.globalAlpha = 1;
    });
    if (exitLine != null) {
      ctx.strokeStyle = '#ff9f0a';
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(0, y(exitLine)); ctx.lineTo(w, y(exitLine)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff9f0a';
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText('Risk trailing stop', 8, y(exitLine) - 4);
    }
  }

  function scoreRing(canvas, score, threshold) {
    const { ctx, w, h } = dprCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 8;
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#2c2c2e';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    const pct = Math.max(0, Math.min(100, score)) / 100;
    ctx.strokeStyle = score >= (threshold || 70) ? '#00d35a' : '#ffd60a';
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px -apple-system';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(score ?? '—'), cx, cy);
  }

  global.DeskCharts = { lineChart, candles, scoreRing };
})(window);
