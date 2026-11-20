import { describe, expect, it } from "vitest";
import { bookingEvent, googleCalendarUrl } from "./google-calendar-link";

describe("google calendar link", () => {
  it("opens Google Calendar with the event filled in", () => {
    const url = new URL(
      googleCalendarUrl({
        title: "Afspraak: Bakkerij",
        start: "2026-11-23T13:00:00.000Z",
        end: "2026-11-23T14:00:00.000Z",
        location: "Markt 1, Tongeren",
        details: "Hallo & co",
      }),
    );
    expect(url.host).toBe("calendar.google.com");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261123T130000Z/20261123T140000Z");
    expect(url.searchParams.get("location")).toBe("Markt 1, Tongeren");
    expect(url.searchParams.get("details")).toBe("Hallo & co");
  });
  it("describes a booking", () => {
    const e = bookingEvent({
      name: "Ann Peeters",
      company: "Bakkerij Peeters",
      email: "ann@x.be",
      phone: "+32 470",
      start: "a",
      end: "b",
      mode: "onsite",
      location: "Markt 1",
      topics: ["SEO"],
      note: "Nieuwe site",
    });
    expect(e.title).toBe("Afspraak: Bakkerij Peeters");
    expect(e.location).toBe("Markt 1");
    expect(e.details).toContain("Onderwerp: SEO");
    expect(e.details).toContain("E-mail: ann@x.be");
    expect(
      bookingEvent({ name: "Bo", email: "b@x.be", start: "a", end: "b", mode: "online" }).location,
    ).toBe("Online");
  });
});
