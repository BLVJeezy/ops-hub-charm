import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { clockPng } from "./timer-png";

describe("clock png", () => {
  it("writes a valid PNG that decodes to the right size", () => {
    const png = clockPng("1:23:45", { scale: 2 });
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer);
    const w = view.getUint32(16),
      h = view.getUint32(20);
    expect(w).toBe(2 * 2 * 2 + 7 * (5 * 2 + 2) - 2);
    expect(h).toBe(2 * 2 * 2 + 7 * 2);
    // find IDAT and inflate it
    let i = 8,
      idat: Uint8Array | null = null;
    while (i < png.length) {
      const len = view.getUint32(i),
        type = String.fromCharCode(...png.slice(i + 4, i + 8));
      if (type === "IDAT") idat = png.slice(i + 8, i + 8 + len);
      i += 12 + len;
    }
    const raw = inflateSync(Buffer.from(idat!));
    expect(raw.length).toBe(h * (w + 1));
    expect(raw.includes(1)).toBe(true);
  });
  it("handles big images across several stored blocks", () => {
    const png = clockPng("12d 23:59", { scale: 20 });
    expect(png.length).toBeGreaterThan(65535);
  });
});
