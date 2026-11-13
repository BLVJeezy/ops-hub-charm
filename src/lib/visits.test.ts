import { describe, expect, it } from "vitest";
import { isBot, normalizePath, sourceOf, visitorHash, visitTotals } from "./visits";
import { shiftDay } from "./site-stats";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

describe("isBot", () => {
  it("lets normal browsers through", () => expect(isBot(CHROME)).toBe(false));
  it("blocks bots, our own monitor and empty agents", () => {
    expect(isBot("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe(true);
    expect(isBot("SolynStatusHub/1.0 (+https://solynglobal.be)")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot(null)).toBe(true);
  });
});

describe("normalizePath", () => {
  it("drops query and hash", () =>
    expect(normalizePath("https://a.be/diensten/wc-verstopt?x=1#top")).toBe(
      "/diensten/wc-verstopt",
    ));
  it("drops trailing slash but keeps root", () => {
    expect(normalizePath("/kamers/")).toBe("/kamers");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath(undefined)).toBe("/");
  });
  it("decodes", () => expect(normalizePath("/caf%C3%A9")).toBe("/café"));
});

describe("sourceOf", () => {
  it("uses utm_source first", () =>
    expect(sourceOf("https://google.com/", "https://riory.be/?utm_source=GBP")).toBe("gbp"));
  it("names well-known referrers", () => {
    expect(sourceOf("https://www.google.be/", "https://riory.be/")).toBe("Google");
    expect(sourceOf("https://l.facebook.com/x", "https://riory.be/")).toBe("Facebook");
    expect(sourceOf("https://chatgpt.com/", "https://riory.be/")).toBe("ChatGPT");
  });
  it("internal navigation and no referrer are Direct", () => {
    expect(sourceOf("https://www.riory.be/contact", "https://riory.be/")).toBe("Direct");
    expect(sourceOf("", "https://riory.be/")).toBe("Direct");
  });
  it("other sites by host", () =>
    expect(sourceOf("https://www.goudengids.be/x", "https://riory.be/")).toBe("goudengids.be"));
});

describe("visitorHash", () => {
  it("is stable within a day and changes the next day", async () => {
    const a = await visitorHash("s", "2026-11-13", "t", "1.2.3.4", CHROME);
    const b = await visitorHash("s", "2026-11-13", "t", "1.2.3.4", CHROME);
    const c = await visitorHash("s", "2026-11-14", "t", "1.2.3.4", CHROME);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("visitTotals", () => {
  const rows = [
    { day: "2026-11-13", pageviews: 10, visitors: 4 },
    { day: "2026-11-10", pageviews: 5, visitors: 2 },
    { day: "2026-10-20", pageviews: 3, visitors: 1 },
    { day: "2026-01-01", pageviews: 1, visitors: 1 },
  ];
  const t = visitTotals(rows, "2026-11-13", shiftDay);
  it("today / week / month / all time", () => {
    expect(t.today).toEqual({ visitors: 4, pageviews: 10 });
    expect(t.week).toEqual({ visitors: 6, pageviews: 15 });
    expect(t.month).toEqual({ visitors: 7, pageviews: 18 });
    expect(t.all).toEqual({ visitors: 8, pageviews: 19 });
  });
});
