import { describe, expect, it } from "vitest";
import { MAX_CELLS, R_DOMAIN, buildHive, hitTest, project, spiral, stepSpring, type DomainInput } from "./hive";

const dom = (key: string, n: number): DomainInput => ({
  key, label: key, value: String(n), sub: "", tone: "gold",
  cells: Array.from({ length: n }, (_, i) => ({ id: String(i), label: `${key}${i}`, tone: "green" as const })),
});
const domains = [dom("omzet", 3), dom("klanten", 8), dom("websites", 7), dom("facturen", 30), dom("aanvragen", 0), dom("pipeline", 2), dom("contracten", 2)];

describe("buildHive", () => {
  const nodes = buildHive(domains);
  const big = nodes.filter((n) => n.kind === "domain");

  it("puts the first domain in the middle and six around it, touching but not overlapping", () => {
    expect(big).toHaveLength(7);
    expect(big[0]).toMatchObject({ x: 0, y: 0 });
    for (const d of big.slice(1)) {
      const dist = Math.hypot(d.x, d.y);
      expect(dist).toBeGreaterThan(Math.sqrt(3) * R_DOMAIN);
      expect(dist).toBeLessThan(Math.sqrt(3) * R_DOMAIN * 1.1);
    }
  });
  it("keeps every small cell inside its big cell", () => {
    for (const c of nodes.filter((n) => n.kind === "cell")) {
      const d = big.find((b) => b.domain === c.domain)!;
      expect(Math.hypot(c.x - d.x, c.y - d.y) + c.r).toBeLessThanOrEqual(R_DOMAIN * 0.866);
    }
  });
  it("caps a crowded cell and says how many more there are", () => {
    const f = nodes.filter((n) => n.kind === "cell" && n.domain === "facturen");
    expect(f).toHaveLength(MAX_CELLS);
    expect(f[f.length - 1].label).toBe("+12");
  });
  it("is deterministic", () => {
    expect(buildHive(domains)).toEqual(nodes);
  });
  it("hit-tests by level", () => {
    expect(hitTest(nodes, 0, 0, "domain")?.domain).toBe("omzet");
    expect(hitTest(nodes, 0, 0, "cell")?.id).toBe("c:omzet:0");
    expect(hitTest(nodes, 9999, 0, "domain")).toBeNull();
  });
});

describe("helpers", () => {
  it("spirals outward without duplicates", () => {
    const s = spiral(19);
    expect(s[0]).toEqual([0, 0]);
    expect(new Set(s.map((p) => p.join(","))).size).toBe(19);
  });
  it("springs settle on target without overshoot when critically damped", () => {
    let s = { value: 0, velocity: 0, target: 100 };
    let max = 0;
    for (let i = 0; i < 240; i++) { s = stepSpring(s, 1 / 120); max = Math.max(max, s.value); }
    expect(s.value).toBeCloseTo(100, 0);
    expect(max).toBeLessThanOrEqual(100.5);
  });
  it("projects flicks", () => {
    expect(project(1000)).toBeCloseTo(499, 0);
  });
});
