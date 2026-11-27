import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateCreditAmount } from "@/lib/credit-note";

export const stopInvoiceRepeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { invoiceId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Alleen beheerders kunnen herhalingen stoppen.");

    const now = new Date().toISOString();
    const { error: upErr } = await context.supabase
      .from("invoices")
      .update({
        repeat_monthly: false,
        next_repeat_on: null,
        repeat_day: null,
        repeat_hour: null,
        repeat_stopped_at: now,
      })
      .eq("id", data.invoiceId);
    if (upErr) throw new Error(upErr.message);

    const { error: delErr } = await context.supabase
      .from("invoices")
      .delete()
      .eq("repeat_parent", data.invoiceId)
      .eq("status", "Draft")
      .is("sent_at", null);
    if (delErr) throw new Error(delErr.message);

    return { ok: true as const };
  });

export const createCreditNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      invoiceId: string;
      amount: number;
      reason: string;
      date: string;
      stopRepeat: boolean;
      send: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Alleen beheerders kunnen creditnota's aanmaken.");

    const { data: inv, error: invErr } = await context.supabase
      .from("invoices")
      .select("*")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (invErr) throw new Error(invErr.message);
    if (!inv) throw new Error("Factuur niet gevonden.");
    if (inv.status !== "Sent" && inv.status !== "Paid") {
      throw new Error("Creditnota kan alleen voor verstuurde of betaalde facturen.");
    }

    const amtErr = validateCreditAmount(data.amount, Number(inv.total || 0));
    if (amtErr) throw new Error(amtErr);

    const reason = data.reason.trim() || "Volledige terugbetaling van de vooruitbetaling";
    const { data: created, error: insErr } = await context.supabase
      .from("credit_notes")
      .insert({
        credit_number: "",
        invoice_id: inv.id,
        client: inv.client,
        client_name: inv.client_name,
        client_address: inv.client_address,
        client_vat_number: inv.client_vat_number,
        date: data.date,
        amount: Math.round(data.amount * 100) / 100,
        reason,
        line_items: inv.line_items,
        vat_note: inv.vat_note,
        status: "Draft",
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (insErr || !created) throw new Error(insErr?.message || "Creditnota aanmaken mislukt.");

    if (data.stopRepeat && inv.repeat_monthly) {
      const now = new Date().toISOString();
      await context.supabase
        .from("invoices")
        .update({
          repeat_monthly: false,
          next_repeat_on: null,
          repeat_day: null,
          repeat_hour: null,
          repeat_stopped_at: now,
        })
        .eq("id", inv.id);
      await context.supabase
        .from("invoices")
        .delete()
        .eq("repeat_parent", inv.id)
        .eq("status", "Draft")
        .is("sent_at", null);
    }

    if (data.send) {
      const { deliverCreditNote } = await import("@/lib/credit-note-mail.server");
      const mail = await deliverCreditNote(context.supabase, created.id);
      return { ok: true as const, id: created.id, creditNumber: created.credit_number, sentTo: mail.to };
    }

    return { ok: true as const, id: created.id, creditNumber: created.credit_number, sentTo: null };
  });

export const sendCreditNoteMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { creditNoteId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Alleen beheerders kunnen creditnota's versturen.");
    const { deliverCreditNote } = await import("@/lib/credit-note-mail.server");
    return deliverCreditNote(context.supabase, data.creditNoteId);
  });