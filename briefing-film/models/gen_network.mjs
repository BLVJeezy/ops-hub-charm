// The Solyn network as one CAD object: a hub mast in the middle, one node per client site on a ring,
// each node = plinth + a collar shell (slides up on explode) + the client's trade silhouette (hot), joined to the hub by a floor conduit.
// Usage: node models/gen_network.mjs data.json > network.json      (metres, y up)
import fs from 'fs';
import { Model } from './mkmodel.mjs';
import { makePlan } from '../plan.js';

const S = JSON.parse(fs.readFileSync(process.argv[2] || 'data.json', 'utf8'));
const P = makePlan(S);
const M = new Model('SOLYN NETWORK');
const TAU = Math.PI * 2;
const R = 1.15;                                    // node ring radius
export const nodeAngle = (i, n) => Math.PI / 2 + i / n * TAU;   // first node faces the default camera (+z)

// ---------- 2D silhouettes (unit box, centred, y up) ----------
const arc = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
const circ = (cx, cy, r, n = 18) => arc(cx, cy, r, 0, TAU, n).slice(0, -1);
function stroke(pts, w) {                          // thick polyline → closed polygon
  const L = [], Rr = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    L.push([pts[i][0] - dy * w / 2, pts[i][1] + dx * w / 2]); Rr.push([pts[i][0] + dy * w / 2, pts[i][1] - dx * w / 2]);
  }
  return [...L, ...Rr.reverse()];
}
const SHAPES = {
  wrench: () => [[
    [-0.09, -0.5], [0.09, -0.5], [0.09, 0.18], [0.2, 0.26], [0.2, 0.5], [0.08, 0.5], [0.08, 0.32], [-0.08, 0.32], [-0.08, 0.5], [-0.2, 0.5], [-0.2, 0.26], [-0.09, 0.18],
  ]],
  scissors: () => [circ(-0.17, -0.33, 0.13), circ(0.17, -0.33, 0.13), stroke([[-0.1, -0.2], [0.05, 0.12], [0.12, 0.5]], 0.07), stroke([[0.1, -0.2], [-0.05, 0.12], [-0.12, 0.5]], 0.07)],
  cross: () => [[[-0.13, -0.45], [0.13, -0.45], [0.13, -0.13], [0.45, -0.13], [0.45, 0.13], [0.13, 0.13], [0.13, 0.45], [-0.13, 0.45], [-0.13, 0.13], [-0.45, 0.13], [-0.45, -0.13], [-0.13, -0.13]]],
  horseshoe: () => [[...arc(0, 0.02, 0.45, -0.28 * Math.PI, 1.28 * Math.PI, 20), ...arc(0, 0.02, 0.25, 1.28 * Math.PI, -0.28 * Math.PI, 20)]],
  house: () => [[[-0.42, -0.45], [0.42, -0.45], [0.42, 0.08], [0, 0.48], [-0.42, 0.08]], [[-0.12, -0.45], [0.12, -0.45], ...arc(0, -0.12, 0.12, 0, Math.PI, 8)]],
  monogram: () => [stroke([...arc(0.02, 0.2, 0.22, 0.15 * Math.PI, 1.5 * Math.PI, 12), ...arc(-0.02, -0.24, 0.22, 0.5 * Math.PI, -0.85 * Math.PI, 12)], 0.12)],
  hex: () => [circ(0, 0, 0.45, 6)],
};

// extrude a set of 2D polygons, standing upright, facing outward along angle `ang`
function extrude(polys, c, ang, size, depth) {
  const right = [Math.cos(ang + Math.PI / 2), 0, Math.sin(ang + Math.PI / 2)], out = [Math.cos(ang), 0, Math.sin(ang)];
  for (const poly of polys) {
    const n = poly.length, rings = [];
    for (const dz of [-depth / 2, depth / 2]) {
      rings.push(poly.map(([x, y]) => M.vtx([c[0] + right[0] * x * size + out[0] * dz, c[1] + y * size, c[2] + right[2] * x * size + out[2] * dz])));
    }
    for (const r of rings) for (let i = 0; i < n; i++) M.edge(r[i], r[(i + 1) % n]);
    for (let i = 0; i < n; i++) { if (i % 2 === 0) M.edge(rings[0][i], rings[1][i]); M.quad(rings[0][i], rings[0][(i + 1) % n], rings[1][(i + 1) % n], rings[1][i]); }
  }
}

