import { describe, expect, it } from "vitest";
import { lasted, problems, type IncidentLike } from "./site-problems";

const NOW = new Date("2026-11-19T20:00:00Z").getTime();
const inc = (
  id: string,
  status: "open" | "resolved",
  opened: string,
  resolved: string | null,
  kind = "down",
): IncidentLike => ({
  id,
  site_id: "s1",
  kind,
  severity: "critical",
  title: `Incident ${id}`,
  detail: "HTTP 502",
  status,
  opened_at: opened,
  resolved_at: resolved,
  resolution_note: resolved ? "Vercel opnieuw uitgerold" : null,
});

describe("site problems", () => {
  it("puts open problems first and drops solved ones older than the window", () => {
    const list = problems(
      [
        inc("old", "resolved", "2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z"),
        inc("fixed", "resolved", "2026-11-18T10:00:00Z", "2026-11-18T10:20:00Z"),
        inc("now", "open", "2026-11-19T19:00:00Z", null),
      ],
      [
        {
          target: "gigi-l",
          ok: true,
          at: "2026-11-19T03:07:00Z",
          error: "code: private repo: REPO_TOKEN ontbreekt",
          stale: false,
        },
      ],
      () => "Riory",
      () => "GiGi L Coiffure",
      30,
      NOW,
    );
    expect(list.map((p) => p.id)).toEqual(["now", "backup:gigi-l", "fixed"]);
    expect(list[2].solved).toBe(true);
    expect(list[2].lasted).toBe("20 min");
    expect(list[2].what).toContain("niet bereikbaar");
    expect(list[2].what).toContain("Oplossing: Vercel opnieuw uitgerold");
    expect(list[1].what).toContain("privé-repo");
  });
  it("measures how long a problem lasted", () => {
    expect(lasted("2026-11-19T19:00:00Z", null, NOW)).toBe("1 u");
    expect(lasted("2026-11-17T20:00:00Z", "2026-11-19T20:00:00Z")).toBe("2 d");
    expect(lasted("2026-11-19T19:59:30Z", null, NOW)).toBe("minder dan 2 min");
  });
});
