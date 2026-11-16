import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BrainCircuit, Maximize2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { clientMRR, clientMRRBreakdown, type FeeClient } from "@/lib/fees";
import { formatCurrency } from "@/lib/format";
import { isPrivate } from "@/lib/privacy";
import { R_SOMA, bez, brainBounds, buildBrain, hitBrain, project, stepSpring, type Brain, type Curve, type Neuron, type NeuronInput, type Spring, type TipInput, type Tone } from "@/lib/brain";

export const Route = createFileRoute("/_authenticated/brain")({
  component: BrainPage,
  head: () => ({ meta: [{ title: "Brain · Solyn" }] }),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type ClientRow = FeeClient & { id: string; name: string; status: string; pipeline_stage?: string | null; location?: string | null };
type SiteRow = { id: string; client_id: string | null; name: string; last_status: string | null; last_response_ms: number | null };
type InvoiceRow = { id: string; client: string | null; total: number; status: string; scheduled_send_at: string | null; repeat_monthly: boolean; next_repeat_on: string | null };
type RecordRow = { id: string; site_id: string; source_created_at: string | null };
type AgreementRow = { id: string; client_id: string; status: string };
type Data = { clients: ClientRow[]; sites: SiteRow[]; invoices: InvoiceRow[]; records: RecordRow[]; agreements: AgreementRow[] };

const TONE: Record<Tone, string> = {
  gold: "236,200,110", green: "74,222,160", amber: "251,176,40", red: "255,110,110", sky: "80,200,255",
  violet: "180,150,255", pink: "255,120,190", teal: "60,225,205", grey: "150,160,180",
};
const K_MIN = 0.12, K_MAX = 7;
const AGENT_SLOTS = 2;

const isPlanned = (v: InvoiceRow) => (v.status === "Draft" && !!v.scheduled_send_at) || (v.repeat_monthly && !!v.next_repeat_on);
const siteTone = (s: string | null): Tone => (s === "up" ? "green" : s === "degraded" ? "amber" : s === "down" ? "red" : "grey");

/** One neuron per client; its dendrites are the client's websites, services, money, leads, contract and agent slots. */
function toNeurons(d: Data): { neurons: NeuronInput[]; mrr: number } {
  const active = d.clients.filter((c) => c.status === "Active").sort((a, b) => clientMRR(b) - clientMRR(a) || a.name.localeCompare(b.name));
  const prospects = d.clients.filter((c) => c.status === "Prospect").sort((a, b) => a.name.localeCompare(b.name));
  const mrr = active.reduce((a, c) => a + clientMRR(c), 0);
  const top = Math.max(1, ...active.map(clientMRR));
  const week = Date.now() - 7 * 864e5;
  const one = (c: ClientRow, prospect: boolean): NeuronInput => {
    const sites = d.sites.filter((s) => s.client_id === c.id);
    const ids = new Set(sites.map((s) => s.id));
    const inv = d.invoices.filter((v) => v.client === c.id);
    const paid = inv.filter((v) => v.status === "Paid").reduce((a, v) => a + Number(v.total || 0), 0);
    const due = inv.filter((v) => v.status === "Sent").reduce((a, v) => a + Number(v.total || 0), 0);
    const planned = inv.filter(isPlanned).length;
    const leads = d.records.filter((r) => ids.has(r.site_id) && r.source_created_at && new Date(r.source_created_at).getTime() > week).length;
    const agr = d.agreements.find((a) => a.client_id === c.id);
    const b = clientMRRBreakdown(c);
    const tips: TipInput[] = [];
    for (const s of sites) tips.push({ id: `s${s.id}`, label: s.name, sub: s.last_status === "down" ? "offline" : s.last_response_ms != null ? `${s.last_response_ms} ms` : "website", tone: siteTone(s.last_status), ref: { type: "site", id: s.id } });
    if (b.seo) tips.push({ id: "seo", label: "SEO", sub: formatCurrency(b.seo), tone: "sky" });
    if (b.website) tips.push({ id: "web", label: "Website", sub: formatCurrency(b.website), tone: "gold" });
    if (b.social) tips.push({ id: "social", label: "Social", sub: formatCurrency(b.social), tone: "violet" });
    if (due) tips.push({ id: "due", label: "Open", sub: formatCurrency(due), tone: "amber" });
    if (paid) tips.push({ id: "paid", label: "Betaald", sub: formatCurrency(paid), tone: "green" });
    if (planned) tips.push({ id: "plan", label: "Gepland", sub: `${planned}×`, tone: "sky" });
    if (leads) tips.push({ id: "leads", label: "Aanvragen", sub: `${leads} · 7 d`, tone: "pink" });
    if (agr) tips.push({ id: "agr", label: "Contract", sub: agr.status.toLowerCase(), tone: "teal" });
    for (let i = 0; i < AGENT_SLOTS; i++) tips.push({ id: `agent${i}`, label: "Agent", sub: "vrij", tone: "grey", slot: true });
    const m = clientMRR(c);
    return {
      key: c.id, label: c.name, value: prospect ? (c.pipeline_stage ?? "prospect") : m ? `${formatCurrency(m)}/mnd` : (c.location ?? "klant"),
      sub: prospect ? "prospect" : "klant", weight: prospect ? 0 : m / top, dim: prospect, alert: sites.some((s) => s.last_status === "down"), tips,
    };
  };
  return { neurons: [...active.map((c) => one(c, false)), ...prospects.map((c) => one(c, true))], mrr };
}

function BrainPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const [c, s, i, r, a] = await Promise.all([
        supabase.from("clients").select("*"),
        db.from("monitored_sites").select("id,client_id,name,last_status,last_response_ms").eq("enabled", true).order("name"),
        db.from("invoices").select("id,client,total,status,scheduled_send_at,repeat_monthly,next_repeat_on"),
        db.from("site_records").select("id,site_id,source_created_at").neq("kind", "blokkade").gte("source_created_at", since).limit(1000),
        db.from("client_agreements").select("id,client_id,status"),
      ]);
      if (!alive) return;
      setData({ clients: (c.data as unknown as ClientRow[]) ?? [], sites: s.data ?? [], invoices: i.data ?? [], records: r.data ?? [], agreements: a.data ?? [] });
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const model = useMemo(() => {
    if (!data) return null;
    const { neurons, mrr } = toNeurons(data);
    return { brain: buildBrain(neurons), mrr };
  }, [data]);
  const brain = model?.brain ?? null;
  const focus = brain?.neurons.find((n) => n.key === focusKey) ?? null;

  // ---------- canvas world ----------
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cam = useRef({ x: { value: 0, velocity: 0, target: 0 } as Spring, y: { value: 0, velocity: 0, target: 0 } as Spring, k: { value: 0.6, velocity: 0, target: 0.6 } as Spring, dim: { value: 0, velocity: 0, target: 0 } as Spring });
  const modelRef = useRef(model);
  const focusRef = useRef<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const pressRef = useRef<{ id: string | null; s: Spring }>({ id: null, s: { value: 1, velocity: 0, target: 1 } });
  const fitK = useRef(0.6);
  const reduced = useRef(false);
  const born = useRef(0);
  modelRef.current = model;
  focusRef.current = focusKey;

  const size = () => {
    const el = wrapRef.current;
    return { w: el?.clientWidth ?? 1, h: el?.clientHeight ?? 1 };
  };
  const sidePanel = () => (size().w >= 1024 ? 300 : 0);
  const snap = () => { const c = cam.current; c.x.value = c.x.target; c.y.value = c.y.target; c.k.value = c.k.target; c.x.velocity = c.y.velocity = c.k.velocity = 0; };

  const fit = useCallback((instant = false) => {
    const b = modelRef.current?.brain;
    if (!b) return;
    const bb = brainBounds(b);
    const { w, h } = size();
    const side = sidePanel();
    const k = Math.min(1.5, Math.max(K_MIN, Math.min((w - side - 60) / (bb.maxX - bb.minX), (h - 150) / (bb.maxY - bb.minY))));
    fitK.current = k;
    const c = cam.current;
    c.x.target = (bb.minX + bb.maxX) / 2 + side / 2 / k; c.y.target = (bb.minY + bb.maxY) / 2 - 10 / k; c.k.target = k; c.dim.target = 0;
    if (instant || reduced.current) snap();
  }, []);

  /** Dendrite labels fade in as you zoom past the overview. */
  const tipAlpha = () => Math.max(0, Math.min(1, (cam.current.k.value / fitK.current - 1.5) / 0.5));

  const flyTo = useCallback((n: Neuron | null) => {
    setFocusKey(n?.key ?? null);
    if (!n) { fit(); return; }
    const { w, h } = size();
    const side = sidePanel();
    const c = cam.current;
    const k = Math.max(fitK.current * 2.1, Math.min((w - side) / (side ? 420 : 290), (h - 160) / 330));
    // aim a little beyond the cell body, where its dendrites are
    c.k.target = k; c.x.target = n.x + Math.cos(n.angle) * 45 + side / 2 / k; c.y.target = n.y + Math.sin(n.angle) * 45; c.dim.target = 1;
    if (reduced.current) snap();
  }, [fit]);

  const fitted = useRef(false);
  useEffect(() => {
    if (model && !fitted.current) { fitted.current = true; fit(true); born.current = performance.now(); }
  }, [model, fit]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.current = mq.matches;
    const on = () => { reduced.current = mq.matches; };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0, last = performance.now(), dpr = 1;
    const resize = () => {
      const { w, h } = size();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      if (fitted.current && !focusRef.current) fit(true);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapRef.current!);
    const frame = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const c = cam.current;
      if (!dragging.current) { c.x = stepSpring(c.x, dt, 1, 0.55); c.y = stepSpring(c.y, dt, 1, 0.55); }
      if (!pinching.current) c.k = stepSpring(c.k, dt, 1, 0.55);
      c.dim = stepSpring(c.dim, dt, 1, 0.35);
      pressRef.current.s = stepSpring(pressRef.current.s, dt, 1, 0.18);
      draw(ctx, now, dpr);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw(ctx: CanvasRenderingContext2D, now: number, dpr: number) {
    const { w, h } = size();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    const m = modelRef.current;
    if (!m) return;
    const b: Brain = m.brain;
    const c = cam.current;
    const k = c.k.value;
    const calm = reduced.current;
    const t = calm ? 0 : now / 1000;
    const grow = calm ? 1 : Math.max(0, Math.min(1, (now - born.current) / 1600)); // the brain grows out of the core on arrival
    const ease = 1 - Math.pow(1 - grow, 3);
    const f = focusRef.current;
    const dimOf = (key: string) => (f && f !== key ? 1 - 0.8 * c.dim.value : 1);
    const sx = (x: number) => (x - c.x.value) * k + w / 2;
    const sy = (y: number) => (y - c.y.value) * k + h / 2;

    // world space, light adds up where filaments cross
    ctx.save();
    ctx.translate(w / 2, h / 2); ctx.scale(k, k); ctx.translate(-c.x.value, -c.y.value);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    const px = 1 / k;

    const strand = (cv: Curve, color: string, width: number, alpha: number, phase: number, progress = 1, glow = true) => {
      const s1 = Math.sin(t * 0.55 + phase) * 5, s2 = Math.cos(t * 0.45 + phase * 1.7) * 7; // slow sway, like something alive
      ctx.beginPath();
      ctx.moveTo(cv.p0[0], cv.p0[1]);
      ctx.bezierCurveTo(cv.p1[0] + s1, cv.p1[1] + s2, cv.p2[0] + s2, cv.p2[1] + s1, cv.p3[0], cv.p3[1]);
      if (progress < 1) ctx.setLineDash([cv.len * 1.25 * progress, cv.len * 3]);
      if (glow) { ctx.strokeStyle = `hsla(${color},${alpha * 0.16})`; ctx.lineWidth = width * 5 + 3 * px; ctx.stroke(); }
      ctx.strokeStyle = `hsla(${color},${alpha})`; ctx.lineWidth = width; ctx.stroke();
      ctx.setLineDash([]);
    };

    // core filaments
    b.coreWisps.forEach((wsp, i) => strand(wsp.curve, `${wsp.hue},100%,68%`, 0.7 * Math.max(px, 0.7), 0.32 * (f ? 1 - 0.6 * c.dim.value : 1), i * 1.3, ease, false));

    for (const n of b.neurons) {
      const a = dimOf(n.key) * (n.dim ? 0.5 : 1);
      const col = `${n.hue},100%,${n.dim ? 70 : 64}%`;
      const p1 = Math.min(1, ease * 1.6), p2 = Math.max(0, Math.min(1, (grow - 0.45) / 0.55));
      strand(n.axon, col, (1 + n.weight * 1.6) * Math.max(px, 0.8), 0.9 * a, n.index, p1);
      if (p2 > 0) {
        n.wisps.forEach((wsp, i) => strand(wsp, col, 0.6 * Math.max(px, 0.7), 0.4 * a, n.index + i * 2.1, p2, false));
        n.tips.forEach((tp, i) => strand(tp.curve, tp.slot ? "215,25%,70%" : col, 0.9 * Math.max(px, 0.75), (tp.slot ? 0.35 : 0.8) * a, n.index * 3 + i, p2, !tp.slot));
      }
      // signals travelling along the axon: busier clients fire more often
      if (!calm && grow >= 1 && !n.dim) {
        const count = 1 + Math.round(n.weight * 3);
        for (let i = 0; i < count; i++) {
          const u = (t * (0.16 + n.weight * 0.14) + i / count + n.index * 0.37) % 1;
          for (let tr = 0; tr < 4; tr++) {
            const [qx, qy] = bez(n.axon, Math.max(0, u - tr * 0.012));
            ctx.fillStyle = `hsla(${n.hue},100%,${88 - tr * 6}%,${(0.9 - tr * 0.2) * a * Math.sin(u * Math.PI)})`;
            ctx.beginPath(); ctx.arc(qx, qy, (2.4 - tr * 0.4) * Math.max(px, 0.9), 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      // cell body
      const press = pressRef.current.id === n.key ? pressRef.current.s.value : 1;
      const breathe = calm ? 1 : 1 + Math.sin(t * 1.3 + n.index) * 0.05;
      const r = R_SOMA * (n.dim ? 0.62 : 0.8 + n.weight * 0.45) * press * breathe * Math.min(1, p1 * 1.2);
      const hot = hoverRef.current === n.key || f === n.key;
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3.2);
      g.addColorStop(0, `hsla(${n.hue},100%,92%,${a})`);
      g.addColorStop(0.16, `hsla(${n.hue},100%,66%,${0.85 * a})`);
      g.addColorStop(0.45, `hsla(${n.hue},100%,55%,${(hot ? 0.34 : 0.2) * a})`);
      g.addColorStop(1, `hsla(${n.hue},100%,50%,0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, r * 3.2, 0, Math.PI * 2); ctx.fill();
      if (n.alert && !calm) {
        const ph = (t % 1.5) / 1.5;
        ctx.strokeStyle = `rgba(255,90,90,${0.9 * (1 - ph)})`; ctx.lineWidth = 2 * px;
        ctx.beginPath(); ctx.arc(n.x, n.y, r * (1.2 + ph * 2.2), 0, Math.PI * 2); ctx.stroke();
      }
      // dendrite tips
      if (p2 > 0.9) for (const tp of n.tips) {
        if (tp.slot) {
          ctx.strokeStyle = `rgba(190,205,230,${0.6 * a})`; ctx.lineWidth = 1 * Math.max(px, 0.8); ctx.setLineDash([2.5, 2.5]);
          ctx.beginPath(); ctx.arc(tp.x, tp.y, 4.2, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        } else {
          const tg = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, 9);
          tg.addColorStop(0, `rgba(255,255,255,${a})`); tg.addColorStop(0.3, `rgba(${TONE[tp.tone]},${0.9 * a})`); tg.addColorStop(1, `rgba(${TONE[tp.tone]},0)`);
          ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(tp.x, tp.y, 9, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // the core: a bright vertical seam of light
    const cb = calm ? 1 : 1 + Math.sin(t * 0.9) * 0.04;
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 210 * cb);
    halo.addColorStop(0, "rgba(120,200,255,0.5)"); halo.addColorStop(0.3, "rgba(70,120,255,0.2)"); halo.addColorStop(1, "rgba(40,60,255,0)");
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, 210 * cb, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.scale(0.42, 1);
    const seam = ctx.createRadialGradient(0, 0, 0, 0, 0, 92 * cb);
    seam.addColorStop(0, "rgba(255,255,255,1)"); seam.addColorStop(0.35, "rgba(170,230,255,0.95)"); seam.addColorStop(1, "rgba(60,150,255,0)");
    ctx.fillStyle = seam; ctx.beginPath(); ctx.arc(0, 0, 92 * cb, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.restore();

    // ---------- labels, in screen space so they stay crisp ----------
    ctx.globalCompositeOperation = "source-over";
    const hide = isPrivate();
    const show = (s: string) => (hide && s.includes("€") ? "€ •••" : s);
    ctx.shadowColor = "rgba(0,0,0,0.95)"; ctx.shadowBlur = 8;
    if (grow >= 0.5) {
      ctx.globalAlpha = Math.min(1, (grow - 0.5) * 2) * (f ? 1 - 0.6 * c.dim.value : 1);
      label(ctx, "Solyn", sx(0), sy(0) + 112 * k + 6, Math.max(11, Math.min(20, 15 * k + 4)), "#ffffff", 700, "center");
      label(ctx, show(`${formatCurrency(m.mrr)}/mnd`), sx(0), sy(0) + 112 * k + 6 + Math.max(13, Math.min(22, 15 * k + 6)), Math.max(10, Math.min(15, 11 * k + 4)), "rgba(170,225,255,0.9)", 600, "center");
    }
    const ta = tipAlpha();
    for (const n of b.neurons) {
      const a = dimOf(n.key) * Math.max(0, Math.min(1, (grow - 0.6) / 0.4));
      if (a <= 0.02) continue;
      const x = sx(n.x), y = sy(n.y);
      if (x < -200 || x > w + 200 || y < -80 || y > h + 80) continue;
      // name sits on the inner side of the cell body, away from its dendrites
      const inward = n.angle + Math.PI, off = R_SOMA * k * 1.5 + 16;
      const lx = x + Math.cos(inward) * off, ly = y + Math.sin(inward) * off * 0.8;
      const fs = Math.max(10.5, Math.min(16, 11 * Math.sqrt(k) + 3));
      const visible = !n.dim || k / fitK.current > 1.25 || hoverRef.current === n.key || f === n.key;
      if (visible) {
        ctx.globalAlpha = a * (n.dim ? 0.7 : 1);
        label(ctx, n.label, lx, ly, fs, "#fff", 650, "center");
        if (k > 0.7 || f === n.key) label(ctx, show(n.value), lx, ly + fs * 1.15, fs * 0.82, `hsla(${n.hue},100%,78%,0.95)`, 550, "center");
      }
      if (ta > 0.02) for (const tp of n.tips) {
        const tx = sx(tp.x), ty = sy(tp.y);
        const right = Math.cos(tp.angle) >= 0;
        ctx.globalAlpha = a * ta * (tp.slot ? 0.6 : 1);
        const fst = Math.max(9.5, Math.min(13, 4 * k + 2));
        label(ctx, tp.label, tx + (right ? 12 : -12), ty - 1, fst, "#fff", 600, right ? "left" : "right");
        if (tp.sub) label(ctx, show(tp.sub), tx + (right ? 12 : -12), ty + fst * 1.05, fst * 0.88, `rgba(${TONE[tp.tone]},0.95)`, 500, right ? "left" : "right");
      }
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  // ---------- gestures: pan with momentum, pinch and wheel zoom around the pointer, tap to fly in ----------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragging = useRef(false);
  const pinching = useRef(false);
  const gesture = useRef({ sx: 0, sy: 0, moved: false, hist: [] as { x: number; y: number; t: number }[], pinch: { d: 0, k: 0, wx: 0, wy: 0 } });

  const toWorld = (px: number, py: number) => {
    const { w, h } = size();
    const c = cam.current;
    return { x: (px - w / 2) / c.k.value + c.x.value, y: (py - h / 2) / c.k.value + c.y.value };
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hitAt = (px: number, py: number) => {
    const b = modelRef.current?.brain;
    if (!b) return null;
    const p = toWorld(px, py);
    return hitBrain(b, p.x, p.y, 14 / cam.current.k.value, tipAlpha() > 0.5);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    canvasRef.current!.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const c = cam.current;
    c.x.target = c.x.value; c.y.target = c.y.value; c.x.velocity = c.y.velocity = 0; // grabbing stops any flight on the spot
    if (pointers.current.size === 1) {
      gesture.current = { ...gesture.current, sx: p.x, sy: p.y, moved: false, hist: [{ ...p, t: performance.now() }] };
      const hit = hitAt(p.x, p.y);
      pressRef.current.id = hit && !hit.tip ? hit.neuron.key : null;
      pressRef.current.s.target = pressRef.current.id ? 0.86 : 1; // feedback on press, not on release
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const wp = toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture.current.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: c.k.value, wx: wp.x, wy: wp.y };
      pinching.current = true; dragging.current = true; gesture.current.moved = true;
      pressRef.current.s.target = 1;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = local(e);
    if (!pointers.current.has(e.pointerId)) {
      if (e.pointerType === "mouse") { const hit = hitAt(p.x, p.y); hoverRef.current = hit?.neuron.key ?? null; canvasRef.current!.style.cursor = hit ? "pointer" : "grab"; }
      return;
    }
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, p);
    const c = cam.current, g = gesture.current;
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      let k = g.pinch.k * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, g.pinch.d));
      if (k > K_MAX) k = K_MAX + (k - K_MAX) * 0.25; else if (k < K_MIN) k = K_MIN - (K_MIN - k) * 0.25; // soft limits
      const { w, h } = size();
      c.k.value = c.k.target = k;
      c.x.value = c.x.target = g.pinch.wx - ((a.x + b.x) / 2 - w / 2) / k;
      c.y.value = c.y.target = g.pinch.wy - ((a.y + b.y) / 2 - h / 2) / k;
      return;
    }
    if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) < 6) return;
    if (!g.moved) { g.moved = true; dragging.current = true; pressRef.current.s.target = 1; canvasRef.current!.style.cursor = "grabbing"; }
    c.x.value -= (p.x - prev.x) / c.k.value; c.y.value -= (p.y - prev.y) / c.k.value; // 1:1 with the finger
    c.x.target = c.x.value; c.y.target = c.y.value;
    g.hist.push({ ...p, t: performance.now() });
    if (g.hist.length > 6) g.hist.shift();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = local(e);
    pointers.current.delete(e.pointerId);
    const c = cam.current, g = gesture.current;
    pressRef.current.s.target = 1;
    if (pinching.current) {
      if (pointers.current.size < 2) {
        pinching.current = false;
        c.k.target = Math.min(K_MAX, Math.max(K_MIN, c.k.value));
        if (pointers.current.size === 1) g.hist = [{ ...[...pointers.current.values()][0], t: performance.now() }];
      }
      if (pointers.current.size === 0) dragging.current = false;
      return;
    }
    if (pointers.current.size > 0) return;
    canvasRef.current!.style.cursor = "grab";
    if (!g.moved) {
      dragging.current = false;
      const hit = hitAt(p.x, p.y);
      if (!hit) { flyTo(null); return; }
      if (hit.tip?.ref) navigate({ to: "/status/$id", params: { id: hit.tip.ref.id } });
      else if (hit.tip?.slot) toast("Vrije plaats voor een agent", { description: `Hier koppel je straks een agent aan ${hit.neuron.label}.` });
      else flyTo(hit.neuron);
      return;
    }
    dragging.current = false;
    // hand the finger's speed to the camera and let it glide to where the flick was heading
    const hs = g.hist, a = hs[0], b = hs[hs.length - 1];
    if (performance.now() - b.t < 80 && hs.length > 1) {
      const dt = Math.max(1, b.t - a.t);
      const vx = ((b.x - a.x) / dt) * 1000, vy = ((b.y - a.y) / dt) * 1000;
      c.x.velocity = -vx / c.k.value; c.y.velocity = -vy / c.k.value;
      c.x.target = c.x.value - project(vx, 0.996) / c.k.value;
      c.y.target = c.y.value - project(vy, 0.996) / c.k.value;
    }
  };

  useEffect(() => {
    const el = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = cam.current;
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40);
      if (e.ctrlKey || e.metaKey || mouseWheel) {
        const before = toWorld(px, py);
        const k = Math.min(K_MAX, Math.max(K_MIN, c.k.value * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018))));
        const { w, h } = size();
        c.k.value = c.k.target = k; c.k.velocity = 0;
        c.x.value = c.x.target = before.x - (px - w / 2) / k;
        c.y.value = c.y.target = before.y - (py - h / 2) / k;
      } else {
        c.x.value = c.x.target = c.x.value + e.deltaX / c.k.value;
        c.y.value = c.y.target = c.y.value + e.deltaY / c.k.value;
      }
      c.x.velocity = c.y.velocity = 0;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoomBy = (f: number) => { const c = cam.current; c.k.target = Math.min(K_MAX, Math.max(K_MIN, c.k.target * f)); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      const c = cam.current, step = 80 / c.k.target;
      if (e.key === "Escape" || e.key === "0") flyTo(null);
      else if (e.key === "+" || e.key === "=") zoomBy(1.4);
      else if (e.key === "-") zoomBy(1 / 1.4);
      else if (e.key === "ArrowLeft") c.x.target -= step;
      else if (e.key === "ArrowRight") c.x.target += step;
      else if (e.key === "ArrowUp") c.y.target -= step;
      else if (e.key === "ArrowDown") c.y.target += step;
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flyTo]);

  const stats = useMemo(() => {
    if (!data || !brain) return null;
    const up = data.sites.filter((s) => s.last_status === "up" || s.last_status === "degraded").length;
    return {
      clients: brain.neurons.filter((n) => !n.dim).length, prospects: brain.neurons.filter((n) => n.dim).length,
      sites: `${up}/${data.sites.length}`, down: up < data.sites.length,
      slots: brain.neurons.reduce((a, n) => a + n.tips.filter((t) => t.slot).length, 0),
    };
  }, [data, brain]);

  const glass = "border border-sky-300/15 bg-[rgba(8,12,28,0.62)] backdrop-blur-2xl backdrop-saturate-150 shadow-[0_10px_40px_rgba(0,0,0,0.5)]";

  return (
    <div ref={wrapRef} className="fixed inset-0 lg:left-56 lg:top-16 overflow-hidden select-none" style={{ background: "#02030a" }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 60% at 45% 50%, rgba(40,70,255,0.16), transparent 70%), radial-gradient(35% 40% at 80% 15%, rgba(190,60,255,0.07), transparent 70%)" }} />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none cursor-grab"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => { hoverRef.current = null; }}
        aria-label="Brain: elke klant is een neuron rond de kern van Solyn"
        role="img"
      />

      {/* core read-out */}
      <div className={`absolute left-3 top-[calc(0.75rem+env(safe-area-inset-top))] lg:left-5 lg:top-5 rounded-2xl px-4 py-3 ${glass} pop-in`}>
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-sky-300" />
          <h1 className="text-base font-semibold tracking-tight">Brain</h1>
          <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-sky-300"><span className="w-1.5 h-1.5 rounded-full bg-sky-300" />live</span>
        </div>
        {stats && model ? (
          <dl className="mt-2 grid grid-cols-4 lg:grid-cols-2 gap-x-5 gap-y-1.5 text-xs">
            <Stat label="Per maand" value={formatCurrency(model.mrr)} />
            <Stat label="Neuronen" value={`${stats.clients} + ${stats.prospects}`} />
            <Stat label="Sites online" value={stats.sites} warn={stats.down} />
            <Stat label="Agents" value={`0 / ${stats.slots}`} />
          </dl>
        ) : <div className="text-xs text-white/55 mt-1">Het brein wordt opgebouwd…</div>}
      </div>

      {/* neuron index (desktop): every client, one tap away */}
      {brain && (
        <aside className={`hidden lg:flex absolute right-5 top-5 bottom-5 w-[17.5rem] flex-col rounded-3xl ${glass}`}>
          <div className="px-4 pt-4 pb-2 text-xs font-medium text-white/50">Neuronen</div>
          <ul className="flex-1 overflow-y-auto px-2 pb-2 overscroll-contain">
            {brain.neurons.map((n) => (
              <li key={n.key}>
                <button type="button" onClick={() => flyTo(n)} aria-current={focusKey === n.key}
                  className={`press w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${focusKey === n.key ? "bg-white/10" : "hover:bg-white/5"}`}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: `hsl(${n.hue} 100% 64%)`, boxShadow: `0 0 10px hsl(${n.hue} 100% 60%)`, opacity: n.dim ? 0.5 : 1 }} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm truncate ${n.dim ? "text-white/60" : "font-medium"}`}>{n.label}</span>
                    <span className="block text-[11px] text-white/45 tabular-nums truncate">{n.value}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-white/35">0 agents</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}

      <div className={`absolute right-3 lg:right-[19.5rem] bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-5 rounded-full p-1 flex lg:flex-col gap-1 ${glass} ${focus ? "max-lg:hidden" : ""}`}>
        <HudButton label="Inzoomen" onClick={() => zoomBy(1.4)}><Plus className="w-4 h-4" /></HudButton>
        <HudButton label="Uitzoomen" onClick={() => zoomBy(1 / 1.4)}><Minus className="w-4 h-4" /></HudButton>
        <HudButton label="Alles tonen" onClick={() => flyTo(null)}><Maximize2 className="w-4 h-4" /></HudButton>
      </div>

      {/* where am I, and the way out */}
      <div
        aria-hidden={!focus}
        className={`absolute left-1/2 lg:left-[calc(50%-9.5rem)] -translate-x-1/2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-5 max-w-[calc(100vw-1.5rem)] rounded-full p-1 flex items-center gap-1 ${glass}
          transition-[transform,opacity,filter] duration-300 ease-out motion-reduce:transition-opacity
          ${focus ? "opacity-100 translate-y-0 blur-0" : "pointer-events-none opacity-0 translate-y-4 blur-sm"}`}
      >
        <button type="button" onClick={() => flyTo(null)} className="press h-10 px-3 rounded-full inline-flex items-center gap-1.5 text-sm text-white/80 hover:bg-white/10 whitespace-nowrap">
          <ArrowLeft className="w-4 h-4" /> Brein
        </button>
        <span className="px-2 text-sm font-semibold truncate min-w-0">{focus?.label}</span>
        {focus && <Link to="/clients/$id" params={{ id: focus.key }} className="press h-10 px-4 rounded-full bg-white text-black text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap">Open klant <ArrowRight className="w-4 h-4" /></Link>}
      </div>

      {brain && (
        <nav className="sr-only lg:hidden" aria-label="Neuronen">
          {brain.neurons.map((n) => <button key={n.key} onClick={() => flyTo(n)}>{n.label}: {n.value}</button>)}
        </nav>
      )}
    </div>
  );
}

function label(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight: number, align: CanvasTextAlign) {
  ctx.font = `${weight} ${size}px system-ui, -apple-system, "SF Pro Text", Inter, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(s.length > 24 ? s.slice(0, 23) + "…" : s, x, y);
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] text-white/45">{label}</dt>
      <dd className={`font-semibold tabular-nums ${warn ? "text-red-400" : "text-white"}`}>{value}</dd>
    </div>
  );
}

function HudButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="hit press w-9 h-9 rounded-full grid place-items-center text-white/80 hover:bg-white/10 active:bg-white/15">
      {children}
    </button>
  );
}