// ---------- Hub mast ----------
M.part('hub', { anchor: [0, 0.78, 0], center: [0, 0.6, 0] });
M.piece('hub-base');
M.disc([0, 0.02, 0], [0, 1, 0], 0.36, { rings: [0.36, 0.28, 0.16], seg: 36 });
M.tube([0, 0.02, 0], [0, 0.1, 0], 0.36, { rings: 2, seg: 36, longs: 12 });
M.tube([0, 0.1, 0], [0, 0.95, 0], 0.075, { rings: 8, seg: 14, longs: 7 });
for (const [y, r] of [[0.32, 0.24], [0.54, 0.19], [0.74, 0.14]]) {
  M.ring([0, y, 0], [0, 1, 0], r, 32, 0.035);
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; M.tube([Math.cos(a) * 0.075, y, Math.sin(a) * 0.075], [Math.cos(a) * r, y, Math.sin(a) * r], 0.008, { rings: 2, seg: 6, longs: 2 }); }
}
M.piece('hub-antenna', { explode: [0, 0.18, 0] });
M.tube([0, 0.95, 0], [0, 1.32, 0], 0.018, { rings: 5, seg: 8, longs: 4 });
M.disc([0, 0.95, 0], [0, 1, 0], 0.1, { rings: [0.1, 0.05], seg: 20 });
M.circle([0, 1.18, 0], [0, 1, 0], 0.06, 14);
M.circle([0, 1.32, 0], [0, 1, 0], 0.025, 10);

// ---------- Client nodes ----------
const n = P.sites.length;
P.sites.forEach((s, i) => {
  const a = nodeAngle(i, n), cx = Math.cos(a) * R, cz = Math.sin(a) * R;
  const top = 0.44, iconC = [cx, 0.27, cz];
  M.part('site' + i, { anchor: [cx + Math.cos(a) * 0.05, 0.3, cz + Math.sin(a) * 0.05], center: [cx, 0.28, cz], tagDir: Math.cos(a) < 0 ? -1 : 1 });
  M.piece(`site${i}-plinth`);
  M.disc([cx, 0.06, cz], [0, 1, 0], 0.2, { rings: [0.2, 0.14], seg: 28 });
  M.tube([cx, 0.0, cz], [cx, 0.06, cz], 0.2, { rings: 2, seg: 28, longs: 8 });
  // conduit to the hub, on the floor (physically joins plinth and hub base)
  M.piece(`site${i}-link`, { box: false });
  const r0 = 0.36, r1 = R - 0.2;
  M.tube([Math.cos(a) * r0, 0.03, Math.sin(a) * r0], [Math.cos(a) * r1, 0.03, Math.sin(a) * r1], 0.018, { rings: 6, seg: 8, longs: 3 });
  // collar shell: slides up its own axis on explode
  M.piece(`site${i}-shell`, { explode: [0, 0.3, 0] });
  M.tube([cx, 0.06, cz], [cx, top, cz], 0.205, { rings: 4, seg: 28, longs: 10 });
  M.ring([cx, top, cz], [0, 1, 0], 0.205, 28, 0.02);
  // the client's silhouette (stays, glows when open)
  M.piece(`site${i}-icon`, { hot: true });
  extrude(SHAPES[s.icon](), iconC, a, 0.3, 0.05);
  M.tube([cx, 0.06, cz], [cx, 0.12, cz], 0.025, { rings: 2, seg: 8, longs: 4 });   // stem: icon stands on the plinth
});

process.stdout.write(JSON.stringify(M.toJSON()));
