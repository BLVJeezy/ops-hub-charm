// Brain: a procedural 3D brain for the /brain page. Pure geometry, tested in brain3d.test.ts.
// Units: the brain fits roughly in a box of ±1. x = right, y = up, z = towards the viewer (front of the head).

export type P3 = [number, number, number];

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

/** A point on the cortex of one hemisphere (side -1 = left, 1 = right). th: 0 = top … π = bottom; ph: angle around. */
export function cortex(side: number, th: number, ph: number, depth = 1): P3 {
  const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
  const fold = 1 + 0.055 * Math.sin(11 * th + 3 * Math.sin(5 * ph)) * Math.cos(7 * ph + 2 * Math.sin(6 * th)); // gyri
  const medial = x * side < 0 ? 0.5 : 1; // the inner faces of the hemispheres are flatter
  const taper = 1 - 0.2 * Math.max(0, z) - 0.08 * Math.max(0, -z); // narrower at the front
  let py = y * 0.5 * fold * depth;
  if (py < -0.27) py = -0.27 + (py + 0.27) * 0.3; // flat underside
  return [side * 0.31 + x * 0.36 * medial * taper * fold * depth, py + 0.1, z * 0.74 * fold * depth];
}

function cerebellum(th: number, ph: number): P3 {
  const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
  const f = 1 + 0.05 * Math.sin(20 * th);
  return [x * 0.36 * f, y * 0.19 * f - 0.36, z * 0.25 * f - 0.5];
}

export type BrainMode = "brain" | "globe" | "orbit";
/** A circular path around the core: radius, two tilts, where it starts and how fast it goes (radians per second). */
export interface Orbit { r: number; tilt: number; node: number; phase: number; speed: number }

/** Where something on an orbit is at time t (seconds). */
export function orbitPos(o: Orbit, t: number): P3 {
  const a = o.phase + o.speed * t;
  const x = Math.cos(a) * o.r, z = Math.sin(a) * o.r;
  const y = z * Math.sin(o.tilt), z2 = z * Math.cos(o.tilt);
  return [x * Math.cos(o.node) + z2 * Math.sin(o.node), y, -x * Math.sin(o.node) + z2 * Math.cos(o.node)];
}

export interface Brain3D {
  /** xyz triples of the surface particles */
  points: Float32Array;
  /** for every particle: index of the nearest bright neuron (-1 = none) and how close it is (0..1) */
  region: Int16Array;
  tint: Float32Array;
  /** polylines that run over the surface like folds */
  folds: P3[][];
  neurons: { key: string; dim: boolean; pos: P3; axon: P3[]; orbit?: Orbit }[];
  core: P3;
}

