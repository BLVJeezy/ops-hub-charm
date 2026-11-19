/** Mails to a client about their request: "we started" and "we're done". Plain, short, in Dutch. */
export type MailReq = { title: string; client: string; contactName?: string | null; link: string };
export type Mail = { subject: string; html: string; text: string };

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const hello = (r: MailReq) => `Dag ${(r.contactName || "").trim().split(/\s+/)[0] || r.client}`;

function frame(r: MailReq, lead: string, body: string, button: string): Mail["html"] {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;color:#1B222C;line-height:1.55">
<p style="margin:0 0 14px">${esc(hello(r))},</p>
<p style="margin:0 0 14px">${lead}</p>
<p style="margin:0 0 18px;padding:12px 14px;background:#F5EFE1;border-radius:10px"><strong>${esc(r.title)}</strong></p>
${body}
<p style="margin:22px 0"><a href="${esc(r.link)}" style="display:inline-block;background:#1B222C;color:#fff;padding:11px 18px;border-radius:999px;text-decoration:none">${esc(button)}</a></p>
<p style="margin:0;color:#555">Met vriendelijke groet,<br>Jason · Solyn Global<br><a href="mailto:jason@solynglobal.be" style="color:#B08A2E">jason@solynglobal.be</a></p>
</div>`;
}

export function startedMail(r: MailReq): Mail {
  const subject = `We zijn begonnen aan je aanvraag – ${r.title}`;
  const html = frame(
    r,
    "Goed nieuws: we zijn begonnen aan je aanvraag.",
    `<p style="margin:0">We laten je weten zodra het klaar is. Je kunt de stand altijd volgen op je klantenpagina.</p>`,
    "Bekijk je aanvragen",
  );
  const text = `${hello(r)},\n\nGoed nieuws: we zijn begonnen aan je aanvraag:\n${r.title}\n\nWe laten je weten zodra het klaar is. Volg de stand op je klantenpagina:\n${r.link}\n\nMet vriendelijke groet,\nJason · Solyn Global`;
  return { subject, html, text };
}

/** `note` is my own message, typed in the Hub; it goes in as plain text. */
export function doneMail(r: MailReq, note?: string | null): Mail {
  const n = (note ?? "").trim();
  const subject = `Je aanvraag is klaar – ${r.title}`;
  const body = `${n ? `<p style="margin:0 0 12px;white-space:pre-wrap">${esc(n)}</p>` : ""}<p style="margin:0">Is er nog iets dat niet klopt? Antwoord gewoon op deze mail of dien een nieuwe aanvraag in.</p>`;
  const html = frame(r, "We zijn klaar met je aanvraag.", body, "Nieuwe aanvraag of afspraak");
  const text = `${hello(r)},\n\nWe zijn klaar met je aanvraag:\n${r.title}\n\n${n ? `${n}\n\n` : ""}Is er nog iets dat niet klopt? Antwoord op deze mail of dien een nieuwe aanvraag in:\n${r.link}\n\nMet vriendelijke groet,\nJason · Solyn Global`;
  return { subject, html, text };
}
