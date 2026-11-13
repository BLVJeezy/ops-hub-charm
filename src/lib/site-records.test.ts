import { describe, expect, it } from "vitest";
import { normaliseRecords } from "./site-records";

describe("normaliseRecords", () => {
  it("accepts arrays and {records}, drops bad rows, dedupes", () => {
    const rows = normaliseRecords({
      records: [
        { kind: "reservatie", external_id: "R1", starts_at: "2026-11-20", ends_at: "2026-11-22", amount: 450, extra: { gasten: 2 } },
        { kind: "reservatie", external_id: "R1", status: "bevestigd" },
        { kind: "", external_id: "x" },
        null,
        { kind: "aanvraag", external_id: 7, starts_at: "nonsense", amount: "12" },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ external_id: "R1", status: "bevestigd" });
    expect(rows[1]).toMatchObject({ external_id: "7", starts_at: null, amount: null, extra: {} });
    expect(normaliseRecords([{ kind: "lead", external_id: "a", starts_at: "2026-11-20" }])[0].starts_at).toBe("2026-11-20T00:00:00.000Z");
    expect(normaliseRecords("oops")).toEqual([]);
  });
});
