import { useEffect, useMemo, useRef } from "react";
import { buildShape, facingYaw, orbitPos, project3, springStep, type BrainMode, type P3 } from "@/lib/brain3d";
import { isPrivate } from "@/lib/privacy";

export type BrainNeuron = { key: string; label: string; value: string; color: string; weight: number; dim?: boolean; alert?: boolean; badge?: number };

const hexRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const BASE: [number, number, number] = [110, 160, 255];

/**
 * A living 3D brain: thousands of particles on a procedural cortex, folds, and one glowing neuron per client,
 * wired to the core. Drag to turn it (it keeps your momentum), pinch to zoom, tap a neuron to select it.
 */
export function BrainCanvas({ neurons, coreLabel, coreValue, selected, onSelect, mode = "brain" }: {
  mode?: BrainMode; neurons: BrainNeuron[]; coreLabel: string; coreValue: string; selected: string | null; onSelect: (key: string | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shape = useMemo(() => buildShape(mode, neurons.map((n) => ({ key: n.key, dim: n.dim }))), [mode, neurons.map((n) => n.key + (n.dim ? "d" : "")).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const byKey = useMemo(() => Object.fromEntries(neurons.map((n) => [n.key, n])), [neurons]);

  // particle colours: every region of the cortex takes the colour of the client that lives there
  const colors = useMemo(() => {
    const out = new Uint8Array((shape.points.length / 3) * 3);
    const rgb = shape.neurons.map((n) => hexRgb(byKey[n.key]?.color ?? "#6ea0ff"));
    for (let i = 0; i < out.length / 3; i++) {
      const c = shape.region[i] >= 0 ? rgb[shape.region[i]] : BASE, w = Math.min(1, shape.tint[i] * 1.15);
      for (let k = 0; k < 3; k++) out[i * 3 + k] = Math.round(BASE[k] + (c[k] - BASE[k]) * w);
    }
    return out;
  }, [shape, byKey]);

  const live = useRef({ shape, colors, byKey, neurons, selected, coreLabel, coreValue, onSelect, mode });
  live.current = { shape, colors, byKey, neurons, selected, coreLabel, coreValue, onSelect, mode };
  // a new look grows in again
  useEffect(() => { view.current.born = performance.now(); view.current.pitch = mode === "orbit" ? 0.62 : 0.22; }, [mode]); // the solar system is seen from above

  const view = useRef({ yaw: 1.1, vyaw: 0, pitch: 0.22, vpitch: 0, zoom: 1, vzoom: 0, zoomTarget: 1, hover: null as string | null, press: null as string | null, born: 0 });

  useEffect(() => {
    const canvas = canvasRef.current!, wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0, last = performance.now(), dpr = 1, W = 1, H = 1;
    const v = view.current;
    v.born = performance.now();

    const resize = () => {
      W = wrap.clientWidth; H = wrap.clientHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // ---- pointer: 1:1 rotation while dragging, momentum on release, tap to select ----
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = false, start = { x: 0, y: 0 }, pinch = { d: 0, zoom: 1 };
    let hist: { x: number; t: number }[] = [];
    let screen: { key: string; x: number; y: number; r: number; z: number }[] = [];
    const local = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const hit = (p: { x: number; y: number }) => {
      let best: string | null = null, bd = Infinity;
      for (const s of screen) { const d = Math.hypot(s.x - p.x, s.y - p.y); if (d < Math.max(22, s.r * 1.6) && d < bd) { best = s.key; bd = d; } }
      return best;
    };
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      v.vyaw = 0; v.vpitch = 0; // grabbing stops the spin on the spot
      if (pointers.size === 1) { moved = false; start = p; hist = [{ x: p.x, t: performance.now() }]; v.press = hit(p); }
      else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: v.zoom }; moved = true; v.press = null; }
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === "mouse") { v.hover = hit(p); canvas.style.cursor = v.hover ? "pointer" : "grab"; }
        return;
      }
      const prev = pointers.get(e.pointerId)!;
      pointers.set(e.pointerId, p);
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        v.zoom = v.zoomTarget = Math.min(2.4, Math.max(0.6, pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.d))));
        return;
      }
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 6) return;
      if (!moved) { moved = true; v.press = null; canvas.style.cursor = "grabbing"; }
      v.yaw += (p.x - prev.x) * 0.0075;
      if (e.pointerType === "mouse") v.pitch = Math.max(-0.7, Math.min(0.7, v.pitch + (p.y - prev.y) * 0.005));
      hist.push({ x: p.x, t: performance.now() });
      if (hist.length > 6) hist.shift();
    };
    const up = (e: PointerEvent) => {
      const p = local(e);
      pointers.delete(e.pointerId);
      v.press = null;
      if (pointers.size > 0) return;
      canvas.style.cursor = "grab";
      if (!moved) { const k = hit(p); live.current.onSelect(k && k !== live.current.selected ? k : null); return; }
      const a = hist[0], b = hist[hist.length - 1];
      if (hist.length > 1 && performance.now() - b.t < 80) v.vyaw = ((b.x - a.x) / Math.max(1, b.t - a.t)) * 1000 * 0.0075; // hand over the finger's speed
    };
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return; // plain scrolling scrolls the page
      e.preventDefault();
      v.zoomTarget = Math.min(2.4, Math.max(0.6, v.zoomTarget * Math.exp(-e.deltaY * 0.01)));
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", () => { v.hover = null; });
    canvas.addEventListener("wheel", wheel, { passive: false });

    const frame = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const L = live.current, calm = mq.matches;
      const t = calm ? 0 : now / 1000;
      const dragging = pointers.size > 0;
      const sel = L.selected ? L.shape.neurons.find((n) => n.key === L.selected) : null;

      if (!dragging) {
        if (sel) { // turn the selected neuron to the front, the short way round
          const target = facingYaw(sel.orbit ? orbitPos(sel.orbit, t * 0.25) : sel.pos);
          const diff = Math.atan2(Math.sin(target - v.yaw), Math.cos(target - v.yaw));
          [v.yaw, v.vyaw] = springStep(v.yaw, v.vyaw, v.yaw + diff, dt, 1, 0.7);
          [v.pitch, v.vpitch] = springStep(v.pitch, v.vpitch, L.mode === "orbit" ? 0.62 : 0.18, dt, 1, 0.7);
        } else {
          const idle = calm ? 0 : 0.14; // a slow, constant turn; a flick decays back into it
          v.vyaw += (idle - v.vyaw) * Math.min(1, dt * 1.6);
          v.yaw += v.vyaw * dt;
        }
      }
      [v.zoom, v.vzoom] = springStep(v.zoom, v.vzoom, v.zoomTarget * (sel ? 1.12 : 1), dt, 1, 0.5);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      const grow = calm ? 1 : Math.max(0, Math.min(1, (now - v.born) / 1800));
      const ease = 1 - Math.pow(1 - grow, 3);
      const R = Math.min(W * 0.5, H * 0.6) * v.zoom * (0.86 + 0.14 * ease);
      const cx = W / 2, cy = H / 2 + R * 0.04;
      const P = (p: P3) => { const q = project3(p, v.yaw, v.pitch); return { x: cx + q.x * R, y: cy + q.y * R, z: q.z, s: q.s }; };
      const dimAll = sel ? 0.45 : 1;

      ctx.globalCompositeOperation = "lighter";
      // soft glow behind the whole brain
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.25);
      halo.addColorStop(0, "rgba(60,110,255,0.20)"); halo.addColorStop(0.6, "rgba(50,70,255,0.06)"); halo.addColorStop(1, "rgba(40,60,255,0)");
      ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);

      // cortex particles
      const pts = L.shape.points, col = L.colors, n = pts.length / 3;
      const shown = Math.floor(n * ease);
      for (let i = 0; i < shown; i++) {
        const shimmer = calm ? 1 : 0.75 + 0.25 * Math.sin(t * 1.7 + i * 12.9898);
        const q = P([pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]]);
        const near = (q.z + 1) / 2; // 0 = far side, 1 = facing us
        const a = (0.14 + 0.82 * near * near) * shimmer * dimAll;
        const sz = (0.8 + 1.5 * near) * q.s * Math.max(1, R / 300);
        ctx.fillStyle = `rgba(${col[i * 3]},${col[i * 3 + 1]},${col[i * 3 + 2]},${a})`;
        ctx.fillRect(q.x - sz / 2, q.y - sz / 2, sz, sz);
      }
      // folds
      ctx.lineCap = "round";
      L.shape.folds.forEach((line, fi) => {
        if (fi > L.shape.folds.length * ease) return;
        const a0 = P(line[0]);
        const near = (a0.z + 1) / 2;
        ctx.strokeStyle = `rgba(120,170,255,${(L.mode === "brain" ? 0.06 + 0.42 * near * near : 0.1 + 0.22 * near) * dimAll})`;
        ctx.lineWidth = (0.5 + near) * (R / 320);
        ctx.beginPath(); ctx.moveTo(a0.x, a0.y);
        for (let s = 1; s < line.length; s++) { const q = P(line[s]); ctx.lineTo(q.x, q.y); }
        if (L.mode !== "brain") ctx.lineWidth = Math.max(0.6, R / 520);
        ctx.stroke();
      });

      // axons, signals, neurons
      screen = [];
      const labels: { x: number; y: number; near: number; n: BrainNeuron; r: number }[] = [];
      L.shape.neurons.forEach((sn, idx) => {
        const info = L.byKey[sn.key];
        if (!info) return;
        const [r, g, b] = hexRgb(info.color);
        const focus = !sel || sel.key === sn.key;
        const a = (sn.dim ? 0.45 : 1) * (focus ? 1 : 0.25);
        const path = (sn.orbit ? [L.shape.core, orbitPos(sn.orbit, t * (sel ? 0.25 : 1))] : sn.axon).map(P);
        const upto = Math.max(1, Math.floor(path.length * Math.min(1, ease * 1.4)));
        ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
        for (let s = 1; s < upto; s++) ctx.lineTo(path[s].x, path[s].y);
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.14 * a})`; ctx.lineWidth = (5 + info.weight * 5) * (R / 320); ctx.stroke();
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.85 * a})`; ctx.lineWidth = (1 + info.weight * 1.4) * (R / 320); ctx.stroke();
        if (!calm && grow >= 1 && !sn.dim) { // signals: busier clients fire more often
          const count = 1 + Math.round(info.weight * 2);
          for (let i = 0; i < count; i++) {
            const u = (t * (0.22 + info.weight * 0.16) + i / count + idx * 0.37) % 1;
            const f = u * (path.length - 1), i0 = Math.floor(f), q0 = path[i0], q1 = path[Math.min(path.length - 1, i0 + 1)], m = f - i0;
            ctx.fillStyle = `rgba(255,255,255,${0.95 * a * Math.sin(u * Math.PI)})`;
            ctx.beginPath(); ctx.arc(q0.x + (q1.x - q0.x) * m, q0.y + (q1.y - q0.y) * m, 2.2 * (R / 320), 0, Math.PI * 2); ctx.fill();
          }
        }
        const q = path[path.length - 1];
        const near = (q.z + 1) / 2;
        const press = v.press === sn.key ? 0.85 : 1;
        const breathe = calm ? 1 : 1 + Math.sin(t * 1.4 + idx) * 0.06;
        const rad = (sn.dim ? 5 : 8 + info.weight * 6) * q.s * (R / 300) * press * breathe * Math.min(1, ease * 1.3);
        const hot = v.hover === sn.key || L.selected === sn.key;
        const glow = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, rad * 3.4);
        glow.addColorStop(0, `rgba(255,255,255,${a * (0.5 + 0.5 * near)})`);
        glow.addColorStop(0.2, `rgba(${r},${g},${b},${0.9 * a})`);
        glow.addColorStop(0.5, `rgba(${r},${g},${b},${(hot ? 0.4 : 0.22) * a})`);
        glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(q.x, q.y, rad * 3.4, 0, Math.PI * 2); ctx.fill();
        if (info.alert && !calm) {
          const ph = (t % 1.5) / 1.5;
          ctx.strokeStyle = `rgba(255,90,90,${0.9 * (1 - ph)})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(q.x, q.y, rad * (1.3 + ph * 2.4), 0, Math.PI * 2); ctx.stroke();
        }
        if (L.selected === sn.key) {
          ctx.strokeStyle = `rgba(255,255,255,0.85)`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(q.x, q.y, rad * 2.1, 0, Math.PI * 2); ctx.stroke();
        }
        screen.push({ key: sn.key, x: q.x, y: q.y, r: rad, z: q.z });
        labels.push({ x: q.x, y: q.y, near, n: info, r: rad });
      });

      // the core: a bright vertical seam of light
      const c = P(L.shape.core);
      const pulse = calm ? 1 : 1 + Math.sin(t * 0.9) * 0.05;
      ctx.save(); ctx.translate(c.x, c.y); ctx.scale(0.5, 1);
      const seam = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.17 * pulse);
      seam.addColorStop(0, `rgba(255,255,255,${0.95 * dimAll})`); seam.addColorStop(0.3, `rgba(170,225,255,${0.7 * dimAll})`); seam.addColorStop(1, "rgba(60,140,255,0)");
      ctx.fillStyle = seam; ctx.beginPath(); ctx.arc(0, 0, R * 0.17 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // labels, crisp on top
      ctx.globalCompositeOperation = "source-over";
      ctx.shadowColor = "rgba(0,0,0,0.95)"; ctx.shadowBlur = 7;
      const hide = isPrivate();
      const mask = (s: string) => (hide && s.includes("€") ? "€ •••" : s);
      const font = (w: number, s: number) => `${w} ${s}px system-ui, -apple-system, "SF Pro Text", Inter, sans-serif`;
      if (grow > 0.6) {
        const la = Math.min(1, (grow - 0.6) / 0.4);
        // keep name tags from sitting on top of each other: spread them vertically per side
        const fsBase = Math.max(10.5, Math.min(15, R / 26));
        const ly = new Map<string, number>();
        for (const side of [true, false]) {
          const col = labels.filter((l) => (l.x >= cx) === side).sort((a, b) => a.y - b.y);
          let prev = -Infinity;
          for (const l of col) { const y = Math.max(l.y, prev + fsBase * 2.25); ly.set(l.n.key, y); prev = y; }
        }
        for (const l of labels.sort((a, b) => a.near - b.near)) {
          l.y = ly.get(l.n.key) ?? l.y;
          const isSel = L.selected === l.n.key, isHover = v.hover === l.n.key;
          const a = la * (isSel || isHover ? 1 : sel ? 0.25 : l.n.dim ? 0.25 + 0.4 * l.near : 0.2 + 0.8 * l.near * l.near);
          if (a < 0.12) continue;
          const right = l.x >= cx;
          const fs = Math.max(10.5, Math.min(15, R / 26)) * (isSel ? 1.12 : 1);
          ctx.globalAlpha = a; ctx.textAlign = right ? "left" : "right"; ctx.textBaseline = "middle";
          const tx = l.x + (right ? 1 : -1) * (l.r * 1.6 + 8);
          ctx.font = font(650, fs); ctx.fillStyle = "#fff"; ctx.fillText(l.n.label, tx, l.y - fs * 0.38);
          ctx.font = font(500, fs * 0.82); ctx.fillStyle = l.n.color; ctx.fillText(mask(l.n.value) + (l.n.badge ? `  ·  ${l.n.badge} taken` : ""), tx, l.y + fs * 0.62);
        }
        ctx.globalAlpha = la * (sel ? 0.5 : 1); ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        const fs = Math.max(12, Math.min(18, R / 20));
        ctx.font = font(700, fs); ctx.fillStyle = "#fff"; ctx.fillText(L.coreLabel, cx, H - 16 - fs * 1.15);
        ctx.font = font(600, fs * 0.8); ctx.fillStyle = "rgba(170,225,255,0.95)"; ctx.fillText(mask(L.coreValue), cx, H - 16);
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); canvas.removeEventListener("wheel", wheel);
    };
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0 cursor-grab select-none" style={{ touchAction: "pan-y" }} role="img" aria-label="3D-brein: elke klant is een neuron. Sleep om te draaien, tik op een neuron om het te kiezen." />
    </div>
  );
}
