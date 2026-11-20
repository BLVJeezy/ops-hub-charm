import { describe, expect, it } from "vitest";
import { fromResend, pending } from "./client-email";

describe("client email status", () => {
  it("maps Resend events", () => {
    expect(fromResend("delivered")).toBe("delivered");
    expect(fromResend("email.bounced")).toBe("bounced");
    expect(fromResend("delivery_delayed")).toBe("delayed");
    expect(fromResend("sent", "delayed")).toBe("delayed");
    expect(fromResend("weird", "delivered")).toBe("delivered");
    expect(fromResend(null)).toBe("sent");
  });
  it("keeps asking only while it can still change", () => {
    const now = Date.parse("2026-11-20T12:00:00Z");
    expect(pending("sent", "2026-11-20T10:00:00Z", now)).toBe(true);
    expect(pending("bounced", "2026-11-20T10:00:00Z", now)).toBe(false);
    expect(pending("sent", "2026-11-01T10:00:00Z", now)).toBe(false);
  });
});
