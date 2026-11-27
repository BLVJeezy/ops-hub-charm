import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { OffboardContext, OffboardService } from "@/lib/offboarding";

async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Alleen beheerders kunnen deze actie uitvoeren.");
}

export const getOffboardContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientId: string }) => input)
  .handler(async ({ data, context }): Promise<OffboardContext> => {
    await assertAdmin(context.supabase, context.userId);

    const [clientRes, invRes, recRes, tasksRes, agrRes, vidRes] = await Promise.all([
      context.supabase
        .from("clients")
        .select(
          "id, name, status, social_monthly_fee, social_setup_fee, social_end_date, seo_package, monthly_fee, yearly_fee, seo_end_date, website_monthly_fee, website_yearly_fee",
        )
        .eq("id", data.clientId)
        .maybeSingle(),
      context.supabase
        .from("invoices")
        .select("id, invoice_number, date, total, credited_amount, status, repeat_monthly")
        .eq("client", data.clientId)
        .order("date", { ascending: false }),
      context.supabase
        .from("client_recurring_tasks")
        .select("id")
        .eq("client_id", data.clientId)
        .eq("active", true),
      context.supabase
        .from("client_tasks")
        .select("id, due_date")
        .eq("client_id", data.clientId)
        .is("done_at", null),
      context.supabase
        .from("client_agreements")
        .select("id, reference, title, status")
        .eq("client_id", data.clientId)
        .in("status", ["Concept", "Verstuurd", "Ondertekend"]),
      context.supabase
        .from("video_projects")
        .select("id, month, status")
        .eq("client_id", data.clientId)
        .not("status", "in", "(goedgekeurd,afgerond)"),
    ]);

    if (clientRes.error || !clientRes.data) {
      throw new Error(clientRes.error?.message || "Klant niet gevonden.");
    }

    const allInvoices = invRes.data ?? [];
    const creditableInvoices = allInvoices
      .filter((i) => i.status === "Sent" || i.status === "Paid")
      .map((i) => ({
        id: i.id,
        invoice_number: i.invoice_number,
        date: i.date,
        total: Number(i.total || 0),
        credited_amount: i.credited_amount == null ? null : Number(i.credited_amount),
        status: i.status,
        repeat_monthly: Boolean(i.repeat_monthly),
      }));

    return {
      client: clientRes.data,
      invoices: creditableInvoices,
      repeatingCount: allInvoices.filter((i) => i.repeat_monthly).length,
      activeRecurringTasksCount: (recRes.data ?? []).length,
      openTasks: (tasksRes.data ?? []).map((t) => ({ id: t.id, due_date: t.due_date })),
      activeAgreements: agrRes.data ?? [],
      unfinishedVideos: (vidRes.data ?? []).map((v) => ({
        id: v.id,
        month: v.month,
        status: v.status,
      })),
    };
  });

export type OffboardPayload = {
  clientId: string;
  services: OffboardService[];
  all: boolean;
  endDate: string;
  reason: string;
  creditNotes: Array<{ invoice_id: string; amount: number }>;
  sendCreditNotes: boolean;
  stopInvoices: boolean;
  stopTasks: boolean;
  endAgreements: boolean;
  pauseClient: boolean;
  closeVideos: boolean;
};

type OffboardRpcResult = {
  credit_notes: Array<{ id: string; credit_number: string; amount: number }>;
  stopped_invoices: number;
  stopped_recurring_tasks: number;
  deleted_tasks: number;
  ended_agreements: string[];
  deleted_videos: number;
  new_status: string;
  summary_line: string;
};

export const runClientOffboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: OffboardPayload) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    if (!data.endDate || !/^\d{4}-\d{2}-\d{2}$/.test(data.endDate)) {
      throw new Error("Kies een geldige einddatum.");
    }

    for (const cn of data.creditNotes) {
      if (!Number.isFinite(cn.amount) || cn.amount <= 0) {
        throw new Error("Elk creditbedrag moet groter zijn dan €0.");
      }
    }

    const { data: rpcData, error } = await context.supabase.rpc("offboard_client", {
      _client_id: data.clientId,
      _services: data.services,
      _all: data.all,
      _end_date: data.endDate,
      _reason: data.reason.trim(),
      _credit_notes: data.creditNotes,
      _stop_invoices: data.stopInvoices,
      _stop_tasks: data.stopTasks,
      _end_agreements: data.endAgreements,
      _pause_client: data.pauseClient,
      _close_videos: data.closeVideos,
    });
    if (error) throw new Error(error.message);

    const result = rpcData as unknown as OffboardRpcResult;
    const mailed: string[] = [];
    const mailErrors: string[] = [];

    if (data.sendCreditNotes && result.credit_notes.length > 0) {
      const { deliverCreditNote } = await import("@/lib/credit-note-mail.server");
      for (const cn of result.credit_notes) {
        try {
          await deliverCreditNote(context.supabase, cn.id);
          mailed.push(cn.credit_number);
        } catch (err) {
          mailErrors.push(
            `${cn.credit_number}: ${err instanceof Error ? err.message : "versturen mislukt"}`,
          );
        }
      }
    }

    return {
      ok: true as const,
      ...result,
      mailed,
      mailErrors,
    };
  });

export const reactivateClientFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientId: string; services: OffboardService[]; date: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("reactivate_client", {
      _client_id: data.clientId,
      _services: data.services,
      _date: data.date,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });