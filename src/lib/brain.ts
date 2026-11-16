// Brain: pure layout + physics for the /brain page. Tested in brain.test.ts.
// A glowing core (Solyn) with one neuron per client: an axon from the core to the cell body,
// and dendrites fanning out from it, one per part of that client (website, service, invoices, agents).

export type Tone = "gold" | "green" | "amber" | "red" | "sky" | "violet" | "pink" | "teal" | "grey";
export type Pt = [number, number];
export interface Curve { p0: Pt; p1: Pt; p2: Pt; p3: Pt; len: number }

export interface TipInput { id: string; label: string; sub?: string; tone: Tone; ref?: { type: "site"; id: string }; slot?: boolean }
export interface NeuronInput { key: string; label: string; value: string; sub: string; weight: number; dim?: boolean; alert?: boolean; tips: TipInput[] }

export interface Tip extends TipInput { x: number; y: number; angle: number; curve: Curve }
export interface Neuron extends Omit<NeuronInput, "tips"> { index: number; hue: number; x: number; y: number; angle: number; axon: Curve; tips: Tip[]; wisps: Curve[] }
export interface Brain { neurons: Neuron[]; coreWisps: { curve: Curve; hue: number }[] }

export const HUES = [190, 312, 150, 265, 212, 335, 172, 285, 128];
export const R_SOMA = 22;
const TAU = Math.PI * 2;

/** Small seeded random generator, so the same data always grows the same brain. */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dir = (a: number): Pt => [Math.cos(a), Math.sin(a)];
function curve(p0: Pt, p1: Pt, p2: Pt, p3: Pt): Curve {
  const d = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return { p0, p1, p2, p3, len: (d(p0, p3) + d(p0, p1) + d(p1, p2) + d(p2, p3)) / 2 };
}

/** A branch from `from` in direction `a`, bending a little on the way. */
function branch(from: Pt, a: number, len: number, bend: number): Curve {
  const [dx, dy] = dir(a), n: Pt = [-dy, dx];
  return curve(
    from,
    [from[0] + dx * len * 0.35 + n[0] * bend, from[1] + dy * len * 0.35 + n[1] * bend],
    [from[0] + dx * len * 0.7 - n[0] * bend * 0.6, from[1] + dy * len * 0.7 - n[1] * bend * 0.6],
    [from[0] + dx * len, from[1] + dy * len],
  );
}

/** Point on a cubic curve at u (0..1). */
export function bez(c: Curve, u: number): Pt {
  const v = 1 - u, a = v * v * v, b = 3 * v * v * u, d = 3 * v * u * u, e = u * u * u;
  return [a * c.p0[0] + b * c.p1[0] + d * c.p2[0] + e * c.p3[0], a * c.p0[1] + b * c.p1[1] + d * c.p2[1] + e * c.p3[1]];
}

export function buildBrain(input: NeuronInput[]): Brain {
  const bright = input.filter((n) => !n.dim), faint = input.filter((n) => n.dim);
  const neurons: Neuron[] = [];
  const place = (n: NeuronInput, i: number, count: number, radius: number, offset: number) => {
    const rnd = seeded(n.key);
    const angle = -Math.PI / 2 + ((i + offset) / Math.max(1, count)) * TAU + (rnd() - 0.5) * 0.16;
    const dist = radius + (i % 2) * 95 + rnd() * 20;
    const soma: Pt = [Math.cos(angle) * dist, Math.sin(angle) * dist];
    const axon = branch([0, 0], angle, dist, (rnd() - 0.5) * dist * 0.5);
    axon.p3 = soma;
    const m = n.tips.length;
    const spread = Math.min(2.1, 0.5 + m * 0.24);
    const tips: Tip[] = n.tips.map((t, j) => {
      const a = angle + (m <= 1 ? 0 : (j / (m - 1) - 0.5) * spread);
      const len = 74 + (j % 2) * 30 + rnd() * 12;
      const c = branch(soma, a, len, (rnd() - 0.5) * 34);
      return { ...t, x: c.p3[0], y: c.p3[1], angle: a, curve: c };
    });
    const wisps = Array.from({ length: n.dim ? 3 : 7 }, () => branch(soma, angle + (rnd() - 0.5) * 4.6, 26 + rnd() * 58, (rnd() - 0.5) * 30));
    neurons.push({ ...n, index: neurons.length, hue: HUES[neurons.length % HUES.length], x: soma[0], y: soma[1], angle, axon, tips, wisps });
  };
  bright.forEach((n, i) => place(n, i, bright.length, 300, 0));
  faint.forEach((n, i) => place(n, i, faint.length, 580, 0.5));

  const rnd = seeded("core");
  const coreWisps = Array.from({ length: 54 }, () => {
    const a = rnd() * TAU;
    // each wisp takes the colour of the neuron it points towards
    let hue = 195, best = Infinity;
    for (const n of neurons) {
      const d = Math.abs(Math.atan2(Math.sin(a - n.angle), Math.cos(a - n.angle)));
      if (d < best) { best = d; hue = n.hue; }
    }
    return { curve: branch([0, 0], a, 70 + rnd() * 210, (rnd() - 0.5) * 90), hue };
  });
  return { neurons, coreWisps };
}

export function brainBounds(b: Brain): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = -120, minY = -120, maxX = 120, maxY = 120;
  for (const n of b.neurons) for (const p of [[n.x, n.y] as Pt, ...n.tips.map((t) => [t.x, t.y] as Pt)]) {
    minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
  }
  return { minX, minY, maxX, maxY };
}

/** What is under a world point: a dendrite tip (when `tips` is on) or a cell body. */
export function hitBrain(b: Brain, x: number, y: number, slop: number, tips: boolean): { neuron: Neuron; tip?: Tip } | null {
  if (tips) for (const n of b.neurons) for (const t of n.tips) if (Math.hypot(t.x - x, t.y - y) <= 9 + slop) return { neuron: n, tip: t };
  let best: Neuron | null = null, bd = Infinity;
  for (const n of b.neurons) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= R_SOMA + slop && d < bd) { best = n; bd = d; }
  }
  return best ? { neuron: best } : null;
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
