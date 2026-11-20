import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function staffOnly(context: any) {
  const { data: staff, error } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (error) throw new Error(error.message);
  if (!staff) throw new Error("Alleen voor het team");
}

/**
 * My answer in a support conversation. The client sees it in the chat of their beheerpagina,
 * and gets a short mail (when the client has an e-mail address in the Hub and mail is on).
 */
export const replySupport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { thread: string; body: string; images?: string[]; mail?: boolean; resolve?: boolean }) => {
    if (!input?.thread || !UUID.test(input.thread)) throw new Error("Onbekend gesprek");
    const body = String(input.body ?? "").trim().slice(0, 4000);
    const images = (Array.isArray(input.images) ? input.images : []).filter((x) => typeof x === "string").slice(0, 3);
    if (!body && !images.length) throw new Error("Schrijf eerst een antwoord");
    return { thread: input.thread, body, images, mail: input.mail !== false, resolve: !!input.resolve };
  })
  .handler(async ({ data, context }) => {
    await staffOnly(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { storeChatImage, sendMail } = await import("./support.server");
    const { SITES } = await import("./beheer-sites");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: t, error } = await db
      .from("support_threads")
      .select("id, site, title, client_id, clients:client_id(name, contact_name, contact_email)")
      .eq("id", data.thread)
      .single();
    if (error || !t) throw new Error("Gesprek niet gevonden");

    const attachments = [];
    for (const [i, d] of data.images.entries()) {
      const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(d);
      if (!m) continue;
      const att = await storeChatImage(supabaseAdmin, t.site, Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)), m[1], `foto-${i + 1}`);
      if (att) attachments.push(att);
    }
    const ins = await db
      .from("support_messages")
      .insert({ thread_id: t.id, author: "solyn", body: data.body, attachments })
      .select("id, author, body, attachments, created_at")
      .single();
    if (ins.error) throw new Error(ins.error.message);
    const now = new Date().toISOString();
    await db
      .from("support_threads")
      .update({ updated_at: now, last_author: "solyn", solyn_seen_at: now, ...(data.resolve ? { status: "opgelost" } : { status: "open" }) })
      .eq("id", t.id);

    let mailed = false;
    const to = t.clients?.contact_email as string | undefined;
    const site = SITES[t.site];
    if (data.mail && to && site) {
      const esc = (s: string) =>
        s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
      const hi = t.clients?.contact_name ? `Hallo ${String(t.clients.contact_name).split(" ")[0]},` : "Hallo,";
      const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#111"><p>${esc(hi)}</p><p>Jason van Solyn Global heeft geantwoord op <b>${esc(t.title)}</b>:</p><p style="white-space:pre-wrap;background:#f5f5f5;border-radius:10px;padding:12px;font-size:14px">${esc(data.body || "(foto)")}</p><p><a href="${site.beheer}#chat" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none">Antwoord in je beheer</a></p><p style="color:#666;font-size:13px">Je kan ook gewoon op deze mail antwoorden.</p></div>`;
      const text = `${hi}\n\nJason van Solyn Global heeft geantwoord op "${t.title}":\n\n${data.body}\n\nAntwoorden kan in je beheer: ${site.beheer}#chat`;
      mailed = await sendMail(to, `Antwoord van Solyn: ${t.title}`.slice(0, 180), html, text, process.env.ALERT_EMAIL_TO || "jason@solynglobal.be");
    }
    return { message: ins.data, mailed };
  });

/** Marks a conversation as read by me, and/or sets it to open or solved. */
export const updateSupportThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { thread: string; seen?: boolean; status?: "open" | "opgelost" }) => {
    if (!input?.thread || !UUID.test(input.thread)) throw new Error("Onbekend gesprek");
    if (input.status && input.status !== "open" && input.status !== "opgelost") throw new Error("Onbekende status");
    return { thread: input.thread, seen: !!input.seen, status: input.status };
  })
  .handler(async ({ data, context }) => {
    await staffOnly(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const change: Record<string, string> = {};
    if (data.seen) change.solyn_seen_at = new Date().toISOString();
    if (data.status) change.status = data.status;
    if (!Object.keys(change).length) return { ok: true };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin as any).from("support_threads").update(change).eq("id", data.thread);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
