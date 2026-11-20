import { describe, expect, it } from "vitest";
import { changeMail, clientMail, ownerMail, type BookingMail } from "./booking-mail";

const b: BookingMail = {
  name: "Ann <b>Peeters</b>",
  email: "ann@bakkerij.be",
  phone: "+32 470 12 34 56",
  company: "Bakkerij Peeters",
  note: "Nieuwe website",
  when: "vrijdag 20 november om 15:00",
  mode: "onsite",
  location: "Markt 1, Tongeren",
  topics: ["SEO", "Webdesign"],
  files: { sent: 2, stored: 2 },
};

describe("booking mails", () => {
  it("confirms to the client and says where to turn", () => {
    const m = clientMail(b, "jason@solynglobal.be");
    expect(m.subject).toBe("Je boeking is bevestigd – Solyn Global");
    for (const part of [m.html, m.text]) {
      expect(part).toContain("vrijdag 20 november om 15:00");
      expect(part).toContain("Ter plaatse: Markt 1, Tongeren");
      expect(part).toContain("Wil je je afspraak wijzigen of annuleren?");
      expect(part).toContain("jason@solynglobal.be");
    }
    expect(m.html).not.toContain("<b>Peeters</b>"); // what a visitor typed is never markup
    expect(
      clientMail({ ...b, mode: "online", location: "" }, "jason@solynglobal.be").text,
    ).toContain("Online meeting");
  });
  it("tells the owner everything the client filled in", () => {
    const m = ownerMail(b, "https://hub.example/agenda");
    expect(m.subject).toBe("Nieuwe boeking: Ann <b>Peeters</b>, vrijdag 20 november om 15:00");
    expect(m.text).toContain("Bestanden: 2 van 2 bestanden ontvangen");
    expect(m.html).toContain("https://hub.example/agenda");
    expect(m.html).toContain("Bakkerij Peeters");
    expect(m.text).toContain("Onderwerp: SEO, Webdesign");
  });
});

describe("change mails", () => {
  it("tells the client the new time and the old one", () => {
    const m = changeMail(
      { name: "Ann", mode: "online", location: "" },
      { kind: "moved", from: "maandag 23 november om 14:00", to: "dinsdag 24 november om 15:00" },
    );
    expect(m.subject).toBe("Je afspraak is verplaatst – Solyn Global");
    expect(m.text).toContain("Nieuw: dinsdag 24 november om 15:00");
    expect(m.html).toContain("line-through");
  });
  it("tells the client it is cancelled and how to rebook", () => {
    const m = changeMail(
      { name: "Ann", mode: "onsite", location: "Markt 1" },
      { kind: "cancelled", when: "maandag 23 november om 14:00" },
    );
    expect(m.text).toContain("gaat niet door");
    expect(m.html).toContain("solynglobal.be/afspraak");
  });
});
