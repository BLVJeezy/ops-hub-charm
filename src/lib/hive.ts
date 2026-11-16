// Hive Mind: pure layout + physics helpers for the /hive world. Tested in hive.test.ts.

export type HiveKind = "core" | "client" | "prospect" | "site" | "invoice" | "record";
export type Tone = "gold" | "green" | "amber" | "red" | "sky" | "violet" | "grey";

export interface HiveNode {
  id: string;
  kind: HiveKind;
  x: number;
  y: number;
  r: number;
  tone: Tone;
  label: string;
  sub?: string;
  parent?: string; // node it orbits / links to
  refId?: string; // database id (client, site, invoice, record)
  weight?: number; // drives particle flow along the link to parent
  pulse?: boolean; // needs attention
}

export interface HiveEdge {
  from: string;
  to: string;
  tone: Tone;
  flow: number; // 0..1, particles per edge
}

export interface HiveInput {
  mrr: number;
  clients: { id: string; name: string; status: string; stage?: string | null; health?: string | null; mrr: number; location?: string | null }[];
  sites: { id: string; client_id: string | null; name: string; status: string | null; ms?: number | null; critical?: boolean; visitors?: number }[];
  invoices: { id: string; client: string | null; total: number; status: string; planned: boolean; nr: string; date: string }[];
  records: { id: string; site_id: string; kind: string; title: string; when: string }[];
}

export const R_CLIENTS = 320;
export const R_PROSPECTS = 560;

const TAU = Math.PI * 2;
const healthTone = (h?: string | null): Tone => (h === "Green" ? "green" : h === "Orange" ? "amber" : h === "Red" ? "red" : "gold");
const siteTone = (s: string | null): Tone => (s === "up" ? "green" : s === "degraded" ? "amber" : s === "down" ? "red" : "grey");
const invoiceTone = (status: string, planned: boolean): Tone =>
  status === "Paid" ? "green" : status === "Sent" ? "amber" : planned ? "sky" : "grey";

/** Client cell size grows with the square root of its MRR, so one big client does not swallow the map. */
export function clientRadius(mrr: number): number {
  return Math.min(46, 18 + Math.sqrt(Math.max(0, mrr)) * 1.1);
}

