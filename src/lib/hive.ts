// Hive Mind: pure layout + physics helpers for the /hive world. Tested in hive.test.ts.
// The world is a honeycomb: one big cell per subject (Solyn in the middle, clients in rings around it),
// and inside every big cell a small honeycomb with its items. Two levels, nothing more.

export type Tone = "gold" | "green" | "amber" | "red" | "sky" | "violet" | "pink" | "teal" | "grey";

export interface CellInput {
  id: string;
  label: string;
  sub?: string;
  tone: Tone;
  ref?: { type: "client" | "site"; id: string };
}

export interface DomainInput {
  key: string;
  label: string;
  value: string;
  sub: string;
  tone: Tone;
  pulse?: boolean;
  cells: CellInput[];
}

export interface HiveNode {
  id: string;
  kind: "domain" | "cell";
  domain: string;
  index: number;
  x: number;
  y: number;
  r: number;
  tone: Tone;
  label: string;
  value?: string;
  sub?: string;
  ref?: { type: "client" | "site"; id: string };
  pulse?: boolean;
}

export const R_DOMAIN = 150;
export const R_CELL = 25;
export const R_CELL_LARGE = 42;
export const MAX_CELLS = 19; // centre + two rings

const TAU = Math.PI * 2;
const SQRT3 = Math.sqrt(3);

/** Axial coordinates of the first n cells of a hex spiral (centre, ring 1, ring 2, …). */
export function spiral(n: number): [number, number][] {
  const out: [number, number][] = [[0, 0]];
  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  for (let ring = 1; out.length < n; ring++) {
    let q = -ring, r = ring;
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < ring; step++) {
        out.push([q, r]);
        q += dirs[side][0]; r += dirs[side][1];
      }
    }
  }
  return out.slice(0, n);
}

/** Lay out the honeycomb. The first one sits in the middle, the rest spiral around it. Same data, same map. */
export function buildHive(domains: DomainInput[]): HiveNode[] {
  const nodes: HiveNode[] = [];
  const S = R_DOMAIN * 1.04;
  const place = spiral(domains.length);
  domains.forEach((d, i) => {
    const [bq, br] = place[i];
    const x = S * SQRT3 * (bq + br / 2), y = S * 1.5 * br;
    nodes.push({ id: `d:${d.key}`, kind: "domain", domain: d.key, index: i, x, y, r: R_DOMAIN, tone: d.tone, label: d.label, value: d.value, sub: d.sub, pulse: d.pulse });
    let cells = d.cells;
    if (cells.length > MAX_CELLS) {
      cells = [...cells.slice(0, MAX_CELLS - 1), { id: `${d.key}:more`, label: `+${d.cells.length - (MAX_CELLS - 1)}`, sub: "meer", tone: "grey" }];
    }
    // few items get roomier cells: up to 7 fit as one ring of large cells, more use two rings of small ones
    const cr = cells.length <= 7 ? R_CELL_LARGE : R_CELL;
    const s = cr * 1.1;
    spiral(cells.length).forEach(([q, r], j) => {
      const c = cells[j];
      nodes.push({
        id: `c:${d.key}:${c.id}`, kind: "cell", domain: d.key, index: j,
        x: x + s * SQRT3 * (q + r / 2), y: y + s * 1.5 * r, r: cr,
        tone: c.tone, label: c.label, sub: c.sub, ref: c.ref,
      });
    });
  });
  return nodes;
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

/** The node of this kind under a world point. */
export function hitTest(nodes: HiveNode[], x: number, y: number, kind: HiveNode["kind"]): HiveNode | null {
  let best: HiveNode | null = null, bestD = Infinity;
  for (const n of nodes) {
    if (n.kind !== kind) continue;
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= n.r * 0.95 && d < bestD) { best = n; bestD = d; }
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