export function buildBrain3D(input: { key: string; dim?: boolean }[]): Brain3D {
  const rnd = seeded("brain");
  const pts: number[] = [];
  const push = (p: P3) => pts.push(p[0], p[1], p[2]);
  for (let i = 0; i < 3600; i++) push(cortex(i % 2 ? 1 : -1, Math.acos(1 - 2 * rnd()), rnd() * Math.PI * 2));
  for (let i = 0; i < 380; i++) push(cerebellum(Math.acos(1 - 2 * rnd()), rnd() * Math.PI * 2));
  for (let i = 0; i < 130; i++) { // brain stem
    const t = rnd(), a = rnd() * Math.PI * 2, r = 0.075 * (1 - t * 0.3);
    push([Math.cos(a) * r, -0.3 - t * 0.5, -0.24 - t * 0.14 + Math.sin(a) * r]);
  }

  const folds: P3[][] = [];
  for (let i = 0; i < 240; i++) {
    const side = i % 2 ? 1 : -1;
    let th = 0.25 + rnd() * 2.1, ph = rnd() * Math.PI * 2, a = rnd() * Math.PI * 2;
    const line: P3[] = [];
    for (let s = 0; s < 10; s++) {
      line.push(cortex(side, th, ph, 1.01));
      th = Math.min(2.5, Math.max(0.15, th + Math.cos(a) * 0.07));
      ph += (Math.sin(a) * 0.07) / Math.max(0.35, Math.sin(th));
      a += (rnd() - 0.5) * 1.1;
    }
    folds.push(line);
  }

  const core: P3 = [0, -0.02, -0.06];
  const bright = input.filter((n) => !n.dim), faint = input.filter((n) => n.dim);
  const neurons = [...bright, ...faint].map((n, i) => {
    const r = seeded(n.key);
    const side = i % 2 ? 1 : -1;
    const th = 0.42 + ((i * 0.618034 + 0.13) % 1) * 1.45;
    const ph = (side > 0 ? 0 : Math.PI) + (((i * 0.754877 + 0.31) % 1) - 0.5) * 2.5; // on the outer face of its hemisphere
    const pos = cortex(side, th, ph, n.dim ? 0.97 : 0.9);
    const bend: P3 = [(r() - 0.5) * 0.22, (r() - 0.5) * 0.22 + 0.06, (r() - 0.5) * 0.22];
    const mid: P3 = [(core[0] + pos[0]) * 0.5 + bend[0], (core[1] + pos[1]) * 0.5 + bend[1], (core[2] + pos[2]) * 0.5 + bend[2]];
    const axon: P3[] = [];
    for (let s = 0; s <= 16; s++) {
      const u = s / 16, v = 1 - u;
      axon.push([v * v * core[0] + 2 * v * u * mid[0] + u * u * pos[0], v * v * core[1] + 2 * v * u * mid[1] + u * u * pos[1], v * v * core[2] + 2 * v * u * mid[2] + u * u * pos[2]]);
    }
    return { key: n.key, dim: !!n.dim, pos, axon };
  });

  const points = new Float32Array(pts);
  const count = points.length / 3;
  const region = new Int16Array(count).fill(-1);
  const tint = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let best = Infinity, who = -1;
    neurons.forEach((n, j) => {
      if (n.dim) return;
      const d = Math.hypot(points[i * 3] - n.pos[0], points[i * 3 + 1] - n.pos[1], points[i * 3 + 2] - n.pos[2]);
      if (d < best) { best = d; who = j; }
    });
    region[i] = who;
    tint[i] = who < 0 ? 0 : Math.max(0, 1 - best / 0.5);
  }
  return { points, region, tint, folds, neurons, core };
}

/** Rotate (yaw around the vertical axis, then pitch) and project with perspective. Returns screen offsets in brain units, depth z (1 = nearest) and scale. */
export function project3(p: P3, yaw: number, pitch: number): { x: number; y: number; z: number; s: number } {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
  const y = p[1] * cp - z1 * sp, z = p[1] * sp + z1 * cp;
  const s = 3.2 / (3.2 - z);
  return { x: x * s, y: -y * s, z, s };
}

/** The yaw that turns a point to face the viewer. */
export function facingYaw(p: P3): number {
  return Math.atan2(-p[0], p[2]);
}

/** One step of a damped spring (damping 1 = no overshoot; response ≈ seconds to settle). */
export function springStep(value: number, velocity: number, target: number, dt: number, damping = 1, response = 0.5): [number, number] {
  const k = ((Math.PI * 2) / response) ** 2, c = (4 * Math.PI * damping) / response;
  const v = velocity + (-k * (value - target) - c * velocity) * dt;
  return [value + v * dt, v];
}

function straight(a: P3, b: P3, n = 8): P3[] {
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * (i / n), a[1] + (b[1] - a[1]) * (i / n), a[2] + (b[2] - a[2]) * (i / n)] as P3);
}

function tintBy(points: Float32Array, neurons: { pos: P3; dim: boolean }[], reach: number) {
  const count = points.length / 3;
  const region = new Int16Array(count).fill(-1), tint = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let best = Infinity, who = -1;
    neurons.forEach((n, j) => {
      if (n.dim) return;
      const d = Math.hypot(points[i * 3] - n.pos[0], points[i * 3 + 1] - n.pos[1], points[i * 3 + 2] - n.pos[2]);
      if (d < best) { best = d; who = j; }
    });
    region[i] = who;
    tint[i] = who < 0 ? 0 : Math.max(0, 1 - best / reach);
  }
  return { region, tint };
}

