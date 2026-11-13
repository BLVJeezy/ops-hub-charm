// NOON SCAN — choreography. Everything comes from the plan (plan.js ← Hub snapshot); the timeline re-lays itself by the number of sites.
// 120 BPM, 1 bar = 2 s. Sections: boot → verdict → one inspection per site (problems first) → totals (plan view) → ending (ignite or power-down).
import { Holo, drawScanPlane, drawPad, makeCamera } from './engine/holo.js';
import * as U from './engine/hud.js';
const { clamp } = U;
const W = 1920, H = 1080, BAR = 2, BEAT = 0.5;
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eo = t => 1 - Math.pow(1 - clamp(t), 3);
const eio = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const sine = t => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t));
const pad2 = n => String(n).padStart(2, '0');

export function buildTimeline(plan, dur = {}) {
  const TL = { boot: [0, 3 * BAR], verdict: [3 * BAR, 6 * BAR], sites: [] };
  let t = TL.verdict[1];
  plan.order.forEach((s, k) => { TL.sites.push({ k, s, t0: t, t1: t + 3 * BAR }); t += 3 * BAR; });
  TL.totals = [t, t + 4 * BAR]; t += 4 * BAR;
  TL.end = [t, t + 3 * BAR]; t += 3 * BAR + 1.5;
  TL.DUR = t;
  const at = { intro: 0.75, verdict: TL.verdict[0] + 2.25, totals: TL.totals[0] + 0.25, end: TL.end[0] + 1.25 };
  TL.sites.forEach(x => { at['s' + x.k] = x.t0 + 0.75; });
  TL.vo = plan.lines.map(l => ({ id: l.id, t: at[l.id], text: l.text, sub: l.sub, d: dur[l.id] ?? l.text.split(' ').length / 2.6 }));
  return TL;
}

