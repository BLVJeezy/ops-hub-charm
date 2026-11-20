import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Input = {
  id: string;
  stage: "start" | "done";
  mail: boolean;
  note?: string;
  estimateMinutes?: number | null;
};

/**
 * Moves a client request along the pipeline (start or done), runs its clock, and, when asked, mails the client.
 * The "started" mail carries an image that shows the time worked each time it is opened.
 * Staff only. The status changes even when the mail cannot be sent; the answer says whether it went.
 */
export const updateRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => {
    if (!input?.id || !/^[0-9a-f-]{36}$/.test(input.id)) throw new Error("Onbekende aanvraag");
    if (input.stage !== "start" && input.stage !== "done") throw new Error("Onbekende stap");
    const est = Number(input.estimateMinutes);
    return {
      id: input.id,
      stage: input.stage,
      mail: !!input.mail,
      note: String(input.note ?? "").slice(0, 3000),
      estimateMinutes: Number.isFinite(est) && est >= 5 && est <= 60000 ? Math.round(est) : null,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff, error: roleError } = await supabase.rpc("is_staff", { _user_id: userId });
    if (roleError) throw new Error(roleError.message);
    if (!staff) throw new Error("Alleen voor het team");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { startPatch, donePatch, workedSeconds, clockLabel, estimateLabel } =
      await import("./request-timer");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: req, error } = await db
      .from("client_requests")
      .select(
        "id, title, status, started_at, worked_seconds, run_started_at, estimate_minutes, contact_name, contact_email, client_id, clients:client_id(name, contact_name, contact_email, request_token)",
      )
      .eq("id", data.id)
      .single();
    if (error || !req) throw new Error("Aanvraag niet gevonden");

    const t = Date.now(),
      now = new Date(t).toISOString();
    const change: Record<string, string | number | null> =
      data.stage === "start"
        ? {
            ...startPatch(req, t),
            started_at: req.started_at ?? now,
            ...(data.estimateMinutes ? { estimate_minutes: data.estimateMinutes } : {}),
          }
        : donePatch(req, t);
    const up = await db
      .from("client_requests")
      .update({ ...change, updated_at: now })
      .eq("id", data.id);
    if (up.error) throw new Error(up.error.message);

    const answer = (mailed: boolean, extra: { to?: string; reason?: string }) => ({
      ok: true,
      change,
      mailed,
      ...extra,
    });
    if (!data.mail) return answer(false, { reason: "niet gevraagd" });
    const to: string | null = req.contact_email || req.clients?.contact_email || null;
    if (!to) return answer(false, { reason: "geen e-mailadres bij deze klant" });
    const key = process.env.RESEND_API_KEY;
    if (!key) return answer(false, { reason: "mail is niet ingesteld" });

    const { requestLink } = await import("./client-requests");
    const { startedMail, doneMail } = await import("./request-mail");
    const hub = (process.env.HUB_PUBLIC_URL || "https://solyn22.lovable.app").replace(/\/$/, "");
    const r = {
      title: req.title,
      client: req.clients?.name ?? "",
      contactName: req.contact_name || req.clients?.contact_name,
      link: req.clients?.request_token
        ? requestLink(req.clients.request_token, req.clients.name)
        : "https://solynglobal.be",
      estimate: estimateLabel(data.estimateMinutes ?? req.estimate_minutes),
      timerUrl: `${hub}/api/public/request-timer?id=${req.id}`,
      worked:
        data.stage === "done" ? clockLabel(workedSeconds({ ...req, ...change } as never, t)) : null,
    };
    const m = data.stage === "start" ? startedMail(r) : doneMail(r, data.note);
    const owner = process.env.ALERT_EMAIL_TO || "jason@solynglobal.be";
    const { sendClientEmail } = await import("./client-email.server");
    const sent = await sendClientEmail(db, {
      to,
      replyTo: owner,
      subject: m.subject,
      html: m.html,
      text: m.text,
      kind: data.stage === "start" ? "aanvraag-gestart" : "aanvraag-klaar",
      clientId: req.client_id ?? null,
      refId: req.id,
    });
    if (!sent.ok) return answer(false, { reason: "versturen mislukte" });
    await db
      .from("client_requests")
      .update(data.stage === "start" ? { start_mailed_at: now } : { done_mailed_at: now })
      .eq("id", data.id);
    return answer(true, { to });
  });
