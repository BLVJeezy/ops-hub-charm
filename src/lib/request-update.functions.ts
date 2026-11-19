import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Input = { id: string; stage: "start" | "done"; mail: boolean; note?: string };

/**
 * Moves a client request along the pipeline (start or done) and, when asked, mails the client.
 * Staff only. The status changes even when the mail cannot be sent; the answer says whether it went.
 */
export const updateRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => {
    if (!input?.id || !/^[0-9a-f-]{36}$/.test(input.id)) throw new Error("Onbekende aanvraag");
    if (input.stage !== "start" && input.stage !== "done") throw new Error("Onbekende stap");
    return {
      id: input.id,
      stage: input.stage,
      mail: !!input.mail,
      note: String(input.note ?? "").slice(0, 3000),
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff, error: roleError } = await supabase.rpc("is_staff", { _user_id: userId });
    if (roleError) throw new Error(roleError.message);
    if (!staff) throw new Error("Alleen voor het team");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: req, error } = await db
      .from("client_requests")
      .select(
        "id, title, contact_name, contact_email, clients:client_id(name, contact_name, contact_email, request_token)",
      )
      .eq("id", data.id)
      .single();
    if (error || !req) throw new Error("Aanvraag niet gevonden");

    const now = new Date().toISOString();
    const change =
      data.stage === "start"
        ? { status: "bezig", started_at: now }
        : { status: "klaar", done_at: now };
    const up = await db
      .from("client_requests")
      .update({ ...change, updated_at: now })
      .eq("id", data.id);
    if (up.error) throw new Error(up.error.message);

    if (!data.mail) return { ok: true, mailed: false as const, reason: "niet gevraagd" };
    const to: string | null = req.contact_email || req.clients?.contact_email || null;
    if (!to) return { ok: true, mailed: false as const, reason: "geen e-mailadres bij deze klant" };
    const key = process.env.RESEND_API_KEY;
    if (!key) return { ok: true, mailed: false as const, reason: "mail is niet ingesteld" };

    const { requestLink } = await import("./client-requests");
    const { startedMail, doneMail } = await import("./request-mail");
    const r = {
      title: req.title,
      client: req.clients?.name ?? "",
      contactName: req.contact_name || req.clients?.contact_name,
      link: req.clients?.request_token
        ? requestLink(req.clients.request_token, req.clients.name)
        : "https://solynglobal.be",
    };
    const m = data.stage === "start" ? startedMail(r) : doneMail(r, data.note);
    const owner = process.env.ALERT_EMAIL_TO || "jason@solynglobal.be";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: process.env.BOOKING_EMAIL_FROM || "Solyn Global <status@solynglobal.be>",
        to: [to],
        reply_to: owner,
        subject: m.subject,
        html: m.html,
        text: m.text,
      }),
    });
    if (!res.ok) return { ok: true, mailed: false as const, reason: "versturen mislukte" };
    await db
      .from("client_requests")
      .update(data.stage === "start" ? { start_mailed_at: now } : { done_mailed_at: now })
      .eq("id", data.id);
    return { ok: true, mailed: true as const, to };
  });
