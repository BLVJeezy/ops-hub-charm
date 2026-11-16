import { describe, expect, it } from "vitest";
import { R_CLIENTS, buildHive, clientRadius, hitTest, project, rubberband, stepSpring } from "./hive";

const input = {
  mrr: 1255,
  clients: [
    { id: "a", name: "Riory", status: "Active", health: "Green", mrr: 500 },
    { id: "b", name: "Villa Amano", status: "Active", health: "Green", mrr: 385 },
    { id: "p", name: "TCSC", status: "Prospect", stage: "Proposal Sent", mrr: 0 },
    { id: "w", name: "Oud", status: "Write-off", mrr: 0 },
  ],
  sites: [
    { id: "s1", client_id: "a", name: "riory.be", status: "up", visitors: 30 },
    { id: "s2", client_id: null, name: "Hub", status: "down", visitors: 0 },
  ],
  invoices: [
    { id: "i1", client: "a", total: 500, status: "Paid", planned: false, nr: "43", date: "2026-11-01" },
    { id: "i2", client: "a", total: 500, status: "Draft", planned: true, nr: "44", date: "2026-12-01" },
  ],
  records: [{ id: "r1", site_id: "s1", kind: "lead", title: "Jos", when: "2026-11-16" }],
};

describe("buildHive", () => {
  const { nodes, edges } = buildHive(input);
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  it("puts the core in the middle and the biggest client at the top", () => {
    expect(byId.core).toMatchObject({ x: 0, y: 0 });
    expect(byId["c:a"].x).toBeCloseTo(0);
    expect(byId["c:a"].y).toBeCloseTo(-R_CLIENTS);
  });
  it("skips written-off clients and keeps prospects on the outer ring", () => {
    expect(byId["c:w"]).toBeUndefined();
    expect(byId["c:p"].kind).toBe("prospect");
    expect(Math.hypot(byId["c:p"].x, byId["c:p"].y)).toBeGreaterThan(R_CLIENTS);
  });
  it("hangs sites, invoices and records on their owners", () => {
    expect(byId["s:s1"].parent).toBe("c:a");
    expect(byId["s:s2"].parent).toBe("core");
    expect(byId["s:s2"].pulse).toBe(true);
    expect(byId["i:i1"].tone).toBe("green");
    expect(byId["i:i2"].tone).toBe("sky");
    expect(byId["r:r1"].parent).toBe("s:s1");
  });
  it("flows money and visitors along edges", () => {
    expect(edges.find((e) => e.from === "c:a")!.flow).toBe(1);
    expect(edges.find((e) => e.from === "s:s2")!.flow).toBe(0);
  });
  it("is deterministic", () => {
    expect(buildHive(input)).toEqual(buildHive(input));
  });
});

describe("helpers", () => {
  it("caps client size", () => {
    expect(clientRadius(0)).toBe(18);
    expect(clientRadius(1e6)).toBe(46);
  });
  it("hit-tests the smallest node under the point", () => {
    const { nodes } = buildHive(input);
    const site = nodes.find((n) => n.id === "s:s1")!;
    expect(hitTest(nodes, site.x, site.y)?.id).toBe("s:s1");
    expect(hitTest(nodes, 9999, 9999)).toBeNull();
  });
  it("springs settle on target without overshoot when critically damped", () => {
    let s = { value: 0, velocity: 0, target: 100 };
    let max = 0;
    for (let i = 0; i < 240; i++) { s = stepSpring(s, 1 / 120); max = Math.max(max, s.value); }
    expect(s.value).toBeCloseTo(100, 0);
    expect(max).toBeLessThanOrEqual(100.5);
  });
  it("projects flicks and rubber-bands edges", () => {
    expect(project(1000)).toBeCloseTo(499, 0);
    expect(rubberband(100, 400)).toBeLessThan(100);
    expect(rubberband(-100, 400)).toBeGreaterThan(-100);
  });
});
