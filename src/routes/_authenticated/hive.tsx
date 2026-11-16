import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hexagon, Maximize2, Minus, Plus, X, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { clientMRR, type FeeClient } from "@/lib/fees";
import { formatCurrency, formatDate } from "@/lib/format";
import { isPrivate } from "@/lib/privacy";
import { bounds, buildHive, hitTest, project, stepSpring, type HiveNode, type Spring, type Tone } from "@/lib/hive";

export const Route = createFileRoute("/_authenticated/hive")({
  component: HivePage,
  head: () => ({ meta: [{ title: "Hive Mind · Solyn" }] }),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type ClientRow = FeeClient & { id: string; name: string; status: string; pipeline_stage?: string | null; health?: string | null; location?: string | null; social_monthly_fee?: number | null; notes?: string | null };
type SiteRow = { id: string; client_id: string | null; name: string; url: string; last_status: string | null; last_response_ms: number | null; is_critical: boolean; last_backup_at: string | null };
type InvoiceRow = { id: string; client: string | null; total: number; status: string; date: string; invoice_number: number; scheduled_send_at: string | null; repeat_monthly: boolean; next_repeat_on: string | null };
type RecordRow = { id: string; site_id: string; kind: string; title: string | null; customer_name: string | null; starts_at: string | null; source_created_at: string | null };
type Data = { clients: ClientRow[]; sites: SiteRow[]; invoices: InvoiceRow[]; records: RecordRow[]; visits: Record<string, number> };

const RGB: Record<Tone, string> = {
  gold: "214,178,94", green: "52,211,153", amber: "245,158,11", red: "248,113,113", sky: "56,189,248", violet: "167,139,250", grey: "140,140,150",
};
const K_MIN = 0.22, K_MAX = 5;

const isPlanned = (v: InvoiceRow) => (v.status === "Draft" && !!v.scheduled_send_at) || (v.repeat_monthly && !!v.next_repeat_on);

function HivePage() {
  const [data, setData] = useState<Data | null>(null);
  const [focus, setFocus] = useState<HiveNode | null>(null);
  const [hover, setHover] = useState<HiveNode | null>(null);

  // ---------- data (refreshes every minute) ----------
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const today = new Date();
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const since = new Date(today.getTime() - 30 * 864e5);
      const yday = iso(new Date(today.getTime() - 864e5));
      const [c, s, i, r, v] = await Promise.all([
        supabase.from("clients").select("*"),
        db.from("monitored_sites").select("id,client_id,name,url,last_status,last_response_ms,is_critical,last_backup_at").eq("enabled", true).order("name"),
        db.from("invoices").select("id,client,total,status,date,invoice_number,scheduled_send_at,repeat_monthly,next_repeat_on").order("date", { ascending: false }),
        db.from("site_records").select("id,site_id,kind,title,customer_name,starts_at,source_created_at").neq("kind", "blokkade").gte("source_created_at", since.toISOString()).order("source_created_at", { ascending: false }).limit(400),
        db.from("site_visits_daily").select("site_id,visitors").eq("day", yday),
      ]);
      if (!alive) return;
      const visits: Record<string, number> = {};
      for (const x of v.data ?? []) visits[x.site_id] = (visits[x.site_id] ?? 0) + (x.visitors ?? 0);
      setData({ clients: (c.data as unknown as ClientRow[]) ?? [], sites: s.data ?? [], invoices: i.data ?? [], records: r.data ?? [], visits });
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const world = useMemo(() => {
    if (!data) return null;
    const clients = data.clients.filter((c) => c.status === "Active" || c.status === "Prospect");
    const mrr = clients.filter((c) => c.status === "Active").reduce((a, c) => a + clientMRR(c), 0);
    return {
      mrr,
      ...buildHive({
        mrr,
        clients: clients.map((c) => ({ id: c.id, name: c.name, status: c.status, stage: c.pipeline_stage, health: c.health, mrr: clientMRR(c), location: c.location })),
        sites: data.sites.map((s) => ({ id: s.id, client_id: s.client_id, name: s.name, status: s.last_status, ms: s.last_response_ms, critical: s.is_critical, visitors: data.visits[s.id] ?? 0 })),
        invoices: data.invoices.map((v) => ({ id: v.id, client: v.client, total: Number(v.total || 0), status: v.status, planned: isPlanned(v), nr: String(v.invoice_number), date: v.date })),
        records: data.records.map((r) => ({ id: r.id, site_id: r.site_id, kind: r.kind, title: r.customer_name || r.title || r.kind, when: r.source_created_at || r.starts_at || "" })),
      }),
    };
  }, [data]);

  // ---------- canvas world ----------
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cam = useRef({ x: { value: 0, velocity: 0, target: 0 } as Spring, y: { value: 0, velocity: 0, target: 0 } as Spring, k: { value: 0.6, velocity: 0, target: 0.6 } as Spring, dim: { value: 0, velocity: 0, target: 0 } as Spring });
  const worldRef = useRef(world);
  const focusRef = useRef<HiveNode | null>(null);
  const hoverRef = useRef<HiveNode | null>(null);
  const pressRef = useRef<{ id: string | null; s: Spring }>({ id: null, s: { value: 1, velocity: 0, target: 1 } });
  const reduced = useRef(false);
  const born = useRef(0);
  const dataRef = useRef<Data | null>(null);
  dataRef.current = data;
  worldRef.current = world;
  focusRef.current = focus;
  hoverRef.current = hover;

  const size = () => {
    const el = wrapRef.current;
    return { w: el?.clientWidth ?? 1, h: el?.clientHeight ?? 1 };
  };
  const panelOffset = () => {
    const { w } = size();
    return w >= 1024 ? 200 : 0; // keep the focused world left of the desktop panel
  };

  const fit = useCallback((instant = false) => {
    const wd = worldRef.current;
    if (!wd) return;
    const b = bounds(wd.nodes);
    const { w, h } = size();
    const k = Math.min(K_MAX, Math.max(K_MIN, Math.min(w / (b.maxX - b.minX + 160), h / (b.maxY - b.minY + 200))));
    const c = cam.current;
    c.x.target = (b.minX + b.maxX) / 2; c.y.target = (b.minY + b.maxY) / 2; c.k.target = k; c.dim.target = 0;
    if (instant || reduced.current) { c.x.value = c.x.target; c.y.value = c.y.target; c.k.value = k; c.x.velocity = c.y.velocity = c.k.velocity = 0; }
  }, []);

  const flyTo = useCallback((n: HiveNode | null) => {
    setFocus(n);
    const c = cam.current;
    if (!n || n.kind === "core") { fit(); return; }
    const k = n.kind === "client" ? 2.1 : n.kind === "prospect" ? 2.4 : n.kind === "site" ? 3.2 : 3.6;
    c.k.target = k;
    c.x.target = n.x + panelOffset() / k;
    c.y.target = n.y + (size().w < 1024 ? 120 / k : 0); // mobile: sheet covers the bottom, lift the world
    c.dim.target = 1;
    if (reduced.current) { c.x.value = c.x.target; c.y.value = c.y.target; c.k.value = k; }
  }, [fit]);

  // first layout: fit once data is there
  const fitted = useRef(false);
  useEffect(() => {
    if (world && !fitted.current) { fitted.current = true; fit(true); born.current = performance.now(); }
  }, [world, fit]);

  // keep the focused node fresh after a data refresh
  useEffect(() => {
    if (focus && world) setFocus(world.nodes.find((n) => n.id === focus.id) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.current = mq.matches;
    const on = () => { reduced.current = mq.matches; };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // ---------- render loop ----------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0, last = performance.now();
    const resize = () => {
      const { w, h } = size();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapRef.current!);

    const frame = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const c = cam.current;
      if (!dragging.current) { c.x = stepSpring(c.x, dt, 1, 0.5); c.y = stepSpring(c.y, dt, 1, 0.5); }
      if (!pinching.current) c.k = stepSpring(c.k, dt, 1, 0.45);
      c.dim = stepSpring(c.dim, dt, 1, 0.35);
      const p = pressRef.current; p.s = stepSpring(p.s, dt, 1, 0.18);
      draw(ctx, now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw(ctx: CanvasRenderingContext2D, now: number) {
    const { w, h } = size();
    ctx.clearRect(0, 0, w, h);
    const wd = worldRef.current;
    if (!wd) return;
    const c = cam.current;
    const k = c.k.value, cx = c.x.value, cy = c.y.value;
    const sx = (x: number) => (x - cx) * k + w / 2;
    const sy = (y: number) => (y - cy) * k + h / 2;
    const t = now / 1000;
    const calm = reduced.current;
    const intro = calm ? 1 : Math.min(1, (now - born.current) / 1100);

    // hive lattice, drifting at half speed for depth
    const cell = 64;
    const hk = k * 0.5 + 0.25;
    if (cell * hk > 14) {
      ctx.strokeStyle = "rgba(255,255,255,0.035)";
      ctx.lineWidth = 1;
      const s = cell * hk, hgt = s * Math.sqrt(3);
      const ox = (-cx * k * 0.5 + w / 2) % (s * 3), oy = (-cy * k * 0.5 + h / 2) % hgt;
      ctx.beginPath();
      for (let col = -2; col * s * 1.5 < w + s * 3; col++) {
        for (let row = -2; row * hgt < h + hgt * 2; row++) {
          const x = ox + col * s * 1.5, y = oy + row * hgt + (col % 2 ? hgt / 2 : 0);
          hexPath(ctx, x, y, s * 0.5, false);
        }
      }
      ctx.stroke();
    }

    const byId = new Map(wd.nodes.map((n) => [n.id, n]));
    const f = focusRef.current;
    const related = new Set<string>();
    if (f) {
      related.add(f.id);
      let p = f.parent; while (p) { related.add(p); p = byId.get(p)?.parent; }
      for (const n of wd.nodes) { let q: string | undefined = n.parent; while (q) { if (q === f.id) { related.add(n.id); break; } q = byId.get(q)?.parent; } }
    }
    const alphaOf = (id: string) => (f && !related.has(id) ? 1 - 0.85 * c.dim.value : 1);

    // nodes grow out of their parent on first open
    const pos = (n: HiveNode): { x: number; y: number } => {
      if (intro >= 1) return { x: n.x, y: n.y };
      const depth = n.kind === "core" ? 0 : n.kind === "client" || n.kind === "prospect" ? 1 : n.kind === "site" || n.kind === "invoice" ? 2 : 3;
      const local = Math.max(0, Math.min(1, (intro - depth * 0.12) / 0.64));
      const e = 1 - Math.pow(1 - local, 3);
      const par = n.parent ? byId.get(n.parent) : undefined;
      const from: { x: number; y: number } = par ? pos(par) : { x: 0, y: 0 };
      return { x: from.x + (n.x - from.x) * e, y: from.y + (n.y - from.y) * e };
    };

    // edges + flow
    for (const e of wd.edges) {
      const a = byId.get(e.from), b = byId.get(e.to);
      if (!a || !b) continue;
      const pa = pos(a), pb = pos(b);
      // links start and end at the node's edge, never through it
      const L = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1, ux = (pb.x - pa.x) / L, uy = (pb.y - pa.y) / L;
      const ra = a.r + (a.kind === "client" ? 14 : 2), rb = b.r + (b.kind === "client" ? 14 : 4);
      if (L < ra + rb) continue;
      const x1 = sx(pa.x + ux * ra), y1 = sy(pa.y + uy * ra), x2 = sx(pb.x - ux * rb), y2 = sy(pb.y - uy * rb);
      const mx = (x1 + x2) / 2 + (y2 - y1) * 0.12, my = (y1 + y2) / 2 - (x2 - x1) * 0.12;
      const al = Math.min(alphaOf(e.from), alphaOf(e.to));
      const lit = f && related.has(e.from) && related.has(e.to);
      ctx.strokeStyle = `rgba(${RGB[e.tone]},${(lit ? 0.45 : e.tone === "violet" ? 0.12 : 0.2) * al})`;
      ctx.lineWidth = lit ? 1.6 : 1;
      if (e.tone === "violet" && a.kind === "prospect") ctx.setLineDash([3, 5]); else ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke();
      ctx.setLineDash([]);
      if (!calm && e.flow > 0 && intro >= 1) {
        const n = Math.ceil(e.flow * 4);
        for (let i = 0; i < n; i++) {
          const u = (t * (0.12 + e.flow * 0.18) + i / n + (e.from.length % 7) / 7) % 1;
          const px = (1 - u) ** 2 * x1 + 2 * (1 - u) * u * mx + u * u * x2;
          const py = (1 - u) ** 2 * y1 + 2 * (1 - u) * u * my + u * u * y2;
          const fade = Math.sin(u * Math.PI);
          ctx.fillStyle = `rgba(${RGB[e.tone]},${0.85 * fade * al})`;
          ctx.beginPath(); ctx.arc(px, py, Math.max(1.2, 1.8 * Math.min(1.6, k)), 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // nodes, small on top of big
    const order = [...wd.nodes].sort((a, b) => b.r - a.r);
    const hv = hoverRef.current;
    for (const n of order) {
      const p = pos(n);
      const x = sx(p.x), y = sy(p.y);
      const press = pressRef.current.id === n.id ? pressRef.current.s.value : 1;
      const r = n.r * k * press;
      if (x < -r - 200 || x > w + r + 200 || y < -r - 60 || y > h + r + 60) continue;
      const al = alphaOf(n.id);
      const rgb = RGB[n.tone];
      ctx.globalAlpha = al;

      if (n.kind === "core") {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
        g.addColorStop(0, "rgba(244,227,177,0.55)"); g.addColorStop(0.35, "rgba(214,178,94,0.18)"); g.addColorStop(1, "rgba(214,178,94,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill();
        const g2 = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        g2.addColorStop(0, "#f4e3b1"); g2.addColorStop(0.55, "#d6b25e"); g2.addColorStop(1, "#a8792b");
        ctx.fillStyle = g2; ctx.beginPath(); hexPath(ctx, x, y, r, true); ctx.fill();
        ctx.save(); ctx.translate(x, y); ctx.rotate(calm ? 0 : t * 0.08);
        ctx.strokeStyle = "rgba(214,178,94,0.35)"; ctx.lineWidth = 1; ctx.beginPath(); hexPath(ctx, 0, 0, r * 1.32, true); ctx.stroke();
        ctx.restore();
        text(ctx, "Solyn", x, y - 2, Math.max(11, 15 * Math.min(1.4, k)), "#1a1406", 700);
        text(ctx, isPrivate() ? "€ •••/mnd" : `${formatCurrency(wd.mrr)}/mnd`, x, y + Math.max(11, 15 * Math.min(1.4, k)), Math.max(9, 10.5 * Math.min(1.4, k)), "rgba(26,20,6,0.75)", 600);
      } else if (n.kind === "client" || n.kind === "prospect") {
        const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.5, 0, x, y, r * 1.2);
        g.addColorStop(0, `rgba(${rgb},${n.kind === "prospect" ? 0.18 : 0.34})`); g.addColorStop(1, "rgba(18,18,20,0.96)");
        ctx.fillStyle = g; ctx.beginPath(); hexPath(ctx, x, y, r, true); ctx.fill();
        ctx.strokeStyle = `rgba(${rgb},${n.kind === "prospect" ? 0.5 : 0.85})`; ctx.lineWidth = hv?.id === n.id || f?.id === n.id ? 2 : 1.2;
        if (n.kind === "prospect") ctx.setLineDash([3, 3]);
        ctx.stroke(); ctx.setLineDash([]);
        if (k > 0.42 || f?.id === n.id || hv?.id === n.id) {
          const fs = Math.min(15, Math.max(11, 12.5 * Math.sqrt(k)));
          text(ctx, n.label, x, y + r + (n.kind === "client" ? 14 * k : 0) + fs + 3, fs, n.kind === "prospect" ? "rgba(255,255,255,0.6)" : "#fff", 600);
          if (n.kind === "client" && k > 0.8) text(ctx, clientSub(n, wd), x, y + r + 14 * k + fs * 2 + 4, fs * 0.78, "rgba(255,255,255,0.5)", 500);
          if (n.kind === "prospect" && k > 0.9) text(ctx, n.sub ?? "", x, y + r + fs * 2 + 4, fs * 0.78, "rgba(167,139,250,0.75)", 500);
        }
      } else if (n.kind === "site") {
        if (n.pulse && !calm) {
          const ph = (t % 1.6) / 1.6;
          ctx.strokeStyle = `rgba(${rgb},${0.6 * (1 - ph)})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, r + ph * 22 * Math.min(2, k), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = "rgba(14,14,16,0.95)"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(${rgb},0.95)`; ctx.lineWidth = Math.max(1.5, 2 * Math.min(1.5, k)); ctx.stroke();
        ctx.fillStyle = `rgba(${rgb},0.9)`; ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, Math.PI * 2); ctx.fill();
        if (k > 1.15 || hv?.id === n.id || f?.id === n.id) {
          const fs = Math.min(13, Math.max(10, 9 * Math.sqrt(k)));
          const par = n.parent ? byId.get(n.parent) : undefined;
          const showSub = !!n.sub && k > 1.8;
          // label on the side away from the link, so the line never runs through the text
          const ly = par && par.y > n.y ? y - r - 6 - (showSub ? fs * 0.95 : 0) : y + r + fs + 2;
          text(ctx, n.label, x, ly, fs, "rgba(255,255,255,0.85)", 600);
          if (showSub) text(ctx, n.sub!, x, ly + fs * 0.95, fs * 0.82, "rgba(255,255,255,0.45)", 500);
        }
      } else if (n.kind === "invoice") {
        ctx.fillStyle = `rgba(${rgb},0.9)`; ctx.beginPath(); ctx.arc(x, y, Math.max(1.6, r), 0, Math.PI * 2); ctx.fill();
        if (k > 2.6 || hv?.id === n.id) text(ctx, isPrivate() ? "€ •••" : n.sub ?? "", x, y - r - 5, 10, `rgba(${rgb},0.9)`, 600);
      } else {
        ctx.fillStyle = `rgba(${rgb},0.9)`;
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); const d = Math.max(1.6, r); ctx.fillRect(-d, -d, d * 2, d * 2); ctx.restore();
        if (k > 3 || hv?.id === n.id) text(ctx, n.label, x, y - r - 6, 10, "rgba(196,181,253,0.9)", 500);
      }
      ctx.globalAlpha = 1;
    }
  }

  function clientSub(n: HiveNode, wd: NonNullable<typeof world>) {
    const cl = dataRef.current?.clients.find((c) => c.id === n.refId);
    const m = cl ? clientMRR(cl) : 0;
    if (!m) return n.sub ?? "";
    return isPrivate() ? "€ •••/mnd" : `${formatCurrency(m)}/mnd`;
    void wd;
  }

  // ---------- gestures: pan with momentum, pinch and wheel zoom around the pointer, tap to fly ----------
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
  const nodeAt = (px: number, py: number) => {
    const wd = worldRef.current;
    if (!wd) return null;
    const p = toWorld(px, py);
    return hitTest(wd.nodes, p.x, p.y, 8 / cam.current.k.value);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    canvasRef.current!.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const c = cam.current;
    // grabbing stops any flight on the spot (interruptible)
    c.x.target = c.x.value; c.y.target = c.y.value; c.x.velocity = c.y.velocity = 0;
    if (pointers.current.size === 1) {
      gesture.current = { ...gesture.current, sx: p.x, sy: p.y, moved: false, hist: [{ ...p, t: performance.now() }] };
      const n = nodeAt(p.x, p.y);
      pressRef.current.id = n?.id ?? null;
      pressRef.current.s.target = n ? 0.92 : 1; // feedback on press, not on release
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const wp = toWorld(mid.x, mid.y);
      gesture.current.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: c.k.value, wx: wp.x, wy: wp.y };
      pinching.current = true; dragging.current = true; gesture.current.moved = true;
      pressRef.current.s.target = 1;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = local(e);
    if (!pointers.current.has(e.pointerId)) {
      if (e.pointerType === "mouse") { const n = nodeAt(p.x, p.y); if (n?.id !== hoverRef.current?.id) setHover(n); canvasRef.current!.style.cursor = n ? "pointer" : "grab"; }
      return;
    }
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, p);
    const c = cam.current, g = gesture.current;
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      let k = g.pinch.k * (d / Math.max(1, g.pinch.d));
      if (k > K_MAX) k = K_MAX + (k - K_MAX) * 0.25; else if (k < K_MIN) k = K_MIN - (K_MIN - k) * 0.25; // rubber-band the limits
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const { w, h } = size();
      c.k.value = c.k.target = k;
      c.x.value = c.x.target = g.pinch.wx - (mid.x - w / 2) / k;
      c.y.value = c.y.target = g.pinch.wy - (mid.y - h / 2) / k;
      return;
    }
    if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) < 6) return; // small hysteresis before a drag wins over a tap
    if (!g.moved) { g.moved = true; dragging.current = true; pressRef.current.s.target = 1; canvasRef.current!.style.cursor = "grabbing"; }
    // 1:1 with the finger
    c.x.value -= (p.x - prev.x) / c.k.value; c.y.value -= (p.y - prev.y) / c.k.value;
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
        c.k.target = Math.min(K_MAX, Math.max(K_MIN, c.k.value)); // spring back inside the limits
        if (pointers.current.size === 1) {
          const rest = [...pointers.current.values()][0];
          g.hist = [{ ...rest, t: performance.now() }];
        }
      }
      if (pointers.current.size === 0) dragging.current = false;
      return;
    }
    if (pointers.current.size > 0) return;
    canvasRef.current!.style.cursor = "grab";
    if (!g.moved) {
      dragging.current = false;
      const n = nodeAt(p.x, p.y);
      if (!n) { if (focusRef.current) flyTo(null); return; }
      flyTo(n.kind === "invoice" || n.kind === "record" ? (worldRef.current?.nodes.find((m) => m.id === n.parent) ?? n) : n);
      return;
    }
    dragging.current = false;
    // hand the finger's velocity to the camera and let it glide to the projected spot
    const hs = g.hist, a = hs[0], b = hs[hs.length - 1];
    const dt = Math.max(1, b.t - a.t);
    if (performance.now() - b.t < 80 && hs.length > 1) {
      const vx = ((b.x - a.x) / dt) * 1000, vy = ((b.y - a.y) / dt) * 1000;
      c.x.velocity = -vx / c.k.value; c.y.velocity = -vy / c.k.value;
      c.x.target = c.x.value - project(vx, 0.996) / c.k.value;
      c.y.target = c.y.value - project(vy, 0.996) / c.k.value;
    }
  };

  // wheel / trackpad: zoom around the pointer, two-finger scroll pans
  useEffect(() => {
    const el = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = cam.current;
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 40 && Math.abs(e.deltaX) < 1 && e.deltaMode === 0 && !isTrackpadPan(e)) {
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

  // keyboard: Esc steps out, +/- zoom, 0 fits, arrows pan
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      const c = cam.current, step = 80 / c.k.target;
      if (e.key === "Escape") flyTo(null);
      else if (e.key === "+" || e.key === "=") zoomBy(1.4);
      else if (e.key === "-") zoomBy(1 / 1.4);
      else if (e.key === "0") flyTo(null);
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

  // ---------- HUD numbers ----------
  const stats = useMemo(() => {
    if (!data || !world) return null;
    const up = data.sites.filter((s) => s.last_status === "up").length;
    const active = data.clients.filter((c) => c.status === "Active").length;
    const prospects = data.clients.filter((c) => c.status === "Prospect").length;
    const leads = data.records.filter((r) => r.source_created_at && Date.now() - new Date(r.source_created_at).getTime() < 7 * 864e5).length;
    return { up, sites: data.sites.length, active, prospects, leads, mrr: world.mrr };
  }, [data, world]);

  const glass = "border border-white/10 bg-[rgba(22,22,24,0.62)] backdrop-blur-2xl backdrop-saturate-150 shadow-[0_10px_40px_rgba(0,0,0,0.45)]";

  return (
    <div ref={wrapRef} className="fixed inset-0 lg:left-56 lg:top-16 overflow-hidden bg-black select-none">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 55% at 50% 45%, rgba(214,178,94,0.10), transparent 70%), radial-gradient(40% 40% at 85% 90%, rgba(56,189,248,0.06), transparent 70%)" }} />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none cursor-grab"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        aria-label="Hive Mind: kaart van klanten, websites, facturen en aanvragen"
        role="img"
      />

      {/* title + live numbers */}
      <div className={`absolute left-3 top-[calc(0.75rem+env(safe-area-inset-top))] lg:left-5 lg:top-5 rounded-2xl px-4 py-3 ${glass} pop-in`}>
        <div className="flex items-center gap-2">
          <Hexagon className="w-4 h-4 text-[#d6b25e]" />
          <h1 className="text-base font-semibold tracking-tight">Hive Mind</h1>
          <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none" />live</span>
        </div>
        {stats && (
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-white/60 tabular-nums">
            <span><b className="text-[#e8cf8e] font-semibold">{formatCurrency(stats.mrr)}</b>/mnd</span>
            <span><b className="text-white font-semibold">{stats.active}</b> klanten · {stats.prospects} prospects</span>
            <span className={stats.up < stats.sites ? "text-red-400" : ""}><b className="text-white font-semibold">{stats.up}/{stats.sites}</b> sites online</span>
            <span><b className="text-white font-semibold">{stats.leads}</b> aanvragen · 7d</span>
          </div>
        )}
      </div>

      {/* legend (desktop) */}
      <div className={`hidden lg:flex absolute left-5 bottom-5 rounded-full px-4 h-9 items-center gap-4 text-[11px] text-white/60 ${glass}`}>
        <Legend shape="hex" color="#34d399">klant</Legend>
        <Legend shape="hex" color="#a78bfa" dashed>prospect</Legend>
        <Legend shape="ring" color="#34d399">website</Legend>
        <Legend shape="dot" color="#34d399">betaald</Legend>
        <Legend shape="dot" color="#38bdf8">gepland</Legend>
        <Legend shape="dot" color="#f59e0b">open</Legend>
        <Legend shape="diamond" color="#a78bfa">aanvraag</Legend>
      </div>

      {/* camera controls */}
      <div className={`absolute right-3 lg:right-5 ${focus ? "max-lg:hidden" : ""} bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-5 rounded-full p-1 flex lg:flex-col gap-1 ${glass} ${focus ? "lg:right-[26.5rem]" : ""}`}>
        <HudButton label="Inzoomen" onClick={() => zoomBy(1.4)}><Plus className="w-4 h-4" /></HudButton>
        <HudButton label="Uitzoomen" onClick={() => zoomBy(1 / 1.4)}><Minus className="w-4 h-4" /></HudButton>
        <HudButton label="Alles tonen" onClick={() => flyTo(null)}><Maximize2 className="w-4 h-4" /></HudButton>
      </div>

      {!world && <div className="absolute inset-0 grid place-items-center text-sm text-white/50">De hive wordt opgebouwd…</div>}

      {/* detail panel: slides in from the right on desktop, rises from the bottom on mobile, and leaves the same way */}
      <aside
        aria-hidden={!focus}
        className={`absolute z-10 ${glass} rounded-3xl transition-[transform,opacity,filter] duration-300 ease-out motion-reduce:transition-opacity
          inset-x-2 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] max-h-[48vh]
          lg:inset-x-auto lg:right-5 lg:top-5 lg:bottom-5 lg:w-[25rem] lg:max-h-none
          ${focus ? "opacity-100 translate-y-0 lg:translate-x-0 blur-0" : "pointer-events-none opacity-0 translate-y-6 lg:translate-y-0 lg:translate-x-8 blur-sm"}`}
      >
        {focus && data && <Detail node={focus} data={data} world={world!} onClose={() => flyTo(null)} onOpen={(n) => flyTo(n)} />}
      </aside>

      {/* screen-reader / keyboard access to every client */}
      {world && (
        <nav className="sr-only" aria-label="Klanten in de hive">
          {world.nodes.filter((n) => n.kind === "client" || n.kind === "prospect").map((n) => (
            <button key={n.id} onClick={() => flyTo(n)}>{n.label}</button>
          ))}
        </nav>
      )}
    </div>
  );
}

function isTrackpadPan(e: WheelEvent) {
  return e.deltaMode === 0 && Math.abs(e.deltaX) > 0;
}

function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pointy: boolean) {
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + (pointy ? -Math.PI / 2 : 0);
    const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight: number) {
  ctx.font = `${weight} ${size}px system-ui, -apple-system, "SF Pro Text", Inter, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(s.length > 26 ? s.slice(0, 25) + "…" : s, x, y);
}

function HudButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="hit press w-9 h-9 rounded-full grid place-items-center text-white/80 hover:bg-white/10 active:bg-white/15">
      {children}
    </button>
  );
}

function Legend({ shape, color, dashed, children }: { shape: "hex" | "ring" | "dot" | "diamond"; color: string; dashed?: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden>
        {shape === "hex" && <polygon points="0,-5.5 4.8,-2.75 4.8,2.75 0,5.5 -4.8,2.75 -4.8,-2.75" fill="none" stroke={color} strokeWidth="1.3" strokeDasharray={dashed ? "2 1.5" : undefined} />}
        {shape === "ring" && <><circle r="4.5" fill="none" stroke={color} strokeWidth="1.5" /><circle r="1.7" fill={color} /></>}
        {shape === "dot" && <circle r="3" fill={color} />}
        {shape === "diamond" && <rect x="-2.6" y="-2.6" width="5.2" height="5.2" fill={color} transform="rotate(45)" />}
      </svg>
      {children}
    </span>
  );
}

const STATUS_NL: Record<string, string> = { up: "online", down: "offline", degraded: "traag", unknown: "onbekend" };

function Detail({ node, data, world, onClose, onOpen }: {
  node: HiveNode; data: Data; world: { nodes: HiveNode[] }; onClose: () => void; onOpen: (n: HiveNode) => void;
}) {
  const client = node.kind === "client" || node.kind === "prospect" ? data.clients.find((c) => c.id === node.refId) : undefined;
  const site = node.kind === "site" ? data.sites.find((s) => s.id === node.refId) : undefined;
  const owner = site?.client_id ? data.clients.find((c) => c.id === site.client_id) : undefined;
  const sites = client ? data.sites.filter((s) => s.client_id === client.id) : site ? [site] : [];
  const siteIds = new Set(sites.map((s) => s.id));
  const invoices = client ? data.invoices.filter((v) => v.client === client.id) : [];
  const records = data.records.filter((r) => siteIds.has(r.site_id)).slice(0, 8);
  const paid = invoices.filter((v) => v.status === "Paid").reduce((a, v) => a + Number(v.total || 0), 0);
  const open = invoices.filter((v) => v.status === "Sent").reduce((a, v) => a + Number(v.total || 0), 0);
  const planned = invoices.filter(isPlanned).sort((a, b) => (a.scheduled_send_at ?? a.next_repeat_on ?? "").localeCompare(b.scheduled_send_at ?? b.next_repeat_on ?? ""));
  const nodeFor = (id: string) => world.nodes.find((n) => n.id === id);
  const mrr = client ? clientMRR(client) : 0;
  const tone = node.kind === "prospect" ? "text-violet-300" : "text-[#e8cf8e]";

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-start gap-3 p-5 pb-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-white/50">{node.kind === "client" ? "Klant" : node.kind === "prospect" ? `Prospect · ${client?.pipeline_stage ?? ""}` : node.kind === "site" ? `Website${owner ? ` van ${owner.name}` : ""}` : ""}</div>
          <h2 className="text-xl font-semibold tracking-tight truncate">{client?.name ?? site?.name ?? node.label}</h2>
          {client && <div className={`text-sm font-semibold tabular-nums ${tone}`}>{mrr ? `${formatCurrency(mrr)} per maand` : client.location ?? ""}</div>}
          {site && <a href={site.url} target="_blank" rel="noreferrer" className="text-sm text-white/60 hover:text-white truncate block">{site.url.replace(/^https?:\/\//, "")}</a>}
        </div>
        <button onClick={onClose} aria-label="Sluiten" className="hit press shrink-0 w-9 h-9 rounded-full grid place-items-center bg-white/10 hover:bg-white/15"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4 overscroll-contain">
        {client && invoices.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <Mini label="Betaald" value={formatCurrency(paid)} className="text-emerald-400" />
            <Mini label="Open" value={formatCurrency(open)} className={open ? "text-amber-400" : ""} />
            <Mini label="Gepland" value={String(planned.length)} className={planned.length ? "text-sky-400" : ""} />
          </div>
        )}

        {sites.length > 0 && (
          <Section title={client ? "Websites" : "Status"}>
            {sites.map((s) => (
              <button key={s.id} onClick={() => { const n = nodeFor(`s:${s.id}`); if (n) onOpen(n); }} className="press w-full flex items-center gap-3 py-2 text-left">
                <span className={`w-2 h-2 rounded-full ${s.last_status === "up" ? "bg-emerald-400" : s.last_status === "down" ? "bg-red-400" : s.last_status === "degraded" ? "bg-amber-400" : "bg-white/30"}`} />
                <span className="flex-1 min-w-0 truncate text-sm">{s.name}</span>
                <span className="text-xs text-white/50 tabular-nums">{STATUS_NL[s.last_status ?? "unknown"] ?? s.last_status}{s.last_response_ms != null ? ` · ${s.last_response_ms} ms` : ""}{data.visits[s.id] ? ` · ${data.visits[s.id]} bez.` : ""}</span>
              </button>
            ))}
          </Section>
        )}

        {planned.length > 0 && (
          <Section title="Volgende facturen">
            {planned.slice(0, 4).map((v) => (
              <div key={v.id} className="flex justify-between py-1.5 text-sm"><span className="text-white/70">{formatDate(v.scheduled_send_at ?? v.next_repeat_on)}{v.repeat_monthly ? " · maandelijks" : ""}</span><span className="tabular-nums font-medium">{formatCurrency(Number(v.total))}</span></div>
            ))}
          </Section>
        )}

        {records.length > 0 && (
          <Section title="Laatste aanvragen">
            {records.map((r) => (
              <div key={r.id} className="flex justify-between gap-3 py-1.5 text-sm"><span className="truncate">{r.customer_name || r.title || r.kind}</span><span className="shrink-0 text-xs text-white/50">{r.kind} · {formatDate(r.source_created_at ?? r.starts_at)}</span></div>
            ))}
          </Section>
        )}

        {client?.notes && <p className="text-xs leading-relaxed text-white/55 whitespace-pre-line">{client.notes}</p>}
        {client && !sites.length && !invoices.length && !records.length && <p className="text-sm text-white/50">Nog geen websites, facturen of aanvragen gekoppeld.</p>}
      </div>

      <div className="p-3 pt-0 flex gap-2">
        {client && <Link to="/clients/$id" params={{ id: client.id }} className="press flex-1 h-11 rounded-full bg-white text-black text-sm font-semibold inline-flex items-center justify-center gap-1.5">Open klant <ArrowRight className="w-4 h-4" /></Link>}
        {site && <Link to="/status/$id" params={{ id: site.id }} className="press flex-1 h-11 rounded-full bg-white text-black text-sm font-semibold inline-flex items-center justify-center gap-1.5">Open website <ArrowRight className="w-4 h-4" /></Link>}
        {site && owner && <button onClick={() => { const n = nodeFor(`c:${owner.id}`); if (n) onOpen(n); }} className="press h-11 px-4 rounded-full bg-white/10 text-sm font-medium">{owner.name}</button>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-white/45 mb-1">{title}</div>
      <div className="divide-y divide-white/5">{children}</div>
    </div>
  );
}

function Mini({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2">
      <div className="text-[11px] text-white/50">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${className}`}>{value}</div>
    </div>
  );
}