export function makeFilm(plan, model, dur) {
  const T = U.theme(192, 36);
  const TL = buildTimeline(plan, dur);
  const holo = new Holo(W, H);
  const n = plan.sites.length, crit = plan.status === 'critical';
  const focusSite = crit ? plan.order[0] : null;
  const YM = model.ymax || 1;
  const nodeC = i => model.byId['site' + i].center || model.byId['site' + i].anchor;
  const nodeAng = i => { const c = nodeC(i); return Math.atan2(c[2], c[0]); };
  const yawFor = i => Math.PI / 2 - nodeAng(i);

  // ---------- Camera ----------
  const CAM = {
    hook: { target: [0, 0.32 * YM, 0], yaw: 0.95, pitch: 0.62, dist: 5.0, cx: 0.5, cy: 0.56 },
    boot: { target: [0, 0.4 * YM, 0], yaw: 0.35, pitch: 0.34, dist: 4.3, cx: 0.6, cy: 0.56 },
    verdict: { target: [0, 0.4 * YM, 0], yaw: 0.2, pitch: 0.3, dist: 3.9, cx: 0.63, cy: 0.56 },
    plan: { target: [0, 0, 0], yaw: 0.2, pitch: 1.32, dist: 4.6, cx: 0.5, cy: 0.5 },
    eye: { target: [0, 0.42 * YM, 0], yaw: 0.25, pitch: 0.08, dist: 4.1, cx: 0.5, cy: 0.6 },
  };
  const siteCam = (x, u) => {
    const i = x.s.idx, c = nodeC(i), y = yawFor(i);
    return { target: [c[0], c[1] * 1.45, c[2]], yaw: y + lerp(0.5, 0.3, sine(u)), pitch: lerp(0.26, 0.2, u), dist: lerp(2.25, 2.05, u), cx: 0.34, cy: 0.55 };
  };
  const mix = (A, B, w) => {
    let dy = B.yaw - A.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    return { target: A.target.map((v, i) => lerp(v, B.target[i], w)), yaw: A.yaw + dy * w, pitch: lerp(A.pitch, B.pitch, w),
      dist: Math.exp(lerp(Math.log(A.dist), Math.log(B.dist), w)), cx: lerp(A.cx, B.cx, w), cy: lerp(A.cy, B.cy, w) };
  };
  const WHIP = 0.5;
  function camAt(t) {
    const [b0, b1] = TL.boot, [v0, v1] = TL.verdict;
    if (t < b1) return mix(CAM.hook, CAM.boot, eo(seg(t, 0, b1)));
    const first = TL.sites[0];
    if (t < v1 - WHIP || !first) {
      const c = { ...CAM.verdict, dist: lerp(4.3, 3.9, sine(seg(t, v0, v1))) };
      return t < v0 + 1 ? mix(CAM.boot, c, eio(seg(t, v0, v0 + 1))) : c;
    }
    for (const x of TL.sites) {
      if (t < x.t1 - WHIP || x === TL.sites[TL.sites.length - 1] && t < x.t1) {
        const u = seg(t, x.t0, x.t1), here = siteCam(x, u);
        const prev = x.k === 0 ? CAM.verdict : siteCam(TL.sites[x.k - 1], 1);
        return t < x.t0 ? mix(prev, here, eio(seg(t, x.t0 - WHIP, x.t0))) : here;
      }
      const nx = TL.sites[x.k + 1];
      if (nx && t < nx.t0) return mix(siteCam(x, 1), siteCam(nx, 0), eio(seg(t, nx.t0 - WHIP, nx.t0)));
    }
    const [o0, o1] = TL.totals, last = TL.sites[TL.sites.length - 1];
    const planC = u => ({ ...CAM.plan, yaw: CAM.plan.yaw + u * 0.5 });
    if (t < o1) return mix(last ? siteCam(last, 1) : CAM.verdict, planC(seg(t, o0, o1)), eio(seg(t, o0, o0 + 1.6)));
    const [e0] = TL.end;
    let end = CAM.eye;
    if (crit) { const i = focusSite.idx, c = nodeC(i); end = { target: [c[0], c[1], c[2]], yaw: yawFor(i) + 0.15, pitch: 0.06, dist: 2.2, cx: 0.5, cy: 0.56 }; }
    return mix(planC(1), { ...end, yaw: end.yaw + seg(t, e0, TL.DUR) * 0.15 }, eio(seg(t, e0, e0 + 1.6)));
  }
  const px = c => ({ ...c, cx: c.cx * W, cy: c.cy * H, fov: 0.6 });

  // whip-pan motion blur (5 sub-frames, 180° shutter) only inside the whip
  const accC = document.createElement('canvas'); accC.width = W; accC.height = H;
  const subC = document.createElement('canvas'); subC.width = W; subC.height = H;
  const whipK = t => { for (const x of TL.sites) if (x.k > 0 && t > x.t0 - WHIP && t < x.t0) return Math.sin(Math.PI * seg(t, x.t0 - WHIP, x.t0)); return 0; };
  function render(ctx, t, opt = {}) {
    if (opt.noblur || whipK(t) < 0.05) return frame(ctx, t, opt);
    const N = 5, a = accC.getContext('2d'), sg = subC.getContext('2d');
    for (let k = 0; k < N; k++) {
      sg.setTransform(1, 0, 0, 1, 0, 0); frame(sg, t + (k / (N - 1) - 0.5) / 48, { ...opt, frameT: t });
      a.globalAlpha = 1 / (k + 1); a.drawImage(subC, 0, 0);
    }
    ctx.save(); ctx.globalAlpha = 1; ctx.drawImage(accC, 0, 0); ctx.restore();
  }

  const siteAt = t => TL.sites.find(x => t >= x.t0 - WHIP * 0.5 && t < x.t1);
  const texts = [];
  const say = (id, text, x0, y0, x1, y1, o = {}) => texts.push({ id, text, x0, y0, x1, y1, ...o });

  function frame(ctx, t, opt = {}) {
    texts.length = 0;
    const fr = Math.round((opt.frameT ?? t) * 24);
    const cam = px(camAt(t));
    const [b0, b1] = TL.boot, [v0, v1] = TL.verdict, [o0, o1] = TL.totals, [e0, e1] = TL.end;
    // ---- state ----
    let scan = null, solid = 0, gain = 1, glitchAmt = 0, focus = null, dim = 0.2, wave = null;
    const explode = {}, flash = {};
    if (t < 3.2) scan = { y: lerp(-0.05, 1.08, sine(seg(t, 0.4, 3.1))) * YM, band: 0.06 * YM };
    const cur = siteAt(t);
    for (const x of TL.sites) {
      const k = eo(seg(t, x.t0 + 0.5, x.t0 + 1.25)) * (1 - eio(seg(t, x.t1 - 0.9, x.t1 - 0.4)));
      explode[`site${x.s.idx}-shell`] = k;
      if (x.s.state === 'down' && t >= x.t0 && t < x.t0 + 0.13) glitchAmt = Math.max(glitchAmt, 1 - (t - x.t0) / 0.13);
    }
    if (cur && t >= cur.t0 - 0.1) { focus = 'site' + cur.s.idx; dim = 0.14; }
    // the down node pulses white the whole film after it is found
    if (crit) for (const s of plan.order.filter(s => s.state === 'down')) flash['site' + s.idx] = t > TL.verdict[0] + 2 ? 0.35 + 0.35 * Math.sin(t * 6) : 0;
    // totals: half-time, everything lit evenly
    // ending
    if (t >= e0) {
      if (!crit) {
        const ig = e0 + 1.0;
        gain = t < ig ? lerp(1, 0.35, seg(t, e0 + 0.3, e0 + 0.5)) : 1 + 0.5 * Math.exp(-(t - ig) * 3);
        solid = t >= ig ? eo(seg(t, ig, ig + 0.4)) : 0;
        if (t >= ig && t < ig + 1.4) wave = { y: lerp(-0.1, 1.2 * YM, eio(seg(t, ig, ig + 1.3))), w: 0.07 };
      } else {
        gain = lerp(1, 0.25, eio(seg(t, e0 + 0.2, e0 + 1.0)));
        focus = 'site' + focusSite.idx; dim = lerp(0.2, 0.05, seg(t, e0, e0 + 1));
        if (t >= e0 + 1.0 && t < e0 + 1.13) glitchAmt = 1 - (t - e0 - 1.0) / 0.13;
      }
    }
    // verdict lock: one beat of silence (7.5–8.0), the pad dims, the verdict locks on 8.0
    const vLock = v0 + 2.0;
    if (t >= vLock - 0.5 && t < vLock) gain = 0.55;
    if (crit && t >= vLock && t < vLock + 0.13) glitchAmt = Math.max(glitchAmt, 1 - (t - vLock) / 0.13);

    // ---- stage ----
    U.background(ctx, W, H, T, { px: -cam.yaw * 260, py: cam.pitch * 300, cx: cam.cx, cy: cam.cy + 40 });
    drawPad(ctx, cam, W, H, { hue: T.hue, rot: t * 0.1, alpha: clamp(0.2 + t * 0.6) * (t >= e0 && crit ? lerp(1, 0.3, seg(t, e0, e0 + 1)) : 1) });
    if (solid > 0) { const P = makeCamera(cam, W, H).project; U.beam(ctx, T, P, solid, t, { y1: 1.15 * YM, r0: 1.25, r1: 1.05 }); }
    const info = holo.draw(ctx, model, cam, {
      hue: T.hue, scan, explode, solid, gain, focus, dim, flash, wave, scanOffset: t * 24,
      lineWidth: 1.3 * (1 + (solid ? 0.4 * Math.exp(-(t - e0 - 1) * 1.2) + 0.12 * solid : 0)),
    });
    if (scan && scan.y < 1.05 * YM) drawScanPlane(ctx, cam, W, H, scan.y, { hue: T.hue, r: 1.55, rot: t * 0.3, alpha: 1 - seg(t, 2.9, 3.2) });

    // ---- HUD ----
    if (t < v1) titleBlock(ctx, t, fr);
    if (t >= v0 - 0.1 && t < v1) verdictBlock(ctx, t, fr, vLock);
    // detection: every node gets a faint box as the scan completes
    if (t > 3.0 && t < v0 + 0.5) plan.sites.forEach((s, j) => {
      const tt = 3.25 + j * (2.0 / n), k = seg(t, tt, tt + 0.12) * (1 - seg(t, v0, v0 + 0.5));
      U.targetBox(ctx, T, info.bbox['site' + s.idx], 0.35 * k, { alpha: 0.6 * k, lockK: 0.2 + 0.1 * Math.sin(t * 20 + j), pad: 8 });
    });
    for (const x of TL.sites) siteBlock(ctx, t, fr, x, info);
    chips(ctx, t, fr);
    if (t >= o0 + 1.2 && t < e0 + 0.6) totalsBlock(ctx, t, fr);
    if (t >= e0 + 0.9) endBlock(ctx, t, fr);
    U.chrome(ctx, W, H, T, {
      alpha: t >= e0 + 0.4 ? 1 - 0.5 * seg(t, e0 + 0.4, e0 + 1) : 1,
      tl: `SOLYN HUB OS  //  NOON SCAN`,
      tr: status(t),
      bl: `SCAN.${String(fr).padStart(4, '0')}  ·  ${plan.dateCode}  ·  ${n} SITES`,
      br: `${(cam.yaw * 57.3 % 360).toFixed(1)}°  ·  ${(cam.pitch * 57.3).toFixed(1)}°  ·  ${cam.dist.toFixed(2)} M`,
      px: -cam.yaw * 200,
    });
    for (const x of TL.sites) if (x.k > 0) { const w = seg(t, x.t0 - WHIP, x.t0); if (w > 0 && w < 1) streaks(ctx, Math.sin(w * Math.PI), x.k); }
    if (!opt.nosub) { const v = subAt(t); if (v) { U.subtitle(ctx, W, H, T, v.text, v.a, { t }); say('sub', v.text, 360, H - 200, W - 360, H - 80); } }
    U.vignette(ctx, W, H, 0.5);
    if (glitchAmt > 0) U.glitch(ctx, W, H, glitchAmt, fr * 7.3);
  }

  function status(t) {
    if (t < 3.1) return `SCANNING  ${String(Math.round(clamp(t / 3.1) * 100)).padStart(3, '0')}%`;
    if (t < TL.verdict[1]) return `SCAN COMPLETE  ·  ${n} SITES`;
    for (const x of TL.sites) if (t < x.t1) return `SITE ${x.k + 1}/${n}  ·  ${x.s.name.toUpperCase()}`;
    if (t < TL.end[0]) return 'NETWORK TOTALS';
    return plan.status === 'ok' ? 'ALL CLEAR' : plan.status === 'critical' ? 'ACTION NEEDED' : 'WATCH';
  }

  function titleBlock(ctx, t, fr) {
    const a = seg(t, 1.0, 1.4) * (1 - seg(t, TL.verdict[0] + 1.2, TL.verdict[0] + 1.6));
    if (a <= 0) return;
    const x = 120, y = 250;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.textAlign = 'left';
    ctx.font = `300 132px ${U.FONT.ui}`; ctx.letterSpacing = '22px'; ctx.fillStyle = T.hi(a);
    ctx.fillText(U.rollText('NOON SCAN', seg(t, 1.0, 1.6), fr, 5), x - 6, y); ctx.letterSpacing = '0px';
    ctx.fillStyle = T.line(0.9 * a); ctx.fillRect(x, y + 26, 380 * eo(seg(t, 1.6, 2.0)), 2);
    ctx.font = `22px ${U.FONT.mono}`; ctx.fillStyle = T.line(0.9 * a);
    ctx.fillText(U.rollText(`${plan.dateCode}  ·  11:30  ·  SOLYN GLOBAL`, seg(t, 1.8, 2.4), fr, 9), x, y + 64);
    ctx.font = `500 32px ${U.FONT.ui}`; ctx.fillStyle = T.hi(0.85 * a * seg(t, 2.4, 2.8));
    ctx.fillText(`${n} client sites · health · traffic · requests`, x, y + 112);
    ctx.restore();
    if (a > 0.9) { say('title', 'NOON SCAN', x, y - 120, x + 900, y + 20); say('date', `${plan.dateCode}  ·  11:30  ·  SOLYN GLOBAL`, x, y + 40, x + 700, y + 72, { pass: true }); say('tag', `${n} client sites · health · traffic · requests`, x, y + 80, x + 700, y + 122, { pass: true }); }
  }

  function verdictBlock(ctx, t, fr, lock) {
    const a = seg(t, lock - 1.5, lock - 1.1) * (1 - seg(t, TL.verdict[1] - 0.35, TL.verdict[1] - 0.05));
    if (a <= 0) return;
    const x = 120, y = 520, w = 760, word = plan.verdict.word;
    U.plate(ctx, T, x - 24, y - 70, w + 48, 210, a);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.textAlign = 'left';
    ctx.font = `20px ${U.FONT.mono}`; ctx.fillStyle = T.dim(a); ctx.fillText('VERDICT', x, y - 36);
    const r = seg(t, lock - 0.5, lock), locked = t >= lock;
    ctx.letterSpacing = '6px'; U.fitFont(ctx, word, 300, 74, U.FONT.ui, w, 40);
    ctx.fillStyle = locked ? (t < lock + 0.12 ? T.hi(a) : T.acc(a)) : T.line(0.85 * a);
    ctx.fillText(t < lock - 0.5 ? '' : U.rollText(word, r, fr, 3), x, y + 40); ctx.letterSpacing = '0px';
    ctx.font = `600 28px ${U.FONT.ui}`; ctx.fillStyle = T.line(0.9 * a * seg(t, lock + 0.25, lock + 0.6));
    ctx.letterSpacing = '4px'; ctx.fillText(plan.verdict.sub, x, y + 100); ctx.letterSpacing = '0px';
    ctx.restore();
    if (locked) say('verdict', word + ' ' + plan.verdict.sub, x, y - 20, x + w, y + 110);
  }

  // ---- one site: lock → explode → leader → card rows roll on the beats → chip docks ----
  function siteBlock(ctx, t, fr, x, info) {
    const L = x.t0, s = x.s, id = 'site' + s.idx;
    if (t < L - 0.05 || t >= x.t1) return;
    const out = 1 - seg(t, x.t1 - 0.25, x.t1 - 0.02);
    const lk = seg(t, L, L + 0.22);
    U.targetBox(ctx, T, info.bbox[id], lk, { alpha: out, flash: t >= L && t < L + 0.12, tag: `SITE ${pad2(x.k + 1)} · ${s.state === 'down' ? 'FAULT' : 'LOCK'}`, pad: 18 });
    const anchor = info.anchor[id];
    const cx = 1160, cy = 230, w = 600;
    const lp = seg(t, L + 1.25, L + 1.75);
    if (anchor) U.leader(ctx, T, anchor, [lerp(anchor[0], cx - 40, 0.55), cy], [cx - 14, cy], lp, { alpha: out });
    const rv = seg(t, L + 1.5, L + 1.9);
    if (rv <= 0) return;
    const rows = [
      ['RESPONSE', s.last_response_ms != null ? (s.last_response_ms / 1000).toFixed(2) : '—', 'S'],
      ['VISITS YESTERDAY', String(s.visitors_yesterday ?? 0), delta(s)],
      ['NEW REQUESTS · 24H', String(s.new_24h ?? 0), ''],
      ['BOOKED · NEXT 7 DAYS', String(s.upcoming_7d ?? 0), ''],
      ['HEALTH CHECKS · 24H', String(s.checks24 ?? 0), ''],
    ];
    const big = s.state === 'down' ? { v: 'DOWN', u: '' } : { v: s.uptime24 != null ? Number(s.uptime24).toFixed(2) : '—', u: '% UPTIME 24H' };
    const H0 = 64 + 120 + 18 + rows.length * 54 + 20;
    U.plate(ctx, T, cx - 24, cy - 24, (w + 48) * eo(rv), H0 + 24, out * clamp(rv * 2));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const a = out;
    ctx.strokeStyle = T.line(0.9 * a); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + w * eo(rv), cy); ctx.stroke();
    ctx.fillStyle = T.line(0.9 * a); ctx.fillRect(cx, cy - 3, 34 * eo(rv), 6);
    ctx.font = `20px ${U.FONT.mono}`; ctx.fillStyle = T.dim(a); ctx.fillText(`${pad2(x.k + 1)}/${pad2(n)}`, cx, cy + 38);
    ctx.letterSpacing = '3px'; U.fitFont(ctx, s.name.toUpperCase(), 600, 36, U.FONT.ui, w - 230, 20);
    ctx.fillStyle = T.hi(0.95 * a); ctx.fillText(U.rollText(s.name.toUpperCase(), seg(t, L + 1.5, L + 2.0), fr, 3), cx + 72, cy + 40); ctx.letterSpacing = '0px';
    // state tag (a locked value → accent)
    const tag = s.state === 'down' ? 'DOWN' : s.state === 'warn' ? 'ATTENTION' : 'ONLINE';
    const tg = seg(t, L + 2.0, L + 2.1);
    if (tg > 0) {
      ctx.font = `600 20px ${U.FONT.ui}`; ctx.letterSpacing = '3px';
      const tw = ctx.measureText(tag).width + 26;
      ctx.strokeStyle = T.acc(0.95 * a * tg); ctx.lineWidth = 1.5; ctx.strokeRect(cx + w - tw, cy + 14, tw, 34);
      ctx.fillStyle = T.acc(a * tg); ctx.fillText(tag, cx + w - tw + 13, cy + 39); ctx.letterSpacing = '0px';
    }
    // big value: uptime, locks on beat (L + 3.0)
    const r0 = L + 2.0, r1 = L + 3.0, rl = seg(t, r0, r1), lockd = t >= r1;
    let y = cy + 64;
    if (rl > 0) {
      const bs = U.fitFont(ctx, big.v, 300, 120, U.FONT.ui, w - 230, 60);
      const adv = ctx.measureText('0').width * 1.02;
      ctx.fillStyle = lockd ? (t < r1 + 0.1 ? T.hi(a) : T.acc(a)) : T.line(0.85 * a);
      const vw = U.monoText(ctx, U.rollText(big.v, rl, fr, 11), cx - 4, y + bs * 0.82, adv);
      ctx.font = `500 30px ${U.FONT.ui}`; ctx.fillStyle = lockd ? T.acc(0.9 * a) : T.line(0.6 * a);
      ctx.fillText(big.u, cx + vw + 12, y + bs * 0.82);
      ctx.fillStyle = T.dim(0.35 * a); ctx.fillRect(cx, y + 128, w, 2);
      ctx.fillStyle = lockd ? T.acc(0.9 * a) : T.line(0.9 * a); ctx.fillRect(cx, y + 128, w * rl, 2);
      if (lockd) say('big' + x.k, big.v + big.u, cx, y, cx + w, y + 130);
    }
    y += 120 + 18;
    // rows: one per half beat after the big value
    rows.forEach(([lab, val, unit], j) => {
      const ta = L + 2.0 + j * 0.12, rr = seg(t, ta, ta + 0.35);
      if (rr <= 0) return;
      const yy = y + j * 54 + 36;
      ctx.strokeStyle = T.dim(0.35 * a * rr); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, yy + 14); ctx.lineTo(cx + w * eo(rr), yy + 14); ctx.stroke();
      ctx.font = `20px ${U.FONT.mono}`; ctx.fillStyle = T.line(0.8 * a * rr); ctx.textAlign = 'left'; ctx.fillText(lab, cx, yy);
      ctx.textAlign = 'right'; ctx.font = `500 22px ${U.FONT.ui}`; ctx.fillStyle = T.line(0.7 * a * rr);
      const uw = unit ? ctx.measureText(unit).width + 10 : 0; if (unit) ctx.fillText(unit, cx + w, yy);
      ctx.font = `400 40px ${U.FONT.ui}`; ctx.fillStyle = rr >= 1 ? T.hi(0.95 * a) : T.line(0.8 * a);
      ctx.fillText(U.rollText(val, rr, fr, 20 + j), cx + w - uw, yy + 4);
      ctx.textAlign = 'left';
      if (rr >= 1) say(`row${x.k}_${j}`, lab + ' ' + val + ' ' + unit, cx, yy - 30, cx + w, yy + 10);
    });
    ctx.restore();
  }
  const delta = s => {
    const a = s.visitors_yesterday ?? 0, b = s.visitors_day_before ?? 0;
    return a === b ? '=' : (a > b ? '▲' : '▼') + Math.abs(a - b);
  };

  // ---- chip rail: each inspected site docks on the left and stays ----
  function chips(ctx, t, fr) {
    const [e0] = TL.end;
    const step = Math.min(96, 620 / Math.max(1, n));
    TL.sites.forEach((x, j) => {
      const inA = seg(t, x.t1 - 0.3, x.t1 + 0.1) * (1 - seg(t, e0 + 0.3, e0 + 0.8));
      if (inA <= 0) return;
      const s = x.s, xx = lerp(150, 110, eo(inA)), yy = 210 + j * step;
      const st = s.state === 'down' ? 'DOWN' : s.state === 'warn' ? 'CHECK' : 'OK';
      U.chip(ctx, T, xx, yy, { label: s.name, value: String(s.visitors_yesterday ?? 0), unit: 'VIS', detail: `${st} · ${s.uptime24 != null ? Number(s.uptime24).toFixed(1) + '%' : '—'} · ${s.new_24h ?? 0} NEW` }, inA, { index: pad2(j + 1), w: 340 });
      if (inA >= 1) say('chip' + j, s.name + ' ' + st, xx, yy, xx + 340, yy + 72, { pass: true });
    });
  }

  function totalsBlock(ctx, t, fr) {
    const [o0] = TL.totals, [e0] = TL.end, a = seg(t, o0 + 1.2, o0 + 1.6) * (1 - seg(t, e0 + 0.1, e0 + 0.6));
    const x = 1380, y = 200, w = 420, P = plan.totals;
    const items = [
      ['VISITORS · YESTERDAY', String(P.visitors), ''],
      ['VISITORS · 7 DAYS', String(P.week), ''],
      ['NEW REQUESTS · 24H', String(P.fresh), ''],
      ['INVOICES OVERDUE', String(P.overdue), P.drafts ? `${P.drafts} DRAFT` : ''],
    ];
    U.plate(ctx, T, x - 24, y - 30, w + 48, items.length * 150 + 20, a);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.textAlign = 'left';
    items.forEach(([lab, val, unit], j) => {
      const tt = o0 + 1.5 + j * 1.0, r = seg(t, tt, tt + 0.3), roll = seg(t, tt, tt + 0.5);
      if (r <= 0) return;
      const yy = y + j * 150;
      ctx.strokeStyle = T.line(0.8 * a * r); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w * eo(r), yy); ctx.stroke();
      ctx.font = `20px ${U.FONT.mono}`; ctx.fillStyle = T.dim(a * r); ctx.fillText(lab, x, yy + 30);
      const bs = U.fitFont(ctx, val, 300, 92, U.FONT.ui, w - 140, 40), adv = ctx.measureText('0').width * 1.02;
      ctx.fillStyle = roll >= 1 ? T.acc(a) : T.line(0.8 * a);
      const vw = U.monoText(ctx, U.rollText(val, roll, fr, 31 + j), x - 3, yy + 30 + bs * 0.86, adv);
      ctx.font = `500 26px ${U.FONT.ui}`; ctx.fillStyle = roll >= 1 ? T.acc(0.9 * a) : T.line(0.6 * a);
      ctx.fillText(unit, x + vw + 12, yy + 30 + bs * 0.86);
      if (roll >= 1) say('tot' + j, lab + val + unit, x, yy, x + w, yy + 130, { pass: true });
    });
    ctx.restore();
  }

  function endBlock(ctx, t, fr) {
    const [e0] = TL.end, u = t - (e0 + 0.9), a = seg(u, 0, 0.3);
    const word = plan.status === 'ok' ? 'ALL CLEAR' : plan.status === 'critical' ? 'ACTION NEEDED' : 'WATCH LIST';
    const next = new Date(`${plan.day}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    const sub = plan.status === 'ok' ? `NEXT SCAN  ·  ${pad2(next.getUTCDate())}.${pad2(next.getUTCMonth() + 1)}  ·  12:00`
      : (plan.status === 'critical' ? plan.order.filter(s => s.state === 'down') : plan.order.filter(s => s.state === 'warn')).map(s => s.name.toUpperCase()).join('  ·  ');
    const y = plan.status === 'critical' ? 230 : 200;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.textAlign = 'center';
    ctx.font = `300 112px ${U.FONT.ui}`; ctx.letterSpacing = '18px';
    ctx.fillStyle = u > 0.6 ? (u < 0.7 ? T.hi(a) : T.acc(a)) : T.hi(a);
    ctx.fillText(U.rollText(word, seg(u, 0, 0.6), fr, 41), W / 2, y); ctx.letterSpacing = '0px';
    ctx.fillStyle = T.line(0.6 * seg(u, 0.5, 0.9)); ctx.fillRect(W / 2 - 220, y + 30, 440, 1.5);
    ctx.font = `22px ${U.FONT.mono}`; ctx.fillStyle = T.line(0.9 * seg(u, 0.7, 1.1));
    ctx.fillText(U.rollText(sub, seg(u, 0.7, 1.3), fr, 7), W / 2, y + 72);
    ctx.restore();
    if (u > 0.7) say('end', word, W / 2 - 500, y - 100, W / 2 + 500, y + 20);
    if (u > 1.3) say('endsub', sub, W / 2 - 500, y + 40, W / 2 + 500, y + 80);
  }

  function streaks(ctx, k, seed) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 28; i++) {
      const y = (Math.sin(i * 91.7 + seed) * 0.5 + 0.5) * H, len = 200 + 600 * Math.abs(Math.sin(i * 13.1)), x = (Math.sin(i * 7.9 + seed * 3) * 0.5 + 0.5) * W;
      ctx.fillStyle = T.line(0.22 * k); ctx.fillRect(x - len / 2, y, len, 1.4);
    }
    ctx.restore();
  }

  // subtitle hold: the voice + 0.6 s, and long enough to read (letters / 15 + 1.5 s, + a frame of margin)
  const hold = v => Math.max(1.8, v.d + 0.6, v.sub.replace(/\s/g, '').length / 15 + 1.6);
  function subAt(t) {
    for (let i = 0; i < TL.vo.length; i++) {
      const v = TL.vo[i], nx = TL.vo[i + 1];
      const end = Math.min(v.t + hold(v), nx ? nx.t - 0.12 : TL.DUR);
      if (t >= v.t - 0.1 && t < end) return { text: v.sub, a: seg(t, v.t - 0.1, v.t + 0.1) * (1 - seg(t, end - 0.15, end)) };
    }
    return null;
  }

  // ---------- sound events ----------
  function events() {
    const E = [], ev = (t, type, o = {}) => E.push({ t: +t.toFixed(4), type, ...o });
    const [v0, v1] = TL.verdict, [o0] = TL.totals, [e0] = TL.end, vLock = v0 + 2.0;
    ev(0.4, 'scan', { d: 2.7 });
    [0.25, 0.5, 0.75, 1.0].forEach((y, j) => ev(0.4 + 2.7 * (0.15 + j * 0.22), 'scan_tick', { y }));
    ev(1.0, 'roll', { d: 0.6, n: 9 }); ev(1.6, 'confirm_small'); ev(1.8, 'type_line'); ev(2.4, 'type_line');
    plan.sites.forEach((s, j) => ev(3.25 + j * (2.0 / n), 'detect', { i: j }));
    ev(vLock - 1.5, 'leader');
    ev(vLock - 0.5, 'silence', { d: 0.5, kind: 'true' });
    ev(vLock, 'lock', { bar: true }); ev(vLock, 'confirm', { i: -1 });
    if (crit) ev(vLock, 'glitch', { d: 0.13 });
    for (const x of TL.sites) {
      const L = x.t0;
      if (x.k > 0) ev(L - WHIP, 'whip', { d: WHIP });
      ev(L, 'lock', { i: x.k, bar: true });
      if (x.s.state === 'down') ev(L, 'glitch', { d: 0.13 });
      ev(L + 0.5, 'explode', { d: 0.75 });
      ev(L + 1.25, 'leader');
      ev(L + 1.5, 'roll', { d: 0.5, n: x.s.name.length });
      ev(L + 2.0, 'roll', { d: 1.0, n: 6 });
      ev(L + 3.0, 'confirm', { i: x.k, bar: true });
      for (let j = 0; j < 5; j++) ev(L + 2.0 + j * 0.12 + 0.35, 'tick_row', { j });
      ev(x.t1 - 0.9, 'reassemble');
      ev(x.t1 - 0.3, 'dock', { i: x.k });
    }
    ev(o0, 'crane', { d: 1.6 });
    for (let j = 0; j < 4; j++) { ev(o0 + 1.5 + j, 'roll', { d: 0.5, n: 3 }); ev(o0 + 2.0 + j, 'confirm_small'); }
    ev(e0 + 0.3, 'powerdown', { d: 0.5 });
    ev(e0 + 0.5, 'silence', { d: 0.5, kind: 'true' });
    if (!crit) { ev(e0 + 1.0, 'ignite', { bar: true }); ev(e0 + 1.0, 'wave', { d: 1.3 }); }
    else { ev(e0 + 1.0, 'glitch', { d: 0.13 }); ev(e0 + 1.0, 'alarm', { d: 4.5 }); }
    ev(e0 + 0.9, 'roll', { d: 0.6, n: 9 }); ev(e0 + 1.6, 'confirm');
    for (const v of TL.vo) ev(v.t, 'vo', { id: v.id, d: v.d });
    return E.sort((a, b) => a.t - b.t);
  }
  const subs = () => TL.vo.map((v, i) => { const nx = TL.vo[i + 1]; return { t0: v.t - 0.1, t1: Math.min(v.t + hold(v), nx ? nx.t - 0.12 : TL.DUR), text: v.sub }; });
  const timeline = () => ({ bpm: 120, bar: BAR, dur: TL.DUR, status: plan.status, boot: TL.boot, verdict: TL.verdict, totals: TL.totals, end: TL.end,
    sites: TL.sites.map(x => ({ k: x.k, id: x.s.id, name: x.s.name, state: x.s.state, t0: x.t0, t1: x.t1 })), vo: TL.vo });
  // chapters for the Hub player
  const chapters = () => [{ t: 0, label: 'Verdict' }, ...TL.sites.map(x => ({ t: Math.max(0, x.t0 - 0.5), label: x.s.name, site_id: x.s.id, state: x.s.state })), { t: TL.totals[0], label: 'Totals' }, { t: TL.end[0], label: 'End' }];
  return { render, TL, events, subs, timeline, chapters, texts: t => { const c = document.createElement('canvas').getContext('2d'); frame(c, t, {}); return texts.slice(); } };
}
