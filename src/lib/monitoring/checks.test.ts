import { describe, expect, it, vi } from "vitest";
import {
  checkUrl,
  dbHealthHeaders,
  decideIncidents,
  deployResult,
  emailResult,
  fromDomain,
  isDue,
  isSecretKey,
  overallStatus,
  parseEndpoints,
  severityFor,
  type CheckResult,
} from "./checks";

const ok = (kind: CheckResult["kind"], ms = 300): CheckResult => ({
  kind,
  target: "t",
  ok: true,
  status_code: 200,
  response_ms: ms,
  error: null,
});
const fail = (kind: CheckResult["kind"]): CheckResult => ({
  kind,
  target: "t",
  ok: false,
  status_code: 500,
  response_ms: 100,
  error: "HTTP 500",
});

function jwt(payload: object) {
  const b64 = (o: object) =>
    btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.sig`;
}

describe("checkUrl", () => {
  it("passes on 200 and records latency", async () => {
    const f = vi.fn(async () => new Response("hi", { status: 200 }));
    const r = await checkUrl("http", "https://x.be", { fetchImpl: f, retryDelayMs: 0 });
    expect(r.ok).toBe(true);
    expect(r.status_code).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("retries once, then fails on 503", async () => {
    const f = vi.fn(async () => new Response("down", { status: 503 }));
    const r = await checkUrl("http", "https://x.be", { fetchImpl: f, retryDelayMs: 0 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("HTTP 503");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("recovers when the retry succeeds", async () => {
    const f = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const r = await checkUrl("http", "https://x.be", { fetchImpl: f, retryDelayMs: 0 });
    expect(r.ok).toBe(true);
  });

  it("marks a JSON health endpoint that reports store:false as failed", async () => {
    const f = vi.fn(async () => Response.json({ ok: true, store: false }));
    const r = await checkUrl("db", "https://x.be/api/ops?a=status", {
      fetchImpl: f,
      retryDelayMs: 0,
    });
    expect(r.ok).toBe(false);
  });

  it("honours expect_status", async () => {
    const f = vi.fn(async () => new Response("", { status: 401 }));
    const r = await checkUrl("api", "https://x.be/api", {
      fetchImpl: f,
      expectStatus: 401,
      retryDelayMs: 0,
    });
    expect(r.ok).toBe(true);
  });
});

describe("secret key guard", () => {
  it("detects service_role JWTs and sb_secret keys", () => {
    expect(isSecretKey(jwt({ role: "service_role" }))).toBe(true);
    expect(isSecretKey("sb_secret_abc")).toBe(true);
    expect(isSecretKey(jwt({ role: "anon" }))).toBe(false);
    expect(isSecretKey("sb_publishable_abc")).toBe(false);
  });
  it("refuses to build headers from a secret key", () => {
    expect(() => dbHealthHeaders("sb_secret_x")).toThrow();
    expect(dbHealthHeaders("sb_publishable_x")).toEqual({ apikey: "sb_publishable_x" });
  });
});

describe("overallStatus", () => {
  it("is down when the website fails", () =>
    expect(overallStatus([fail("http"), ok("db")])).toBe("down"));
  it("is degraded when another check fails", () =>
    expect(overallStatus([ok("http"), fail("db")])).toBe("degraded"));
  it("is degraded when slow", () => expect(overallStatus([ok("http", 6000)])).toBe("degraded"));
  it("is up when all pass", () => expect(overallStatus([ok("http"), ok("api")])).toBe("up"));
});

describe("severity", () => {
  it("follows the alert levels", () => {
    expect(severityFor("http", false)).toBe("critical");
    expect(severityFor("db", true)).toBe("critical");
    expect(severityFor("db", false)).toBe("warning");
    expect(severityFor("email", true)).toBe("warning");
  });
});

describe("decideIncidents", () => {
  const now = new Date("2026-11-13T12:00:00Z");

  it("opens an incident for a new failure", () => {
    const a = decideIncidents([fail("http")], [], false, now);
    expect(a).toEqual([
      expect.objectContaining({ type: "open", kind: "http", severity: "critical" }),
    ]);
  });

  it("does not re-open or re-notify a recent incident", () => {
    const a = decideIncidents(
      [fail("http")],
      [{ id: "1", kind: "http", severity: "critical", last_notified_at: "2026-11-13T10:00:00Z" }],
      false,
      now,
    );
    expect(a).toEqual([]);
  });

  it("re-notifies a critical incident after 6h", () => {
    const a = decideIncidents(
      [fail("http")],
      [{ id: "1", kind: "http", severity: "critical", last_notified_at: "2026-11-13T05:00:00Z" }],
      false,
      now,
    );
    expect(a).toEqual([expect.objectContaining({ type: "renotify", id: "1" })]);
  });

  it("never re-notifies warnings", () => {
    const a = decideIncidents(
      [fail("email")],
      [{ id: "2", kind: "email", severity: "warning", last_notified_at: "2026-11-01T00:00:00Z" }],
      false,
      now,
    );
    expect(a).toEqual([]);
  });

  it("resolves when the check passes again", () => {
    const a = decideIncidents(
      [ok("http")],
      [{ id: "1", kind: "http", severity: "critical", last_notified_at: null }],
      false,
      now,
    );
    expect(a).toEqual([{ type: "resolve", id: "1", kind: "http" }]);
  });

  it("treats a kind as failing if any of its checks fail", () => {
    const a = decideIncidents([ok("api"), fail("api")], [], true, now);
    expect(a).toEqual([
      expect.objectContaining({ type: "open", kind: "api", severity: "critical" }),
    ]);
  });
});

describe("helpers", () => {
  it("isDue respects the interval", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    expect(isDue(null, 15, now)).toBe(true);
    expect(isDue("2026-11-13T11:50:00Z", 15, now)).toBe(false);
    expect(isDue("2026-11-13T11:45:00Z", 15, now)).toBe(true);
  });
  it("deployResult flags failed deployments", () => {
    expect(deployResult("prj", { state: "READY" }).ok).toBe(true);
    expect(deployResult("prj", { state: "ERROR" }).ok).toBe(false);
  });
  it("emailResult flags problems", () => {
    expect(emailResult("riory.be", 0).ok).toBe(true);
    expect(emailResult("riory.be", 2).ok).toBe(false);
  });
  it("fromDomain parses Resend from fields", () => {
    expect(fromDomain("Solyn Global <Factuur@SolynGlobal.be>")).toBe("solynglobal.be");
    expect(fromDomain("info@riory.be")).toBe("riory.be");
    expect(fromDomain(undefined)).toBe(null);
  });
  it("parseEndpoints keeps only https entries", () => {
    expect(parseEndpoints([{ url: "https://a.be/x" }, { url: "http://b.be" }, "junk"])).toEqual([
      { url: "https://a.be/x" },
    ]);
  });
});
