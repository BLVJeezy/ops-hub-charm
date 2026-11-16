import { describe, expect, it } from "vitest";
import { bez, buildBrain, hitBrain, project, stepSpring, type NeuronInput } from "./brain";

const n = (key: string, tips: number, dim = false): NeuronInput => ({
  key, label: key, value: "€1", sub: "", weight: 0.5, dim,
  tips: Array.from({ length: tips }, (_, i) => ({ id: String(i), label: `t${i}`, tone: "green" as const })),
});
const input = [n("riory", 6), n("amano", 8), n("dyna", 3), n("deb", 3), n("tcsc", 2, true)];

describe("buildBrain", () => {
  const b = buildBrain(input);
  it("grows one neuron per client, the first one pointing up", () => {
    expect(b.neurons).toHaveLength(5);
    expect(b.neurons[0].y).toBeLessThan(-250);
    expect(Math.abs(b.neurons[0].x)).toBeLessThan(60);
  });
  it("connects every cell body to the core and every tip to its cell body", () => {
    for (const x of b.neurons) {
      expect(x.axon.p0).toEqual([0, 0]);
      expect(x.axon.p3).toEqual([x.x, x.y]);
      for (const t of x.tips) { expect(t.curve.p0).toEqual([x.x, x.y]); expect(bez(t.curve, 1)).toEqual([t.x, t.y]); }
    }
  });
  it("keeps prospects further out than clients", () => {
    const far = Math.hypot(b.neurons[4].x, b.neurons[4].y);
    for (const x of b.neurons.slice(0, 4)) expect(Math.hypot(x.x, x.y)).toBeLessThan(far);
  });
  it("is deterministic", () => {
    expect(buildBrain(input)).toEqual(b);
  });
  it("hit-tests cell bodies and tips", () => {
    const x = b.neurons[1];
    expect(hitBrain(b, x.x, x.y, 4, false)?.neuron.key).toBe("amano");
    expect(hitBrain(b, x.tips[2].x, x.tips[2].y, 2, true)?.tip?.id).toBe("2");
    expect(hitBrain(b, 5000, 5000, 4, true)).toBeNull();
  });
});

describe("physics", () => {
  it("springs settle on target without overshoot when critically damped", () => {
    let s = { value: 0, velocity: 0, target: 100 }, max = 0;
    for (let i = 0; i < 240; i++) { s = stepSpring(s, 1 / 120); max = Math.max(max, s.value); }
    expect(s.value).toBeCloseTo(100, 0);
    expect(max).toBeLessThanOrEqual(100.5);
  });
  it("projects flicks", () => {
    expect(project(1000)).toBeCloseTo(499, 0);
  });
});