/** Lay out the whole world deterministically: same data, same map. */
export function buildHive(input: HiveInput): { nodes: HiveNode[]; edges: HiveEdge[] } {
  const nodes: HiveNode[] = [];
  const edges: HiveEdge[] = [];
  nodes.push({ id: "core", kind: "core", x: 0, y: 0, r: 54, tone: "gold", label: "Solyn", sub: "core" });

  const active = input.clients.filter((c) => c.status === "Active").sort((a, b) => b.mrr - a.mrr || a.name.localeCompare(b.name));
  const prospects = input.clients.filter((c) => c.status === "Prospect").sort((a, b) => a.name.localeCompare(b.name));
  const maxMrr = Math.max(1, ...active.map((c) => c.mrr));
  const visitorsMax = Math.max(1, ...input.sites.map((s) => s.visitors ?? 0));
  const angleOf = new Map<string, number>();

  // biggest client at the top, the rest clockwise
  active.forEach((c, i) => {
    const a = -Math.PI / 2 + (i / Math.max(1, active.length)) * TAU;
    angleOf.set(c.id, a);
    const id = `c:${c.id}`;
    nodes.push({
      id, kind: "client", refId: c.id, parent: "core",
      x: Math.cos(a) * R_CLIENTS, y: Math.sin(a) * R_CLIENTS, r: clientRadius(c.mrr),
      tone: healthTone(c.health), label: c.name, sub: c.location ?? undefined, weight: c.mrr / maxMrr,
    });
    edges.push({ from: id, to: "core", tone: "gold", flow: c.mrr > 0 ? 0.25 + 0.75 * (c.mrr / maxMrr) : 0 });
  });

  prospects.forEach((c, i) => {
    const a = -Math.PI / 2 + ((i + 0.5) / Math.max(1, prospects.length)) * TAU;
    angleOf.set(c.id, a);
    const id = `c:${c.id}`;
    nodes.push({
      id, kind: "prospect", refId: c.id, parent: "core",
      x: Math.cos(a) * R_PROSPECTS, y: Math.sin(a) * R_PROSPECTS, r: 13,
      tone: "violet", label: c.name, sub: c.stage ?? "Prospect",
    });
    edges.push({ from: id, to: "core", tone: "violet", flow: 0 });
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const orphanSites = input.sites.filter((s) => !s.client_id || !byId.has(`c:${s.client_id}`));

  // satellites fan out on the outward side of their client
  const fan = (parent: HiveNode, baseAngle: number, i: number, n: number, dist: number, spread: number) => {
    const a = baseAngle + (n <= 1 ? 0 : (i / (n - 1) - 0.5) * spread);
    return { x: parent.x + Math.cos(a) * dist, y: parent.y + Math.sin(a) * dist, a };
  };

  for (const c of [...active, ...prospects]) {
    const parent = byId.get(`c:${c.id}`);
    if (!parent) continue;
    const base = angleOf.get(c.id) ?? 0;
    const mySites = input.sites.filter((s) => s.client_id === c.id);
    mySites.forEach((s, i) => {
      const p = fan(parent, base, i, mySites.length, parent.r + 58, 0.9);
      addSite(s, p.x, p.y, parent.id, p.a);
    });
    const myInv = input.invoices.filter((v) => v.client === c.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
    // invoices orbit their client as a ring of beads, newest at the top
    myInv.forEach((v, i) => {
      const a = -Math.PI / 2 + (i / myInv.length) * TAU;
      const p = { x: parent.x + Math.cos(a) * (parent.r + 12), y: parent.y + Math.sin(a) * (parent.r + 12) };
      nodes.push({
        id: `i:${v.id}`, kind: "invoice", refId: v.id, parent: parent.id, x: p.x, y: p.y, r: 3.4,
        tone: invoiceTone(v.status, v.planned), label: `#${v.nr}`, sub: `€${Math.round(v.total)}`,
      });
    });
  }

  orphanSites.forEach((s, i) => {
    const a = Math.PI / 2 + (i - (orphanSites.length - 1) / 2) * 0.55;
    addSite(s, Math.cos(a) * 130, Math.sin(a) * 130, "core", a);
  });

  function addSite(s: HiveInput["sites"][number], x: number, y: number, parentId: string, a: number) {
    const id = `s:${s.id}`;
    const v = s.visitors ?? 0;
    nodes.push({
      id, kind: "site", refId: s.id, parent: parentId, x, y, r: 10,
      tone: siteTone(s.status), label: s.name, sub: s.ms != null ? `${s.ms} ms` : undefined,
      weight: v / visitorsMax, pulse: s.status === "down" || s.status === "degraded",
    });
    edges.push({ from: id, to: parentId, tone: siteTone(s.status), flow: v > 0 ? 0.15 + 0.85 * (v / visitorsMax) : 0 });
    const recs = input.records.filter((r) => r.site_id === s.id).slice(0, 10);
    recs.forEach((r, i) => {
      const t = recs.length <= 1 ? 0 : i / (recs.length - 1) - 0.5;
      const ang = a + t * 1.6;
      const d = 30 + (i % 2) * 9;
      nodes.push({
        id: `r:${r.id}`, kind: "record", refId: r.id, parent: id, x: x + Math.cos(ang) * d, y: y + Math.sin(ang) * d, r: 3.2,
        tone: "violet", label: r.title, sub: r.kind,
      });
    });
  }

  return { nodes, edges };
}

/** Bounding box of the nodes, for "fit to screen". */
export function bounds(nodes: HiveNode[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.r); minY = Math.min(minY, n.y - n.r);
    maxX = Math.max(maxX, n.x + n.r); maxY = Math.max(maxY, n.y + n.r);
  }
  if (!nodes.length) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

/** Topmost node under a world point (small things win over big ones). */
export function hitTest(nodes: HiveNode[], x: number, y: number, slop = 0): HiveNode | null {
  let best: HiveNode | null = null;
  for (const n of nodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= n.r + slop && (!best || n.r < best.r)) best = n;
  }
  return best;
}

// ---------- physics (Apple-style springs: damping ratio + response) ----------

export interface Spring { value: number; velocity: number; target: number }

/** One step of a damped spring. damping 1 = no overshoot; response ≈ seconds to settle. */
export function stepSpring(s: Spring, dt: number, damping = 1, response = 0.4): Spring {
  const k = (TAU / response) ** 2;
  const c = (4 * Math.PI * damping) / response;
  const a = -k * (s.value - s.target) - c * s.velocity;
  const velocity = s.velocity + a * dt;
  return { value: s.value + velocity * dt, velocity, target: s.target };
}

/** Where a flick comes to rest (Apple's projection, scroll-like deceleration). */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Soft limit past a boundary: the further you go, the less it follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