/** Alternative look: a holographic globe. Clients are beacons on its surface, wired to the core. */
export function buildGlobe3D(input: { key: string; dim?: boolean }[]): Brain3D {
  const RAD = 0.78, core: P3 = [0, 0, 0];
  const onSphere = (i: number, n: number, r = RAD): P3 => {
    const y = 1 - (2 * (i + 0.5)) / n, s = Math.sqrt(1 - y * y), a = i * 2.399963;
    return [Math.cos(a) * s * r, y * r, Math.sin(a) * s * r];
  };
  const pts: number[] = [];
  for (let i = 0; i < 2600; i++) pts.push(...onSphere(i, 2600));
  const folds: P3[][] = [];
  for (let la = 1; la < 8; la++) { // parallels
    const y = Math.cos((la / 8) * Math.PI) * RAD, r = Math.sin((la / 8) * Math.PI) * RAD;
    folds.push(Array.from({ length: 49 }, (_, i) => [Math.cos((i / 48) * Math.PI * 2) * r, y, Math.sin((i / 48) * Math.PI * 2) * r] as P3));
  }
  for (let lo = 0; lo < 12; lo++) { // meridians
    const a = (lo / 12) * Math.PI * 2;
    folds.push(Array.from({ length: 33 }, (_, i) => { const t = (i / 32) * Math.PI; return [Math.cos(a) * Math.sin(t) * RAD, Math.cos(t) * RAD, Math.sin(a) * Math.sin(t) * RAD] as P3; }));
  }
  const ordered = [...input.filter((n) => !n.dim), ...input.filter((n) => n.dim)];
  const neurons = ordered.map((n, i) => {
    const pos = onSphere(i * 3 + 2, Math.max(8, ordered.length * 3 + 4), RAD * 1.02);
    return { key: n.key, dim: !!n.dim, pos, axon: straight(core, pos) };
  });
  const points = new Float32Array(pts);
  return { points, ...tintBy(points, neurons, 0.55), folds, neurons, core };
}

/** Alternative look: a small solar system. Solyn is the sun, every client a planet on its own orbit. */
export function buildOrbit3D(input: { key: string; dim?: boolean }[]): Brain3D {
  const rnd = seeded("orbit");
  const core: P3 = [0, 0, 0];
  const pts: number[] = [];
  for (let i = 0; i < 1400; i++) { // stars, in a shell around everything
    const y = 1 - 2 * rnd(), s = Math.sqrt(1 - y * y), a = rnd() * Math.PI * 2, r = 0.55 + rnd() * 0.5;
    pts.push(Math.cos(a) * s * r, y * r * 0.7, Math.sin(a) * s * r);
  }
  const ordered = [...input.filter((n) => !n.dim), ...input.filter((n) => n.dim)];
  const folds: P3[][] = [];
  const neurons = ordered.map((n, i) => {
    const r = seeded(n.key);
    const orbit: Orbit = { r: 0.4 + (i / Math.max(1, ordered.length - 1)) * 0.58, tilt: (r() - 0.5) * 0.5, node: r() * Math.PI * 2, phase: r() * Math.PI * 2, speed: 0.34 / (1 + i * 0.45) };
    folds.push(Array.from({ length: 73 }, (_, k) => orbitPos({ ...orbit, phase: (k / 72) * Math.PI * 2, speed: 0 }, 0)));
    const pos = orbitPos(orbit, 0);
    return { key: n.key, dim: !!n.dim, pos, axon: straight(core, pos, 2), orbit };
  });
  const points = new Float32Array(pts);
  return { points, region: new Int16Array(points.length / 3).fill(-1), tint: new Float32Array(points.length / 3), folds, neurons, core };
}

export function buildShape(mode: BrainMode, input: { key: string; dim?: boolean }[]): Brain3D {
  return mode === "globe" ? buildGlobe3D(input) : mode === "orbit" ? buildOrbit3D(input) : buildBrain3D(input);
}
