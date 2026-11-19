import { describe, expect, it } from "vitest";
import { doneMail, startedMail } from "./request-mail";

const r = {
  title: "Nieuwe foto's <home>",
  client: "Villa Amano",
  contactName: "Anne-Sophie Peeters",
  link: "https://solynglobal.be/client/villa-amano#abc",
};
describe("request mails", () => {
  it("tells the client we started", () => {
    const m = startedMail(r);
    expect(m.subject).toBe("We zijn begonnen aan je aanvraag – Nieuwe foto's <home>");
    expect(m.text).toContain("Dag Anne-Sophie");
    expect(m.html).toContain("Nieuwe foto&#39;s &lt;home&gt;");
    expect(m.html).toContain(r.link);
  });
  it("tells the client we're done, with my own note escaped", () => {
    const m = doneMail({ ...r, contactName: null }, "Alles staat online.\n<b>Check</b> even");
    expect(m.text).toContain("Dag Villa Amano");
    expect(m.text).toContain("Alles staat online.");
    expect(m.html).toContain("&lt;b&gt;Check&lt;/b&gt;");
    expect(doneMail(r).html).not.toContain("white-space:pre-wrap");
  });
});
