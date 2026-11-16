import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Hexagon, Maximize2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { clientMRR, clientMRRBreakdown, serviceMRR, type FeeClient } from "@/lib/fees";
import { formatCurrency } from "@/lib/format";
import { brusselsToday, plannedForecast } from "@/lib/invoice-schedule";
import { isPrivate } from "@/lib/privacy";
import { R_DOMAIN, bounds, buildHive, hitTest, project, stepSpring, type CellInput, type DomainInput, type HiveNode, type Spring, type Tone } from "@/lib/hive";

export const Route = createFileRoute("/_authenticated/hive")({
  component: HivePage,
  head: () => ({ meta: [{ title: "Hive Mind · Solyn" }] }),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type ClientRow = FeeClient & { id: string; name: string; status: string; pipeline_stage?: string | null; health?: string | null; location?: string | null };
type SiteRow = { id: string; client_id: string | null; name: string; last_status: string | null; last_response_ms: number | null };
type InvoiceRow = { id: string; client: string | null; total: number; status: string; date: string; scheduled_send_at: string | null; repeat_monthly: boolean; repeat_day: number | null; next_repeat_on: string | null };
type RecordRow = { id: string; site_id: string; source_created_at: string | null };
type AgreementRow = { id: string; client_id: string; status: string };
type Data = { clients: ClientRow[]; sites: SiteRow[]; invoices: InvoiceRow[]; records: RecordRow[]; agreements: AgreementRow[] };

const RGB: Record<Tone, string> = {
  gold: "214,178,94", green: "52,211,153", amber: "245,158,11", red: "248,113,113", sky: "56,189,248",
  violet: "167,139,250", pink: "244,114,182", teal: "45,212,191", grey: "140,140,150",
};
const K_MIN = 0.15, K_MAX = 7;
const AGENT_SLOTS = 2;

const isPlanned = (v: InvoiceRow) => (v.status === "Draft" && !!v.scheduled_send_at) || (v.repeat_monthly && !!v.next_repeat_on);
const siteTone = (s: string | null): Tone => (s === "up" ? "green" : s === "degraded" ? "amber" : s === "down" ? "red" : "grey");
const healthTone = (h?: string | null): Tone => (h === "Orange" ? "amber" : h === "Red" ? "red" : "green");

/** Turn the Hub's data into the honeycomb: Solyn in the middle, one cell per client, the client's parts inside. */
function toDomains(d: Data): DomainInput[] {
  const active = d.clients.filter((c) => c.status === "Active").sort((a, b) => clientMRR(b) - clientMRR(a) || a.name.localeCompare(b.name));
  const prospects = d.clients.filter((c) => c.status === "Prospect").sort((a, b) => a.name.localeCompare(b.name));
  const mrr = active.reduce((a, c) => a + clientMRR(c), 0);
  const svc = serviceMRR(active);
  const open = d.invoices.filter((v) => v.status === "Sent").reduce((a, v) => a + Number(v.total || 0), 0);
  const fc = plannedForecast(d.invoices as never, brusselsToday(), 6);
  const sitesDown = d.sites.filter((s) => s.last_status === "down").length;
  const week = Date.now() - 7 * 864e5;

  const solyn: DomainInput = {
    key: "solyn", label: "Solyn", value: formatCurrency(mrr), sub: "per maand", tone: "gold", pulse: sitesDown > 0,
    cells: [
      { id: "seo", label: "SEO", sub: formatCurrency(svc.seo.mrr), tone: "sky" },
      { id: "web", label: "Websites", sub: formatCurrency(svc.website.mrr), tone: "gold" },
      { id: "social", label: "Social", sub: formatCurrency(svc.social.mrr), tone: "violet" },
      { id: "open", label: "Open", sub: formatCurrency(open), tone: open > 0 ? "amber" : "grey" },
      { id: "plan", label: "Gepland", sub: formatCurrency(fc.total), tone: "sky" },
      { id: "sites", label: "Sites", sub: `${d.sites.length - sitesDown}/${d.sites.length} online`, tone: sitesDown ? "red" : "green" },
      { id: "clients", label: "Klanten", sub: String(active.length), tone: "green" },
    ],
  };

  const forClient = (c: ClientRow, prospect: boolean): DomainInput => {
    const sites = d.sites.filter((s) => s.client_id === c.id);
    const siteIds = new Set(sites.map((s) => s.id));
    const inv = d.invoices.filter((v) => v.client === c.id);
    const paid = inv.filter((v) => v.status === "Paid").reduce((a, v) => a + Number(v.total || 0), 0);
    const due = inv.filter((v) => v.status === "Sent").reduce((a, v) => a + Number(v.total || 0), 0);
    const planned = inv.filter(isPlanned).length;
    const leads = d.records.filter((r) => siteIds.has(r.site_id) && r.source_created_at && new Date(r.source_created_at).getTime() > week).length;
    const agr = d.agreements.find((a) => a.client_id === c.id);
    const b = clientMRRBreakdown(c);
    const cells: CellInput[] = [];
    for (const s of sites) cells.push({ id: `s${s.id}`, label: s.name, sub: s.last_status === "down" ? "offline" : s.last_response_ms != null ? `${s.last_response_ms} ms` : "website", tone: siteTone(s.last_status), ref: { type: "site", id: s.id } });
    if (b.seo) cells.push({ id: "seo", label: "SEO", sub: formatCurrency(b.seo), tone: "sky" });
    if (b.website) cells.push({ id: "web", label: "Website", sub: formatCurrency(b.website), tone: "gold" });
    if (b.social) cells.push({ id: "social", label: "Social", sub: formatCurrency(b.social), tone: "violet" });
    if (due) cells.push({ id: "due", label: "Open", sub: formatCurrency(due), tone: "amber" });
    if (paid) cells.push({ id: "paid", label: "Betaald", sub: formatCurrency(paid), tone: "green" });
    if (planned) cells.push({ id: "plan", label: "Gepland", sub: `${planned} ${planned === 1 ? "factuur" : "facturen"}`, tone: "sky" });
    if (leads) cells.push({ id: "leads", label: "Aanvragen", sub: `${leads} · 7 d`, tone: "pink" });
    if (agr) cells.push({ id: "agr", label: "Contract", sub: agr.status, tone: "teal" });
    if (prospect) cells.push({ id: "stage", label: "Fase", sub: c.pipeline_stage ?? "Prospect", tone: "violet" });
    for (let i = 0; i < AGENT_SLOTS; i++) cells.push({ id: `agent${i}`, label: "+ Agent", sub: "binnenkort", tone: "grey" });
    const m = clientMRR(c);
    const down = sites.some((s) => s.last_status === "down");
    return {
      key: c.id, label: c.name, value: prospect ? "Prospect" : m ? formatCurrency(m) : "—",
      sub: prospect ? (c.pipeline_stage ?? "pipeline") : m ? "per maand" : (c.location ?? "klant"),
      tone: prospect ? "violet" : down ? "red" : due ? "amber" : healthTone(c.health), pulse: down, cells,
    };
  };

  return [solyn, ...active.map((c) => forClient(c, false)), ...prospects.map((c) => forClient(c, true))];
}

function HivePage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // ---------- data (refreshes every minute) ----------
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const [c, s, i, r, a] = await Promise.all([
        supabase.from("clients").select("*"),
        db.from("monitored_sites").select("id,client_id,name,last_status,last_response_ms").eq("enabled", true).order("name"),
        db.from("invoices").select("id,client,total,status,date,scheduled_send_at,repeat_monthly,repeat_day,next_repeat_on"),
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

  const nodes = useMemo(() => (data ? buildHive(toDomains(data)) : null), [data]);
  const focusNode = nodes?.find((n) => n.kind === "domain" && n.domain === focusKey) ?? null;

  // ---------- canvas world ----------
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cam = useRef({ x: { value: 0, velocity: 0, target: 0 } as Spring, y: { value: 0, velocity: 0, target: 0 } as Spring, k: { value: 0.6, velocity: 0, target: 0.6 } as Spring, dim: { value: 0, velocity: 0, target: 0 } as Spring });
  const nodesRef = useRef(nodes);
  const focusRef = useRef<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const pressRef = useRef<{ id: string | null; s: Spring }>({ id: null, s: { value: 1, velocity: 0, target: 1 } });
  const fitK = useRef(0.6);
  const reduced = useRef(false);
  const born = useRef(0);
  nodesRef.current = nodes;
  focusRef.current = focusKey;

  const size = () => {
    const el = wrapRef.current;
    return { w: el?.clientWidth ?? 1, h: el?.clientHeight ?? 1 };
  };
  const snap = () => { const c = cam.current; c.x.value = c.x.target; c.y.value = c.y.target; c.k.value = c.k.target; c.x.velocity = c.y.velocity = c.k.velocity = 0; };

  const fit = useCallback((instant = false) => {
    const all = nodesRef.current;
    if (!all) return;
    const b = bounds(all.filter((n) => n.kind === "domain"));
    const { w, h } = size();
    const k = Math.min(1.6, Math.max(K_MIN, Math.min((w - 24) / (b.maxX - b.minX), (h - 190) / (b.maxY - b.minY))));
    fitK.current = k;
    const c = cam.current;
    c.x.target = (b.minX + b.maxX) / 2; c.y.target = (b.minY + b.maxY) / 2 - 20 / k; c.k.target = k; c.dim.target = 0;
    if (instant || reduced.current) snap();
  }, []);

  /** How visible the small cells are: they fade in as you zoom past the overview. */
  const cellAlpha = () => Math.max(0, Math.min(1, (cam.current.k.value / fitK.current - 1.3) / 0.5));

  const flyTo = useCallback((n: HiveNode | null) => {
    setFocusKey(n?.domain ?? null);
    if (!n) { fit(); return; }
    const { w, h } = size();
    const c = cam.current;
    const k = Math.max(fitK.current * 2, Math.min(w / (R_DOMAIN * 1.9), (h - 170) / (R_DOMAIN * 2.1)));
    c.k.target = k; c.x.target = n.x; c.y.target = n.y + 14 / k; c.dim.target = 1;
    if (reduced.current) snap();
  }, [fit]);

  const fitted = useRef(false);
  useEffect(() => {
    if (nodes && !fitted.current) { fitted.current = true; fit(true); born.current = performance.now(); }
  }, [nodes, fit]);

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
      if (fitted.current && !focusRef.current) fit(true);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapRef.current!);
    const frame = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const c = cam.current;
      if (!dragging.current) { c.x = stepSpring(c.x, dt, 1, 0.5); c.y = stepSpring(c.y, dt, 1, 0.5); }
      if (!pinching.current) c.k = stepSpring(c.k, dt, 1, 0.5);
      c.dim = stepSpring(c.dim, dt, 1, 0.35);
      pressRef.current.s = stepSpring(pressRef.current.s, dt, 1, 0.18);
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
    const all = nodesRef.current;
    if (!all) return;
    const c = cam.current;
    const k = c.k.value;
    const sx = (x: number) => (x - c.x.value) * k + w / 2;
    const sy = (y: number) => (y - c.y.value) * k + h / 2;
    const calm = reduced.current;
    const ca = cellAlpha();
    const f = focusRef.current;
    const hide = isPrivate();
    const show = (s: string) => (hide && s.includes("€") ? "€ •••" : s);

    for (const n of all) {
      if (n.kind !== "domain") continue;
      const x = sx(n.x), y = sy(n.y);
      const R = n.r * k;
      if (x < -R || x > w + R || y < -R || y > h + R) continue;
      // cells arrive one after another, from the middle outwards
      const t = calm ? 1 : Math.max(0, Math.min(1, (now - born.current - n.index * 55) / 420));
      const e = 1 - Math.pow(1 - t, 3);
      const press = pressRef.current.id === n.id ? pressRef.current.s.value : 1;
      const r = R * 0.965 * (0.8 + 0.2 * e) * press;
      const rgb = RGB[n.tone];
      const dim = f && f !== n.domain ? 1 - 0.7 * c.dim.value : 1;
      ctx.globalAlpha = e * dim;

      const g = ctx.createRadialGradient(x - r * 0.45, y - r * 0.6, 0, x, y, r * 1.25);
      g.addColorStop(0, `rgba(${rgb},${n.index === 0 ? 0.42 : 0.26})`); g.addColorStop(1, "rgba(15,15,17,0.97)");
      ctx.fillStyle = g; ctx.beginPath(); hexPath(ctx, x, y, r); ctx.fill();
      const hot = hoverRef.current === n.id || f === n.domain;
      ctx.strokeStyle = `rgba(${rgb},${hot ? 0.95 : 0.55})`; ctx.lineWidth = hot ? 2 : 1.25; ctx.stroke();
      if (n.pulse && !calm) {
        const ph = (now / 1600) % 1;
        ctx.strokeStyle = `rgba(${RGB.red},${0.7 * (1 - ph)})`; ctx.lineWidth = 2;
        ctx.beginPath(); hexPath(ctx, x, y, r * (1 + ph * 0.07)); ctx.stroke();
      }

      // overview face: name, one number, one line
      if (ca < 1) {
        ctx.globalAlpha = e * dim * (1 - ca);
        const fsV = Math.max(15, Math.min(64, R * 0.27)), fsL = Math.max(10, Math.min(20, R * 0.115));
        text(ctx, n.label, x, y - fsV * 0.75, fsL, "rgba(255,255,255,0.72)", 600, r * 1.45);
        text(ctx, show(n.value ?? ""), x, y + fsV * 0.36, n.value === "Prospect" ? fsV * 0.6 : fsV, n.index === 0 ? "#f0d489" : n.value === "Prospect" ? "rgba(196,181,253,0.95)" : "#fff", 750, r * 1.55, "-0.02em");
        text(ctx, n.sub ?? "", x, y + fsV * 0.36 + fsL * 1.6, fsL * 0.9, "rgba(255,255,255,0.45)", 500, r * 1.4);
      }
      // zoomed in: the name moves to the top to make room for what is inside
      if (ca > 0) {
        ctx.globalAlpha = e * dim * ca;
        const fs = Math.max(10, Math.min(17, R * 0.062));
        text(ctx, `${n.label} · ${show(n.value ?? "")}`, x, y - R * 0.79, fs, "rgba(255,255,255,0.8)", 600, R * 0.62);
      }
      ctx.globalAlpha = 1;
    }

    if (ca <= 0.02) return;
    for (const n of all) {
      if (n.kind !== "cell") continue;
      const x = sx(n.x), y = sy(n.y);
      const press = pressRef.current.id === n.id ? pressRef.current.s.value : 1;
      const r = n.r * k * 0.95 * press;
      if (x < -r || x > w + r || y < -r || y > h + r) continue;
      const rgb = RGB[n.tone];
      const dim = f && f !== n.domain ? 1 - 0.7 * c.dim.value : 1;
      const slot = n.label === "+ Agent";
      ctx.globalAlpha = ca * dim * (slot ? 0.75 : 1);
      ctx.fillStyle = slot ? "rgba(255,255,255,0.03)" : `rgba(${rgb},0.13)`;
      ctx.beginPath(); hexPath(ctx, x, y, r); ctx.fill();
      ctx.strokeStyle = `rgba(${rgb},${hoverRef.current === n.id ? 1 : slot ? 0.5 : 0.75})`; ctx.lineWidth = 1.2;
      if (slot) ctx.setLineDash([4, 4]);
      ctx.stroke(); ctx.setLineDash([]);
      if (r > 22) {
        const fs = Math.max(8, Math.min(14, r * 0.23));
        text(ctx, n.label, x, y - fs * 0.15, fs, slot ? "rgba(255,255,255,0.55)" : "#fff", 600, r * 1.5);
        if (n.sub) text(ctx, show(n.sub), x, y + fs * 1.15, fs * 0.86, `rgba(${rgb},0.95)`, 500, r * 1.4);
      }
      ctx.globalAlpha = 1;
    }
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
  /** What is under the pointer: a small cell when zoomed in, otherwise a big one. */
  const nodeAt = (px: number, py: number) => {
    const all = nodesRef.current;
    if (!all) return null;
    const p = toWorld(px, py);
    return (cellAlpha() > 0.5 ? hitTest(all, p.x, p.y, "cell") : null) ?? hitTest(all, p.x, p.y, "domain");
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
      pressRef.current.s.target = n ? 0.95 : 1; // feedback on press, not on release
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
      if (e.pointerType === "mouse") { const n = nodeAt(p.x, p.y); hoverRef.current = n?.id ?? null; canvasRef.current!.style.cursor = n ? "pointer" : "grab"; }
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
    if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) < 6) return; // a small threshold before a drag wins over a tap
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
      const n = nodeAt(p.x, p.y);
      if (!n) { flyTo(null); return; }
      if (n.kind === "cell") {
        if (n.ref?.type === "site") navigate({ to: "/status/$id", params: { id: n.ref.id } });
        else if (n.label === "+ Agent") toast("Agents koppelen komt binnenkort", { description: "Deze plaats is gereserveerd voor een agent van deze klant." });
        else if (n.domain !== focusRef.current) flyTo(nodesRef.current?.find((m) => m.kind === "domain" && m.domain === n.domain) ?? null);
        return;
      }
      flyTo(n);
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

  // wheel: zoom around the pointer; trackpad two-finger scroll pans, pinch zooms
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

  // keyboard: Esc steps out, +/- zoom, 0 shows everything, arrows pan
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

  const counts = useMemo(() => {
    if (!data) return null;
    return { clients: data.clients.filter((c) => c.status === "Active").length, prospects: data.clients.filter((c) => c.status === "Prospect").length };
  }, [data]);

  const glass = "border border-white/10 bg-[rgba(22,22,24,0.62)] backdrop-blur-2xl backdrop-saturate-150 shadow-[0_10px_40px_rgba(0,0,0,0.45)]";

  return (
    <div ref={wrapRef} className="fixed inset-0 lg:left-56 lg:top-16 overflow-hidden bg-black select-none">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(55% 50% at 50% 48%, rgba(214,178,94,0.09), transparent 70%)" }} />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none cursor-grab"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => { hoverRef.current = null; }}
        aria-label="Hive Mind: honingraat met één cel per klant"
        role="img"
      />

      <div className={`absolute left-3 top-[calc(0.75rem+env(safe-area-inset-top))] lg:left-5 lg:top-5 rounded-2xl px-4 py-2.5 ${glass} pop-in`}>
        <div className="flex items-center gap-2">
          <Hexagon className="w-4 h-4 text-[#d6b25e]" />
          <h1 className="text-base font-semibold tracking-tight">Hive Mind</h1>
          <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />live</span>
        </div>
        <div className="text-xs text-white/55 mt-0.5">
          {counts ? `${counts.clients} klanten · ${counts.prospects} prospects · tik op een cel om in te zoomen` : "De hive wordt opgebouwd…"}
        </div>
      </div>

      <div className={`absolute right-3 lg:right-5 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-5 rounded-full p-1 flex lg:flex-col gap-1 ${glass} ${focusNode ? "max-lg:hidden" : ""}`}>
        <HudButton label="Inzoomen" onClick={() => zoomBy(1.4)}><Plus className="w-4 h-4" /></HudButton>
        <HudButton label="Uitzoomen" onClick={() => zoomBy(1 / 1.4)}><Minus className="w-4 h-4" /></HudButton>
        <HudButton label="Alles tonen" onClick={() => flyTo(null)}><Maximize2 className="w-4 h-4" /></HudButton>
      </div>

      {/* where am I, and the way out: rises in when you are inside a cell */}
      <div
        aria-hidden={!focusNode}
        className={`absolute left-1/2 -translate-x-1/2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-5 max-w-[calc(100vw-1.5rem)] rounded-full p-1 flex items-center gap-1 ${glass}
          transition-[transform,opacity,filter] duration-300 ease-out motion-reduce:transition-opacity
          ${focusNode ? "opacity-100 translate-y-0 blur-0" : "pointer-events-none opacity-0 translate-y-4 blur-sm"}`}
      >
        <button type="button" onClick={() => flyTo(null)} className="press h-10 px-3 rounded-full inline-flex items-center gap-1.5 text-sm text-white/80 hover:bg-white/10 whitespace-nowrap">
          <ArrowLeft className="w-4 h-4" /> Overzicht
        </button>
        <span className="px-2 text-sm font-semibold truncate min-w-0">{focusNode?.label}</span>
        {focusNode && (focusNode.domain === "solyn"
          ? <Link to="/finance" className="press h-10 px-4 rounded-full bg-white text-black text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap">Finance <ArrowRight className="w-4 h-4" /></Link>
          : <Link to="/clients/$id" params={{ id: focusNode.domain }} className="press h-10 px-4 rounded-full bg-white text-black text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap">Open klant <ArrowRight className="w-4 h-4" /></Link>)}
      </div>

      {/* screen-reader / keyboard access to every cell */}
      {nodes && (
        <nav className="sr-only" aria-label="Cellen in de hive">
          {nodes.filter((n) => n.kind === "domain").map((n) => (
            <button key={n.id} onClick={() => flyTo(n)}>{n.label}: {n.value} {n.sub}</button>
          ))}
        </nav>
      )}
    </div>
  );
}

function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight: number, maxW: number, spacing = "0px") {
  ctx.font = `${weight} ${size}px system-ui, -apple-system, "SF Pro Text", Inter, sans-serif`;
  (ctx as unknown as { letterSpacing: string }).letterSpacing = spacing;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  let out = s;
  if (ctx.measureText(out).width > maxW) {
    while (out.length > 1 && ctx.measureText(out + "…").width > maxW) out = out.slice(0, -1);
    out += "…";
  }
  ctx.fillText(out, x, y);
}

function HudButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="hit press w-9 h-9 rounded-full grid place-items-center text-white/80 hover:bg-white/10 active:bg-white/15">
      {children}
    </button>
  );
}
