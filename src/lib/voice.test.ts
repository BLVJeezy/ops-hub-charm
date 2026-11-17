import { describe, expect, it } from "vitest";
import { forSpeech, listenError } from "./voice";

describe("forSpeech", () => {
  it("drops list marks, links and symbols so the answer sounds natural", () => {
    expect(forSpeech("Villa Amano is **active**.\n\n- Fee: €450 per month\n- 2 open tasks\nSee https://example.com/x")).toBe("Villa Amano is active. Fee: €450 per month, 2 open tasks, See");
  });
  it("leaves plain sentences alone", () => {
    expect(forSpeech("All sites are up.")).toBe("All sites are up.");
  });
});

describe("listenError", () => {
  it("explains a blocked microphone", () => {
    expect(listenError("not-allowed")).toContain("blocked");
    expect(listenError("whatever")).toContain("Tap the microphone");
  });
});
