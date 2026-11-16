import { describe, expect, it } from "vitest";
import { buildBrain3D, facingYaw, project3, springStep } from "./brain3d";

const input = [{ key: "riory" }, { key: "amano" }, { key: "dyna" }, { key: "tcsc", dim: true }];

describe("buildBrain3D", () => {
  const b = buildBrain3D(input);
  it("is deterministic and stays inside its box", () => {
    expect(buildBrain3D(input).points).toEqual(b.points);
    for (const v of b.points) expect(Math.abs(v)).toBeLessThan(1.05);
  });
  it("gives every client a neuron wired to the core", () => {
    expect(b.neurons.map((n) => n.key)).toEqual(["riory", "amano", "dyna", "tcsc"]);
    for (const n of b.neurons) {
      expect(n.axon[0]).toEqual(b.core);
      expect(n.axon[n.axon.length - 1][0]).toBeCloseTo(n.pos[0]);
    }
  });
  it("spreads neurons over both hemispheres", () => {
    expect(b.neurons[0].pos[0] * b.neurons[1].pos[0]).toBeLessThan(0);
  });
  it("tints surface particles by the nearest client, never a prospect", () => {
    expect(Array.from(b.region).every((r) => r >= 0 && r <= 2)).toBe(true);
    expect(Math.max(...b.tint)).toBeGreaterThan(0.8);
  });
});

describe("camera maths", () => {
  it("turns a point to the front", () => {
    const p: [number, number, number] = [0.5, 0.1, -0.3];
    const q = project3(p, facingYaw(p), 0);
    expect(q.x).toBeCloseTo(0);
    expect(q.z).toBeGreaterThan(0);
  });
  it("draws near things bigger", () => {
    expect(project3([0, 0, 0.8], 0, 0).s).toBeGreaterThan(project3([0, 0, -0.8], 0, 0).s);
  });
  it("springs settle without overshoot", () => {
    let v = 0, x = 0, max = 0;
    for (let i = 0; i < 300; i++) { [x, v] = springStep(x, v, 1, 1 / 120); max = Math.max(max, x); }
    expect(x).toBeCloseTo(1, 2);
    expect(max).toBeLessThanOrEqual(1.01);
  });
});
