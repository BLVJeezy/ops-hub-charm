/**
 * Supportchat tussen de beheerpagina van een klantwebsite en de Hub.
 * Een gesprek (support_threads) hoort bij één site; berichten (support_messages) komen van "client" of "solyn".
 * Foto's in de chat gaan naar de openbare map "beheer" onder <site>/chat/ met een willekeurige naam.
 */
import { SITES } from "./beheer-sites";

export type Attachment = { url: string; name: string; type: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const HUB = () => (process.env.HUB_PUBLIC_URL || "https://solyn22.lovable.app").replace(/\/$/, "");
export const threadLink = (id: string) => `${HUB()}/support?t=${id}`;
const IMG = new Set(["image/jpeg", "image/png", "image/webp"]);
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Stores one chat image (jpg/png/webp, max 4 MB) and returns it as an attachment, or null. */
export async function storeChatImage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  site: string,
  bytes: Uint8Array,
  type: string,
  name: string,
): Promise<Attachment | null> {
  if (!IMG.has(type) || bytes.length > 4 * 1024 * 1024 || bytes.length < 50) return null;
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${site}/chat/${crypto.randomUUID()}.${ext}`;
  const up = await admin.storage.from("beheer").upload(path, bytes, { contentType: type, upsert: false, cacheControl: "31536000" });
  if (up.error) {
    console.error("[support] image not stored", up.error.message);
    return null;
  }
  return { url: admin.storage.from("beheer").getPublicUrl(path).data.publicUrl, name: name.slice(0, 120) || "foto." + ext, type };
}

/** Opens a new conversation with its first client message. Returns the thread id, or null. */
export async function createThread(
  db: Db,
  o: { site: string; title: string; body: string; attachments: Attachment[]; requestId?: string | null },
): Promise<string | null> {
  const s = SITES[o.site];
  if (!s) return null;
  const now = new Date().toISOString();
  const { data: t, error } = await db
    .from("support_threads")
    .insert({
      site: o.site,
      client_id: s.clientId,
      request_id: o.requestId ?? null,
      title: o.title.slice(0, 160) || "Bericht van " + s.name,
      status: "open",
      last_author: "client",
      updated_at: now,
      client_seen_at: now,
    })
    .select("id")
    .single();
  if (error || !t) {
    console.error("[support] thread not made", error?.message);
    return null;
  }
  const m = await db
    .from("support_messages")
    .insert({ thread_id: t.id, author: "client", body: o.body.slice(0, 6000), attachments: o.attachments });
  if (m.error) console.error("[support] first message not stored", m.error.message);
  return t.id as string;
}

export async function sendMail(to: string, subject: string, html: string, text: string, replyTo?: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: process.env.BOOKING_EMAIL_FROM || "Solyn Global <status@solynglobal.be>",
      to: [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  return res.ok;
}

/** Tells me (Jason) that a client wrote in the chat. */
export async function mailOwnerAboutMessage(site: string, threadId: string, title: string, body: string, images: number) {
  const s = SITES[site];
  const owner = process.env.ALERT_EMAIL_TO || "jason@solynglobal.be";
  const link = threadLink(threadId);
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#111"><h2 style="margin:0 0 4px">Nieuw chatbericht van ${esc(s?.name ?? site)}</h2><p style="margin:0 0 12px;color:#666">${esc(title)}</p><p style="white-space:pre-wrap;background:#f5f5f5;border-radius:10px;padding:12px;font-size:14px">${esc(body || "(foto)")}</p>${images ? `<p style="color:#666;font-size:13px">${images} foto${images > 1 ? "'s" : ""} bijgevoegd in de chat.</p>` : ""}<p><a href="${link}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none">Antwoord in de Hub</a></p></div>`;
  const text = `Nieuw chatbericht van ${s?.name ?? site}\n${title}\n\n${body}\n\n${link}`;
  return sendMail(owner, `Chat ${s?.name ?? site}: ${title}`.slice(0, 180), html, text);
}
