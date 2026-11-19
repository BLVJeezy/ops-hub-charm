/** The two mails a booking sends: the confirmation to the client and the request to the owner. */
export type BookingMail = {
  name: string;
  email: string;
  phone: string;
  company: string;
  note: string;
  when: string;
  mode: "online" | "onsite";
  location: string;
  topics: string[];
  files: { sent: number; stored: number };
};
export type Mail = { subject: string; html: string; text: string };
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
const INK = "#1B222C",
  GOLD = "#B08A2E",
  SOFT = "#F5F3EE";

const shell = (
  title: string,
  inner: string,
) => `<div style="background:${SOFT};padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:${INK}">
  <div style="max-width:540px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden">
    <div style="padding:22px 26px 0"><div style="font-size:13px;font-weight:bold;letter-spacing:.02em;color:${GOLD}">Solyn Global</div><h1 style="font-size:22px;line-height:1.25;margin:10px 0 0">${title}</h1></div>
    <div style="padding:14px 26px 26px;font-size:15px;line-height:1.55">${inner}</div>
  </div>
  <div style="max-width:540px;margin:12px auto 0;font-size:12px;color:#7a7a7a;text-align:center">Solyn Global Ltd · solynglobal.be</div>
</div>`;
const rows = (pairs: [string, string][]) =>
  `<table role="presentation" style="width:100%;border-collapse:collapse;margin:14px 0;background:${SOFT};border-radius:10px">${pairs
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:9px 14px;font-size:13px;color:#6b6b6b;width:96px;vertical-align:top">${k}</td><td style="padding:9px 14px 9px 0;font-size:15px"><strong>${v}</strong></td></tr>`,
    )
    .join("")}</table>`;
const how = (b: BookingMail) =>
  b.mode === "onsite" ? `Ter plaatse: ${b.location}` : "Online meeting";

/** To the client: the booking is confirmed, and where to turn to change it, ask something or send information ahead. */
export function clientMail(b: BookingMail, contact: string): Mail {
  const subject = "Je boeking is bevestigd – Solyn Global";
  const html = shell(
    "Je boeking is bevestigd",
    `
    <p style="margin:0 0 4px">Dag ${esc(b.name)},</p>
    <p style="margin:0">Bedankt voor je boeking bij Solyn Global. Dit is je afspraak:</p>
    ${rows([
      ["Wanneer", esc(b.when)],
      ["Duur", "1 uur"],
      ["Hoe", esc(how(b))],
      ["Onderwerp", esc(b.topics.join(", "))],
      ["Met", "Jason Balongo"],
    ])}
    <p style="margin:0 0 14px">${b.mode === "onsite" ? "Jason komt naar het adres hierboven." : "Het gesprek is online. De link ervoor krijg je nog per mail."}</p>
    <div style="border-top:1px solid #e8e6e1;padding-top:14px">
      <p style="margin:0 0 6px"><strong>Wil je je afspraak wijzigen of annuleren?</strong><br><strong>Heb je vragen, of wil je al informatie doorgeven?</strong></p>
      <p style="margin:0">Mail naar <a href="mailto:${contact}" style="color:${GOLD};font-weight:bold">${contact}</a>, of antwoord gewoon op deze mail.</p>
    </div>
    <p style="margin:18px 0 0">Tot dan,<br>Jason Balongo<br>Solyn Global</p>`,
  );
  const text = `Dag ${b.name},

Je boeking bij Solyn Global is bevestigd.

Wanneer: ${b.when}
Duur: 1 uur
Hoe: ${how(b)}
Met: Jason Balongo

${b.mode === "onsite" ? "Jason komt naar het adres hierboven." : "Het gesprek is online. De link ervoor krijg je nog per mail."}

Wil je je afspraak wijzigen of annuleren? Heb je vragen, of wil je al informatie doorgeven?
Mail naar ${contact}, of antwoord op deze mail.

Tot dan,
Jason Balongo
Solyn Global`;
  return { subject, html, text };
}

/** To the owner: a new booking request came in, with everything the client filled in. */
export function ownerMail(b: BookingMail, hubUrl: string | null): Mail {
  const filesLine = b.files.sent
    ? `${b.files.stored} van ${b.files.sent} ${b.files.sent === 1 ? "bestand" : "bestanden"} ontvangen`
    : "";
  const subject = `Nieuwe boeking: ${b.name}, ${b.when}`;
  const html = shell(
    "Nieuwe boekingsaanvraag",
    `
    <p style="margin:0">Er is een afspraak geboekt via solynglobal.be/afspraak.</p>
    ${rows([
      ["Wanneer", esc(b.when)],
      ["Hoe", esc(how(b))],
      ["Onderwerp", esc(b.topics.join(", "))],
      ["Naam", esc(b.name)],
      ["Bedrijf", esc(b.company)],
      ["E-mail", `<a href="mailto:${esc(b.email)}" style="color:${INK}">${esc(b.email)}</a>`],
      ["Telefoon", esc(b.phone)],
      ["Bestanden", esc(filesLine)],
    ])}
    ${b.note ? `<p style="margin:0 0 6px;font-size:13px;color:#6b6b6b">Waarover de klant het wil hebben</p><p style="margin:0 0 14px;padding:11px 14px;border-radius:10px;background:${SOFT};white-space:pre-wrap">${esc(b.note)}</p>` : ""}
    ${hubUrl ? `<p style="margin:0"><a href="${hubUrl}" style="display:inline-block;background:${INK};color:#ffffff;text-decoration:none;font-weight:bold;padding:11px 18px;border-radius:10px">Open de Agenda in de Hub</a></p>` : ""}
    <p style="margin:14px 0 0;font-size:13px;color:#6b6b6b">Antwoord op deze mail om de klant rechtstreeks te schrijven.${b.mode === "online" ? " Denk eraan de link voor het online gesprek te sturen." : ""}</p>`,
  );
  const text = `Nieuwe boekingsaanvraag via solynglobal.be/afspraak

Wanneer: ${b.when}
Hoe: ${how(b)}${b.topics.length ? `\nOnderwerp: ${b.topics.join(", ")}` : ""}
Naam: ${b.name}${b.company ? `\nBedrijf: ${b.company}` : ""}
E-mail: ${b.email}${b.phone ? `\nTelefoon: ${b.phone}` : ""}${filesLine ? `\nBestanden: ${filesLine}` : ""}${b.note ? `\n\n${b.note}` : ""}${hubUrl ? `\n\nAgenda: ${hubUrl}` : ""}`;
  return { subject, html, text };
}
