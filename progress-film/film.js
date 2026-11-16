// SOLYN GLOBAL PROGRESS — a data film drawn on one 2D canvas. Everything on screen comes from plan.json (tools/prepare.mts).
// The look (theme, chart forms, transition) is chosen per edition in the plan, so two films never look the same.
const W = 1920, H = 1080;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eo = t => 1 - Math.pow(1 - clamp(t), 3);
const eio = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const back = t => { t = clamp(t); const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const lerp = (a, b, t) => a + (b - a) * t;
const euro = n => '€' + Math.round(n).toLocaleString('en-US');
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

const THEMES = {
  vault:    { bg: ['#05070D', '#0F1629'], ink: '#F4EFE4', mute: '#8E96AB', line: '#26304A', acc: '#D8B45A', acc2: '#6FA8FF', card: 'rgba(255,255,255,0.045)', disp: 'Sora', body: 'Sora', wDisp: 600, light: false, deco: 'rings' },
  ledger:   { bg: ['#EEF1F5', '#DDE3EC'], ink: '#0E1320', mute: '#5A6478', line: '#C3CBD8', acc: '#2447F9', acc2: '#0E1320', card: 'rgba(14,19,32,0.05)', disp: 'Fraunces', body: 'Instrument Sans', wDisp: 600, light: true, deco: 'rules' },
  aurora:   { bg: ['#0A0620', '#06202B'], ink: '#F2F4FF', mute: '#9AA3C7', line: '#2B2F58', acc: '#7CF5D0', acc2: '#C08BFF', card: 'rgba(255,255,255,0.06)', disp: 'Sora', body: 'Instrument Sans', wDisp: 700, light: false, deco: 'blobs' },
  terminal: { bg: ['#030806', '#07130D'], ink: '#DDF7E3', mute: '#6E9079', line: '#16382A', acc: '#B6F36A', acc2: '#4FD1C5', card: 'rgba(182,243,106,0.05)', disp: 'JetBrains Mono', body: 'JetBrains Mono', wDisp: 700, light: false, deco: 'grid' },
  studio:   { bg: ['#141A26', '#1D2536'], ink: '#FFFFFF', mute: '#9CA6BB', line: '#33405A', acc: '#FF7A1A', acc2: '#5EC8FF', card: 'rgba(255,255,255,0.055)', disp: 'Archivo', body: 'Archivo', wDisp: 800, light: false, deco: 'blocks' },
};
const SERVICES = [['seo', 'SEO'], ['website', 'Websites'], ['social', 'Social media']];

export function makeFilm(plan, dur = {}) {
  const T = THEMES[plan.look.theme] || THEMES.vault, L = plan.look;
  const SC = { seo: T.acc2, website: T.acc, social: T.light ? '#E0447C' : '#FF7EB6', oneoff: T.mute };
  // ── timeline: every scene lasts as long as its sentence needs ──
  let t = 0;
  const scenes = plan.scenes.map((s, i) => {
    const d = dur[s.id] ?? s.vo.split(' ').length / 2.7;
    const len = Math.max(s.min ?? (s.type === 'title' || s.type === 'end' ? 4 : 5.2), d + (s.type === 'end' ? 2.2 : 1.5));
    const o = { ...s, i, t0: t, t1: t + len, vo0: t + 0.7, d }; t += len; return o;
  });
  const DUR = Math.round((t + 0.5) * 24) / 24, TR = 0.7;

  // ── drawing helpers ──
  const font = (g, px, w = 500, fam = T.body) => { g.font = `${w} ${px}px "${fam}", sans-serif`; };
  const text = (g, s, x, y, px, { w = 500, fam = T.body, col = T.ink, al = 'left', a = 1, ls = 0 } = {}) => {
    if (a <= 0) return; g.save(); g.globalAlpha *= a; font(g, px, w, fam); g.fillStyle = col; g.textAlign = al; g.textBaseline = 'alphabetic';
    try { g.letterSpacing = ls + 'px'; } catch { /* older canvas */ } g.fillText(s, x, y); g.restore();
  };
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)); };
  const nice = v => { const p = Math.pow(10, Math.floor(Math.log10(v || 1))); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };

  function background(g, time) {
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, T.bg[0]); gr.addColorStop(1, T.bg[1]); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.save();
    if (T.deco === 'blobs') for (const [cx, cy, r, c, sp] of [[0.2, 0.25, 620, T.acc2, 0.11], [0.82, 0.7, 700, T.acc, 0.08], [0.6, 0.1, 420, '#3B6BFF', 0.14]]) {
      const x = cx * W + Math.sin(time * sp + cx * 9) * 120, y = cy * H + Math.cos(time * sp * 1.3 + cy * 7) * 90;
      const b = g.createRadialGradient(x, y, 0, x, y, r); b.addColorStop(0, rgba(c, 0.26)); b.addColorStop(1, rgba(c, 0)); g.fillStyle = b; g.fillRect(0, 0, W, H);
    }
    if (T.deco === 'grid') { g.strokeStyle = rgba(T.acc, 0.07); g.lineWidth = 1; const off = (time * 14) % 60; g.beginPath(); for (let x = -60 + off; x < W; x += 60) { g.moveTo(x, 0); g.lineTo(x, H); } for (let y = 0; y < H; y += 60) { g.moveTo(0, y); g.lineTo(W, y); } g.stroke(); }
    if (T.deco === 'rings') { g.strokeStyle = rgba(T.acc, 0.09); g.lineWidth = 1.5; for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(W * 0.86, H * 0.12, 160 + k * 120 + Math.sin(time * 0.3 + k) * 14, 0, 7); g.stroke(); } }
    if (T.deco === 'rules') { g.strokeStyle = rgba(T.ink, 0.07); g.lineWidth = 1; g.beginPath(); for (let y = 108; y < H; y += 108) { g.moveTo(0, y); g.lineTo(W, y); } g.stroke(); }
    if (T.deco === 'blocks') { g.fillStyle = rgba(T.acc, 0.9); g.fillRect(0, 0, 14, H); g.fillStyle = rgba(T.acc2, 0.08); g.save(); g.translate(W * 0.78, H * 0.5); g.rotate(-0.22 + Math.sin(time * 0.15) * 0.02); g.fillRect(-380, -900, 760, 1800); g.restore(); }
    g.restore();
  }
  // top strip: the chapters, the current one lit — the film tells you where you are
  function chrome(g, time, cur) {
    const x0 = 120, x1 = W - 120, n = scenes.length, gap = 10, w = (x1 - x0 - gap * (n - 1)) / n;
    scenes.forEach((s, i) => {
      const x = x0 + i * (w + gap), p = i < cur.i ? 1 : i === cur.i ? seg(time, s.t0, s.t1) : 0;
      g.fillStyle = rgba(T.light ? '#0E1320' : '#FFFFFF', 0.12); rr(g, x, 52, w, 4, 2); g.fill();
      if (p > 0) { g.fillStyle = T.acc; rr(g, x, 52, w * p, 4, 2); g.fill(); }
      text(g, s.chapter, x, 86, 17, { w: i === cur.i ? 700 : 500, col: i === cur.i ? T.ink : T.mute, a: i === cur.i ? 1 : 0.7 });
    });
  }
  function header(g, s, lt, x = 120) {
    const a = eo(seg(lt, 0.25, 0.9)), dy = (1 - a) * 26;
    text(g, s.kicker, x, 196 + dy, 26, { w: 600, col: T.acc, a });
    text(g, s.title, x, 262 + dy, 56, { w: T.wDisp, fam: T.disp, a: eo(seg(lt, 0.35, 1.0)), ls: -1 });
  }
  const bigNumber = (g, label, value, x, y, lt, t0 = 0.8, fmt = euro, px = 150) => {
    const p = eo(seg(lt, t0, t0 + 1.6)), a = eo(seg(lt, t0, t0 + 0.4));
    text(g, fmt(value * p), x, y, px, { w: T.wDisp, fam: T.disp, a, ls: -4 });
    text(g, label, x + 4, y + 46, 26, { col: T.mute, a });
  };
  const axis = (g, x, y, w, h, max, lt, fmt = euro, ticks = 4) => {
    const a = eo(seg(lt, 0.5, 1.1));
    for (let k = 0; k <= ticks; k++) { const yy = y + h - (h * k) / ticks; g.strokeStyle = rgba(T.light ? '#0E1320' : '#FFFFFF', 0.09 * a); g.lineWidth = 1; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); text(g, fmt((max * k) / ticks), x - 16, yy + 6, 18, { col: T.mute, al: 'right', a }); }
  };

  // ── charts ──
  function chartRevenue(g, lt, x, y, w, h) {
    const rows = plan.cumulative, n = rows.length, form = L.revenue;
    const max = nice(form === 'bars' ? Math.max(...rows.map(r => r.total)) : rows[n - 1].run);
    axis(g, x, y, w, h, max, lt);
    const px = i => x + (n === 1 ? w / 2 : (w * i) / (n - 1)), prog = eio(seg(lt, 0.9, 3.4));
    rows.forEach((r, i) => text(g, r.label, form === 'bars' ? x + (w / n) * (i + .5) : px(i), y + h + 36, 20, { col: T.mute, al: 'center', a: eo(seg(lt, 0.6 + i * 0.06, 1.2 + i * 0.06)) }));
    if (form === 'bars') {
      const bw = (w / n) * 0.58;
      rows.forEach((r, i) => { const p = back(seg(lt, 0.9 + i * 0.13, 1.7 + i * 0.13)), bh = (r.total / max) * h * p; g.fillStyle = r.total === Math.max(...rows.map(q => q.total)) ? T.acc : rgba(T.acc, 0.45); rr(g, x + (w / n) * (i + .5) - bw / 2, y + h - bh, bw, bh, 8); g.fill(); if (r.total && p > 0.9) text(g, euro(r.total), x + (w / n) * (i + .5), y + h - bh - 14, 19, { w: 600, al: 'center', a: seg(p, 0.9, 1) }); });
      return;
    }
    const pts = rows.map((r, i) => [px(i), y + h - (r.run / max) * h]);
    const upto = prog * (n - 1), path = [];
    for (let i = 0; i < n; i++) {
      if (i <= upto) { if (form === 'steps' && i > 0) path.push([pts[i][0], pts[i - 1][1]]); path.push(pts[i]); }
      else { const f = upto - (i - 1); if (f > 0) { const xx = lerp(pts[i - 1][0], pts[i][0], f); path.push(form === 'steps' ? [xx, pts[i - 1][1]] : [xx, lerp(pts[i - 1][1], pts[i][1], f)]); } break; }
    }
    if (path.length > 1) {
      const fill = g.createLinearGradient(0, y, 0, y + h); fill.addColorStop(0, rgba(T.acc, 0.38)); fill.addColorStop(1, rgba(T.acc, 0));
      g.beginPath(); g.moveTo(path[0][0], y + h); path.forEach(p => g.lineTo(p[0], p[1])); g.lineTo(path[path.length - 1][0], y + h); g.closePath(); g.fillStyle = fill; g.fill();
      g.beginPath(); path.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.strokeStyle = T.acc; g.lineWidth = 5; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
      const e = path[path.length - 1]; g.fillStyle = T.acc; g.beginPath(); g.arc(e[0], e[1], 9, 0, 7); g.fill(); g.fillStyle = rgba(T.acc, 0.25); g.beginPath(); g.arc(e[0], e[1], 18 + Math.sin(lt * 4) * 3, 0, 7); g.fill();
    }
    pts.forEach((p, i) => { if (i <= upto && rows[i].total) { g.fillStyle = T.bg[0]; g.beginPath(); g.arc(p[0], p[1], 6, 0, 7); g.fill(); g.strokeStyle = T.acc; g.lineWidth = 3; g.stroke(); } });
  }
  function chartClients(g, lt, x, y, w, h) {
    const rows = plan.mrrRows, n = rows.length, max = Math.max(1, ...rows.map(r => r.mrr)), form = L.clients;
    const out = c => (T.light && c.toUpperCase() === '#D5D9E0' ? '#8D95A3' : c);
    if (form === 'bars') {
      const rh = h / n;
      rows.forEach((r, i) => {
        const p = eo(seg(lt, 0.8 + i * 0.12, 1.8 + i * 0.12)), a = eo(seg(lt, 0.7 + i * 0.12, 1.1 + i * 0.12)), yy = y + rh * i + rh / 2, bx = x + 260, bw = (w - 400) * (r.mrr / max) * p;
        text(g, r.name, bx - 24, yy + 9, 26, { w: 600, al: 'right', a });
        g.fillStyle = rgba(T.light ? '#0E1320' : '#FFFFFF', 0.06 * a); rr(g, bx, yy - rh * 0.27, w - 400, rh * 0.54, 10); g.fill();
        g.fillStyle = out(r.color); rr(g, bx, yy - rh * 0.27, Math.max(r.mrr ? 10 : 0, bw), rh * 0.54, 10); g.fill();
        text(g, r.mrr ? euro(r.mrr * p) : 'no monthly fee', bx + Math.max(bw, 0) + 18, yy + 9, 26, { w: r.mrr ? 700 : 500, col: r.mrr ? T.ink : T.mute, a });
      });
    } else if (form === 'lollipop') {
      const cw = w / n;
      rows.forEach((r, i) => {
        const p = back(seg(lt, 0.8 + i * 0.12, 1.8 + i * 0.12)), a = eo(seg(lt, 0.7 + i * 0.12, 1.1 + i * 0.12)), cx = x + cw * (i + .5), hh = (h - 150) * (r.mrr / max) * p, top = y + h - 70 - hh;
        g.strokeStyle = rgba(out(r.color), 0.6 * a); g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, y + h - 70); g.lineTo(cx, top); g.stroke();
        g.fillStyle = out(r.color); g.beginPath(); g.arc(cx, top, 22 * a, 0, 7); g.fill();
        text(g, r.mrr ? euro(r.mrr) : '—', cx, top - 38, 26, { w: 700, al: 'center', a: seg(p, 0.7, 1) });
        const words = r.name.split(' '); words.slice(0, 2).forEach((wd, k) => text(g, wd, cx, y + h - 30 + k * 26, 21, { col: T.mute, al: 'center', a, w: 600 }));
      });
    } else {
      // bubbles: area follows the monthly fee
      const R = Math.min(170, w / 6.4); let cx = x + 20; const live = rows.filter(r => r.mrr > 0), rest = rows.filter(r => !r.mrr);
      const tot = live.reduce((a, r) => a + Math.sqrt(r.mrr / max) * R * 2 + 26, 0); cx = x + (w - tot) / 2;
      live.forEach((r, i) => {
        const rad = Math.sqrt(r.mrr / max) * R, p = back(seg(lt, 0.8 + i * 0.14, 1.7 + i * 0.14)), cy = y + h * 0.42 + (i % 2 ? 46 : -30) + Math.sin(lt * 1.2 + i) * 6;
        g.fillStyle = rgba(out(r.color), 0.2); g.beginPath(); g.arc(cx + rad, cy, Math.max(0, rad * p + 12), 0, 7); g.fill();
        g.fillStyle = out(r.color); g.beginPath(); g.arc(cx + rad, cy, Math.max(0, rad * p), 0, 7); g.fill();
        text(g, euro(r.mrr), cx + rad, cy + rad + 50, 28, { w: 700, al: 'center', a: seg(p, 0.6, 1) }); text(g, r.name, cx + rad, cy + rad + 82, 21, { col: T.mute, al: 'center', a: seg(p, 0.6, 1), w: 600 });
        cx += rad * 2 + 26;
      });
      if (rest.length) text(g, `No monthly fee: ${rest.map(r => r.name).join(' · ')}`, x + w / 2, y + h - 6, 22, { col: T.mute, al: 'center', a: eo(seg(lt, 2.4, 3)) });
    }
  }
  function chartServices(g, lt, x, y, w, h) {
    const rows = SERVICES.map(([k, label]) => ({ k, label, v: plan.services[k] })), tot = rows.reduce((a, r) => a + r.v, 0) || 1, form = L.services;
    if (form === 'donut') {
      const cx = x + w * 0.34, cy = y + h / 2, R = Math.min(h / 2 - 10, 270), p = eio(seg(lt, 0.8, 2.6)); let a0 = -Math.PI / 2;
      rows.forEach(r => { const a1 = a0 + (r.v / tot) * Math.PI * 2 * p; g.beginPath(); g.arc(cx, cy, R, a0, a1); g.arc(cx, cy, R * 0.6, a1, a0, true); g.closePath(); g.fillStyle = SC[r.k]; g.fill(); a0 = a1 + 0.012; });
      text(g, euro(tot * p), cx, cy + 14, 62, { w: T.wDisp, fam: T.disp, al: 'center', ls: -2 }); text(g, 'per month', cx, cy + 50, 22, { col: T.mute, al: 'center' });
      rows.forEach((r, i) => { const a = eo(seg(lt, 1.4 + i * 0.25, 2 + i * 0.25)), yy = cy - 110 + i * 110, lx = x + w * 0.66; g.fillStyle = SC[r.k]; rr(g, lx, yy - 26, 14, 64, 7); g.globalAlpha = a; g.fill(); g.globalAlpha = 1; text(g, r.label, lx + 34, yy, 26, { col: T.mute, a }); text(g, `${euro(r.v)}  ·  ${Math.round((r.v / tot) * 100)}%`, lx + 34, yy + 40, 36, { w: 700, a }); });
    } else if (form === 'split') {
      const cw = w / 3, max = Math.max(...rows.map(r => r.v)) || 1;
      rows.forEach((r, i) => { const p = back(seg(lt, 0.8 + i * 0.22, 1.9 + i * 0.22)), hh = (h - 190) * (r.v / max) * p, cx = x + cw * (i + .5); g.fillStyle = SC[r.k]; rr(g, cx - cw * 0.3, y + h - 90 - hh, cw * 0.6, hh, 16); g.fill(); text(g, euro(r.v * clamp(p)), cx, y + h - 110 - hh, 44, { w: 700, al: 'center', a: seg(p, 0.3, 0.8) }); text(g, r.label, cx, y + h - 40, 28, { w: 600, al: 'center', a: seg(p, 0.1, 0.6) }); text(g, `${Math.round((r.v / tot) * 100)}% of the total`, cx, y + h - 6, 21, { col: T.mute, al: 'center', a: seg(p, 0.3, 0.8) }); });
    } else {
      const p = eio(seg(lt, 0.8, 2.4)), by = y + h * 0.3, bh = 110; let xx = x;
      g.save(); rr(g, x, by, w, bh, 22); g.clip();
      rows.forEach(r => { const ww = w * (r.v / tot) * p; g.fillStyle = SC[r.k]; g.fillRect(xx, by, ww + 1, bh); xx += ww; });
      g.restore(); xx = x;
      rows.forEach((r, i) => { const ww = w * (r.v / tot), a = eo(seg(lt, 1.8 + i * 0.25, 2.4 + i * 0.25)); g.fillStyle = SC[r.k]; g.globalAlpha = a; g.fillRect(xx, by + bh + 26, 4, 150); g.globalAlpha = 1; text(g, r.label, xx + 22, by + bh + 62, 26, { col: T.mute, a }); text(g, euro(r.v), xx + 22, by + bh + 116, 52, { w: 700, a, ls: -1 }); text(g, `${Math.round((r.v / tot) * 100)}%`, xx + 22, by + bh + 158, 26, { w: 600, col: SC[r.k], a }); xx += ww; });
    }
  }
  function chartMargin(g, lt, x, y, w, h) {
    const { mrr, costs, margin } = plan.n, max = nice(mrr), cols = [['Recurring revenue', mrr, 0, T.acc2], ['Tools & subscriptions', -costs, mrr, T.light ? '#D0342C' : '#FF6B6B'], ['Margin per month', margin, 0, T.acc]], cw = w / 3;
    axis(g, x, y, w, h - 70, max, lt);
    cols.forEach(([label, v, base, col], i) => {
      const p = back(seg(lt, 0.9 + i * 0.5, 2.0 + i * 0.5)), a = eo(seg(lt, 0.8 + i * 0.5, 1.3 + i * 0.5)), cx = x + cw * (i + .5), sc = (h - 70) / max;
      const top = v < 0 ? y + h - 70 - base * sc : y + h - 70 - v * sc * p, hh = Math.abs(v) * sc * p;
      g.fillStyle = col; rr(g, cx - cw * 0.26, top, cw * 0.52, hh, 12); g.fill();
      if (i < 2) { g.strokeStyle = rgba(T.light ? '#0E1320' : '#FFFFFF', 0.3 * a); g.setLineDash([6, 8]); g.lineWidth = 2; g.beginPath(); const ly = i === 0 ? y + h - 70 - mrr * sc : y + h - 70 - margin * sc; g.moveTo(cx + cw * 0.26, ly); g.lineTo(cx + cw * 0.74, ly); g.stroke(); g.setLineDash([]); }
      text(g, (v < 0 ? '− ' : '') + euro(Math.abs(v) * clamp(p)), cx, (v < 0 ? top + hh + 44 : top - 18), 40, { w: 700, al: 'center', a });
      text(g, label, cx, y + h - 22, 24, { col: T.mute, al: 'center', a, w: 600 });
    });
  }
  function series(g, lt, rows, x, y, w, h, col, form, t0, fmt = v => String(Math.round(v))) {
    const n = rows.length; if (!n) return; const max = nice(Math.max(...rows.map(r => r.v), 1));
    rows.forEach((r, i) => { if (n <= 8 || i % 2 === (n - 1) % 2) text(g, r.label, x + (w / n) * (i + .5), y + h + 32, 18, { col: T.mute, al: 'center', a: eo(seg(lt, t0, t0 + 0.6)) }); });
    g.strokeStyle = rgba(T.light ? '#0E1320' : '#FFFFFF', 0.12); g.lineWidth = 1; g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w, y + h); g.stroke();
    if (form === 'bars') rows.forEach((r, i) => { const p = back(seg(lt, t0 + i * 0.07, t0 + 0.8 + i * 0.07)), hh = (r.v / max) * h * p, bw = (w / n) * 0.62, lastOne = i === n - 1; g.fillStyle = lastOne ? col : rgba(col, 0.5); rr(g, x + (w / n) * (i + .5) - bw / 2, y + h - hh, bw, hh, 7); g.fill(); if (lastOne || n <= 6) text(g, fmt(r.v), x + (w / n) * (i + .5), y + h - hh - 12, 20, { w: 700, al: 'center', a: seg(p, 0.8, 1) }); });
    else {
      const prog = eio(seg(lt, t0, t0 + 2)), pts = rows.map((r, i) => [x + (w / n) * (i + .5), y + h - (r.v / max) * h]), upto = prog * (n - 1), path = [];
      for (let i = 0; i < n; i++) { if (i <= upto) path.push(pts[i]); else { const f = upto - (i - 1); if (f > 0) path.push([lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]); break; } }
      if (path.length > 1) { const fill = g.createLinearGradient(0, y, 0, y + h); fill.addColorStop(0, rgba(col, 0.35)); fill.addColorStop(1, rgba(col, 0)); g.beginPath(); g.moveTo(path[0][0], y + h); path.forEach(p => g.lineTo(p[0], p[1])); g.lineTo(path[path.length - 1][0], y + h); g.closePath(); g.fillStyle = fill; g.fill(); g.beginPath(); path.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.strokeStyle = col; g.lineWidth = 5; g.lineJoin = 'round'; g.stroke(); }
      pts.forEach((p, i) => { if (i <= upto) { g.fillStyle = col; g.beginPath(); g.arc(p[0], p[1], 7, 0, 7); g.fill(); if (i === n - 1 || n <= 6) text(g, fmt(rows[i].v), p[0], p[1] - 18, 20, { w: 700, al: 'center' }); } });
    }
  }
  function chartReach(g, lt, x, y, w, h) {
    const half = (w - 80) / 2, a1 = eo(seg(lt, 0.6, 1.1)), a2 = eo(seg(lt, 1.2, 1.7));
    text(g, 'Visitors per week', x, y + 8, 24, { w: 600, col: T.mute, a: a1 }); series(g, lt, plan.visitors, x, y + 50, half, h - 250, T.acc, L.reach, 0.9);
    text(g, 'Requests and bookings per week', x + half + 80, y + 8, 24, { w: 600, col: T.mute, a: a2 }); series(g, lt, plan.requests, x + half + 80, y + 50, half, h - 250, T.acc2, L.reach === 'bars' ? 'area' : 'bars', 1.5);
    // one light per site
    const n = plan.sitesList.length, cw = w / n;
    plan.sitesList.forEach((s, i) => { const p = back(seg(lt, 2.2 + i * 0.1, 2.8 + i * 0.1)), cx = x + cw * (i + .5), cy = y + h - 60, col = s.up ? (T.light ? '#12A150' : '#3DDC84') : '#FF4D4D'; g.fillStyle = rgba(col, 0.2); g.beginPath(); g.arc(cx, cy, Math.max(0, 20 * p + Math.sin(lt * 3 + i) * 2), 0, 7); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(cx, cy, Math.max(0, 10 * p), 0, 7); g.fill(); text(g, s.name, cx, cy + 50, 20, { w: 600, al: 'center', a: clamp(p), col: T.ink }); });
  }
  function chartForecast(g, lt, x, y, w, h) {
    const rows = plan.forecast, n = rows.length, max = nice(Math.max(...rows.map(r => r.total), 1)), keys = ['seo', 'website', 'social', 'oneoff'], names = { seo: 'SEO', website: 'Websites', social: 'Social media', oneoff: 'One-off' };
    axis(g, x, y + 50, w, h - 110, max, lt);
    const used = keys.filter(k => rows.some(r => r[k] > 0)); let lx = x;
    used.forEach((k, i) => { const a = eo(seg(lt, 0.5 + i * 0.1, 1 + i * 0.1)); g.globalAlpha = a; g.fillStyle = SC[k]; rr(g, lx, y - 2, 18, 18, 5); g.fill(); g.globalAlpha = 1; text(g, names[k], lx + 28, y + 14, 21, { col: T.mute, a, w: 600 }); font(g, 21, 600); lx += g.measureText(names[k]).width + 70; });
    const sc = (h - 110) / max, base = y + h - 60;
    if (L.forecast === 'ribbons') {
      const prog = eio(seg(lt, 0.9, 3)), px = i => x + (w / (n - 1 || 1)) * i, clipW = w * prog; g.save(); g.beginPath(); g.rect(x - 4, y, clipW + 8, h); g.clip();
      let prev = rows.map(() => 0);
      used.forEach(k => { const cur = rows.map((r, i) => prev[i] + r[k]); g.beginPath(); rows.forEach((_, i) => { const yy = base - cur[i] * sc; i ? g.lineTo(px(i), yy) : g.moveTo(px(i), yy); }); for (let i = n - 1; i >= 0; i--) g.lineTo(px(i), base - prev[i] * sc); g.closePath(); g.fillStyle = rgba(SC[k], 0.85); g.fill(); prev = cur; });
      g.restore();
      rows.forEach((r, i) => { const a = eo(seg(lt, 1 + i * 0.25, 1.5 + i * 0.25)); text(g, r.label, px(i), base + 36, 20, { col: T.mute, al: i === 0 ? 'left' : i === n - 1 ? 'right' : 'center', a }); if (i % 2 === 1 || i === n - 1) text(g, euro(r.total), px(i), base - r.total * sc - 16, 22, { w: 700, al: i === n - 1 ? 'right' : 'center', a }); });
    } else {
      const cw = w / n, bw = cw * 0.56;
      rows.forEach((r, i) => { const p = back(seg(lt, 0.9 + i * 0.16, 1.9 + i * 0.16)); let yy = base; g.save(); rr(g, x + cw * (i + .5) - bw / 2, base - r.total * sc * p, bw, r.total * sc * p, 9); g.clip(); used.forEach(k => { const hh = r[k] * sc * p; g.fillStyle = SC[k]; g.fillRect(x + cw * (i + .5) - bw / 2, yy - hh, bw, hh + 0.5); yy -= hh; }); g.restore(); text(g, euro(r.total), x + cw * (i + .5), base - r.total * sc * p - 14, 22, { w: 700, al: 'center', a: seg(p, 0.7, 1) }); text(g, r.label, x + cw * (i + .5), base + 36, 20, { col: T.mute, al: 'center', a: clamp(p) }); });
    }
  }
  function chartWeek(g, lt, x, y, w, h) {
    const { paidWeek, paidPrevWeek } = plan.n, max = nice(Math.max(paidWeek, paidPrevWeek, 1)), rows = [['Week before', paidPrevWeek, rgba(T.acc, 0.45)], ['This week', paidWeek, T.acc]];
    rows.forEach(([label, v, col], i) => { const p = eo(seg(lt, 0.9 + i * 0.4, 2.1 + i * 0.4)), yy = y + 40 + i * 150; text(g, label, x, yy, 24, { col: T.mute, w: 600, a: clamp(p * 3) }); g.fillStyle = rgba(T.light ? '#0E1320' : '#FFFFFF', 0.07); rr(g, x, yy + 18, w, 70, 14); g.fill(); g.fillStyle = col; rr(g, x, yy + 18, Math.max(v ? 14 : 0, w * (v / max) * p), 70, 14); g.fill(); text(g, euro(v * p), x + w, yy, 30, { w: 700, al: 'right', a: clamp(p * 3) }); });
    text(g, 'Received per month', x, y + 400, 24, { w: 600, col: T.mute, a: eo(seg(lt, 1.8, 2.3)) });
    series(g, lt, plan.byMonth.map(b => ({ label: b.label, v: b.total })), x, y + 430, w, h - 480, T.acc2, 'bars', 2.0, euro);
  }

  // ── scenes ──
  const LX = 120, CX = 760, CW = W - CX - 120, CY = 330, CH = 560;
  function drawScene(g, s, time) {
    const lt = time - s.t0; background(g, time);
    if (s.type === 'title' || s.type === 'end') return titleCard(g, s, lt, time);
    chrome(g, time, s); header(g, s, lt);
    const wide = s.type === 'clients' || s.type === 'reach' || s.type === 'forecast' || s.type === 'focus';
    const x = wide ? LX : CX, w = wide ? W - 240 : CW, y = wide ? 420 : CY, h = wide ? 500 : CH;
    if (s.type === 'revenue') { bigNumber(g, `received since ${plan.sinceLabel}`, plan.n.paidTotal, LX, 520, lt); const top = plan.paidByClient.slice(0, 3); top.forEach((c, i) => { const a = eo(seg(lt, 2.2 + i * 0.25, 2.8 + i * 0.25)), yy = 660 + i * 62; g.globalAlpha = a; g.fillStyle = c.color; g.beginPath(); g.arc(LX + 9, yy - 9, 9, 0, 7); g.fill(); g.globalAlpha = 1; text(g, c.name, LX + 34, yy, 26, { a, w: 600 }); text(g, euro(c.total), LX + 520, yy, 26, { a, al: 'right', col: T.mute }); }); chartRevenue(g, lt, x + 60, y, w - 60, h - 40); }
    if (s.type === 'week') { bigNumber(g, 'received in the last 7 days', plan.n.paidWeek, LX, 520, lt); text(g, `${euro(plan.n.paidTotal)} since ${plan.sinceLabel}`, LX, 640, 28, { col: T.mute, a: eo(seg(lt, 2.2, 2.8)) }); chartWeek(g, lt, x, y - 40, w, h + 60); }
    if (s.type === 'clients') { text(g, euro(plan.n.mrr * eo(seg(lt, 0.8, 2.2))), W - 120, 262, 84, { w: T.wDisp, fam: T.disp, al: 'right', ls: -2, a: eo(seg(lt, 0.7, 1.1)) }); text(g, 'recurring per month', W - 120, 302, 24, { col: T.mute, al: 'right', a: eo(seg(lt, 0.7, 1.1)) }); chartClients(g, lt, x, 360, w, 570); }
    if (s.type === 'services') { bigNumber(g, 'recurring per month', plan.n.mrr, LX, 520, lt); chartServices(g, lt, x, y, w, h); }
    if (s.type === 'margin') { bigNumber(g, 'left per month after tools', plan.n.margin, LX, 520, lt, 1.9); text(g, `${Math.round((plan.n.margin / (plan.n.mrr || 1)) * 100)}% margin on recurring revenue`, LX, 640, 28, { col: T.acc, w: 600, a: eo(seg(lt, 3.2, 3.8)) }); chartMargin(g, lt, x + 60, y, w - 60, h); }
    if (s.type === 'reach') { const stats = plan.mode === 'full' ? [[plan.n.visitors30, 'visitors in 30 days'], [plan.n.requestsTotal, 'requests and bookings']] : [[plan.n.vNow, 'visitors last week'], [plan.n.rNow, 'requests last week']]; stats.forEach(([v, label], i) => { const p = eo(seg(lt, 0.8 + i * 0.3, 2.2 + i * 0.3)), xx = W - 120 - i * 420; text(g, Math.round(v * p).toLocaleString('en-US'), xx, 250, 78, { w: T.wDisp, fam: T.disp, al: 'right', ls: -2, a: clamp(p * 4) }); text(g, label, xx, 290, 22, { col: T.mute, al: 'right', a: clamp(p * 4) }); }); chartReach(g, lt, x, 370, w, 600); }
    if (s.type === 'forecast') { text(g, euro(plan.n.forecastTotal * eo(seg(lt, 0.8, 2.4))), W - 120, 262, 84, { w: T.wDisp, fam: T.disp, al: 'right', ls: -2, a: eo(seg(lt, 0.7, 1.1)) }); text(g, 'planned in invoices', W - 120, 302, 24, { col: T.mute, al: 'right', a: eo(seg(lt, 0.7, 1.1)) }); chartForecast(g, lt, x + 70, 380, w - 70, 580); }
    if (s.type === 'focus') { const n = plan.focus.length, cw = (w - 40 * (n - 1)) / n; plan.focus.forEach((f, i) => { const p = back(seg(lt, 0.9 + i * 0.9, 1.7 + i * 0.9)), a = clamp(p * 2), xx = x + i * (cw + 40), yy = 400 + (1 - p) * 60; g.globalAlpha = a; g.fillStyle = T.card; rr(g, xx, yy, cw, 420, 28); g.fill(); g.fillStyle = T.acc; rr(g, xx, yy, 10, 420, 5); g.fill(); g.globalAlpha = 1; text(g, String(i + 1).padStart(2, '0'), xx + 50, yy + 110, 72, { w: T.wDisp, fam: T.disp, col: T.acc, a }); wrap(g, f.title, xx + 50, yy + 190, Math.min(cw - 100, 900), n === 1 ? 54 : 40, { w: 700, a }); wrap(g, f.text, xx + 50, yy + (n === 1 ? 330 : 350), cw - 100, 28, { col: T.mute, a }); }); }
  }
  function wrap(g, s, x, y, w, px, o) { font(g, px, o.w ?? 500, o.fam ?? T.body); const words = s.split(' '); let line = '', yy = y; for (const wd of words) { if (g.measureText(line + wd).width > w && line) { text(g, line.trim(), x, yy, px, o); line = ''; yy += px * 1.22; } line += wd + ' '; } text(g, line.trim(), x, yy, px, o); }
  function titleCard(g, s, lt, time) {
    const end = s.type === 'end';
    // a skyline of the clients, each in its own colour, grows behind the title
    const rows = plan.mrrRows.filter(r => r.mrr > 0), max = Math.max(1, ...rows.map(r => r.mrr)), bw = W / (rows.length * 2 + 1);
    rows.forEach((r, i) => { const p = eo(seg(lt, 0.2 + i * 0.12, 1.6 + i * 0.12)), hh = (end ? 60 + 130 * (r.mrr / max) : 120 + 420 * (r.mrr / max)) * p; g.fillStyle = rgba(r.color, T.light ? 0.3 : 0.2); rr(g, bw * (i * 2 + 1), H - hh, bw, hh + 30, 18); g.fill(); });
    const a = eo(seg(lt, 0.3, 1.0));
    text(g, s.kicker, 120, 330, 30, { w: 600, col: T.acc, a });
    'SOLYN GLOBAL'.split('').reduce((xx, ch, i) => { const p = back(seg(lt, 0.35 + i * 0.05, 0.95 + i * 0.05)); font(g, 190, T.wDisp, T.disp); const cw = g.measureText(ch).width; text(g, ch, xx, 520 + (1 - p) * 70, 190, { w: T.wDisp, fam: T.disp, a: clamp(p * 1.5), ls: 0 }); return xx + cw - 4; }, 112);
    g.fillStyle = T.acc; rr(g, 120, 566, 360 * eio(seg(lt, 0.9, 1.8)), 8, 4); g.fill();
    text(g, end ? s.title : (plan.mode === 'full' ? 'Full company check' : 'Weekly progress'), 120, 660, 60, { w: 600, fam: T.disp, a: eo(seg(lt, 1.0, 1.7)), ls: -1 });
    if (end) [[euro(plan.n.paidTotal), 'received'], [euro(plan.n.mrr), 'recurring per month'], [euro(plan.n.forecastTotal), 'planned, 6 months']].forEach(([v, l], i) => { const p = eo(seg(lt, 1.3 + i * 0.3, 2 + i * 0.3)); text(g, v, 120 + i * 480, 800 + (1 - p) * 30, 64, { w: T.wDisp, fam: T.disp, a: p, ls: -1 }); text(g, l, 122 + i * 480, 842, 24, { col: T.mute, a: p }); });
    else text(g, `Since ${plan.sinceLabel}  ·  ${plan.n.active} active clients  ·  ${plan.n.sites} sites`, 120, 730, 30, { col: T.mute, a: eo(seg(lt, 1.4, 2.1)) });
  }

  // ── transitions between scenes ──
  function render(g, time, opts = {}) {
    time = clamp(time, 0, DUR - 1e-6);
    const cur = scenes.find(s => time < s.t1) || scenes[scenes.length - 1], prev = scenes[cur.i - 1], p = prev ? eio(seg(time, cur.t0, cur.t0 + TR)) : 1;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    if (prev && p < 1) {
      const kind = L.transition; g.save(); if (kind === 'push') g.translate(-W * p, 0); drawScene(g, prev, time); g.restore();
      g.save(); g.beginPath();
      if (kind === 'wipe') g.rect(0, 0, W * p, H); else if (kind === 'push') { g.translate(W * (1 - p), 0); g.rect(0, 0, W, H); } else if (kind === 'iris') g.arc(W / 2, H / 2, Math.hypot(W, H) / 2 * p, 0, 7); else for (let k = 0; k < 12; k++) g.rect(k * (W / 12), 0, (W / 12) * clamp(p * 1.6 - k * 0.05), H);
      g.clip(); drawScene(g, cur, time); g.restore();
      if (kind === 'wipe') { g.fillStyle = T.acc; g.fillRect(W * p - 6, 0, 6, H); }
    } else drawScene(g, cur, time);
    if (time < 0.5) { g.fillStyle = `rgba(0,0,0,${1 - time / 0.5})`; g.fillRect(0, 0, W, H); }
    if (time > DUR - 0.6) { g.fillStyle = `rgba(0,0,0,${seg(time, DUR - 0.6, DUR)})`; g.fillRect(0, 0, W, H); }
    if (!opts.nosub) { const s = subs().find(c => time >= c.t0 && time <= c.t1); if (s) { font(g, 30, 500); const tw = g.measureText(s.text).width; g.fillStyle = T.light ? 'rgba(255,255,255,0.86)' : 'rgba(0,0,0,0.6)'; rr(g, W / 2 - tw / 2 - 26, H - 86, tw + 52, 54, 14); g.fill(); text(g, s.text, W / 2, H - 49, 30, { al: 'center', col: T.light ? '#0E1320' : '#FFFFFF' }); } }
  }
  const subs = () => scenes.map(s => ({ t0: s.vo0, t1: Math.min(s.t1 - 0.1, s.vo0 + s.d + 0.5), text: s.sub }));
  const events = () => scenes.flatMap(s => [{ t: s.t0, type: s.i ? 'cut' : 'start' }, { t: s.vo0, type: 'vo', id: s.id, d: s.d }, ...(s.type === 'title' || s.type === 'end' ? [{ t: s.t0 + 0.9, type: 'rise' }] : [{ t: s.t0 + 0.9, type: 'draw', n: 6 }, { t: s.t0 + 2.4, type: 'lock' }]), ...(s.type === 'focus' ? plan.focus.map((_, i) => ({ t: s.t0 + 0.9 + i * 0.9, type: 'card' })) : [])]).sort((a, b) => a.t - b.t);
  const chapters = () => scenes.filter(s => s.type !== 'end').map(s => ({ t: Math.round(s.t0 * 10) / 10, label: s.chapter }));
  return { DUR, scenes, render, subs, events, chapters, theme: plan.look.theme };
}
