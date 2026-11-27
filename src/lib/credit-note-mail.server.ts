import * as React from "react";
import { render } from "@react-email/render";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { CreditNoteEmail, creditNoteEmailSubject } from "@/lib/email-templates/credit-note-email";
import { formatInvoiceNumber } from "@/lib/invoice-code";
import { formatDate } from "@/lib/format";
import { formatEURCents } from "@/lib/credit-note";
import type { LineItem } from "@/lib/invoice-pdf";

export async function deliverCreditNote(
  supabase: SupabaseClient<Database>,
  creditNoteId: string,
): Promise<{ ok: true; messageId: string | null; to: string }> {
  const key = process.env["RESEND_API_KEY"];
  if (!key) throw new Error("RESEND_API_KEY niet geconfigureerd");

  const { data: cn, error } = await supabase
    .from("credit_notes")
    .select("*")
    .eq("id", creditNoteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!cn) throw new Error("Creditnota niet gevonden");

  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("id, invoice_number, date, total, client, client_name, client_address, client_vat_number, line_items, vat_note")
    .eq("id", cn.invoice_id)
    .maybeSingle();
  if (invErr) throw new Error(invErr.message);
  if (!inv) throw new Error("Originele factuur niet gevonden");

  const clientId = cn.client || inv.client;
  let toEmail: string | null = null;
  let clientRow: {
    name?: string;
    billing_address?: string | null;
    vat_number?: string | null;
    contact_email?: string | null;
  } | null = null;
  if (clientId) {
    const { data: c } = await supabase
      .from("clients")
      .select("name, billing_address, vat_number, contact_email")
      .eq("id", clientId)
      .maybeSingle();
    clientRow = c;
    toEmail = c?.contact_email?.trim() || null;
  }
  if (!toEmail) throw new Error("Klant heeft geen e-mailadres");

  const invoiceCode = formatInvoiceNumber(inv.invoice_number);
  const absAmount = Math.abs(Number(cn.amount) || 0);
  const isFullCredit = absAmount >= (Number(inv.total) || 0) - 0.004;
  const clientName = cn.client_name || inv.client_name || clientRow?.name || "klant";

  const element = React.createElement(CreditNoteEmail, {
    clientName,
    creditNumber: cn.credit_number,
    invoiceCode,
    date: formatDate(cn.date),
    amountNegative: formatEURCents(-absAmount),
    amountPositive: formatEURCents(absAmount),
    reason: cn.reason,
    isFullCredit,
  });
  const html = await render(element);
  const text = await render(element, { plainText: true });
  const subject = creditNoteEmailSubject(cn.credit_number, invoiceCode);

  const { buildCreditNotePdfBase64 } = await import("@/lib/credit-note-pdf.server");
  const rawItems = Array.isArray(cn.line_items) && cn.line_items.length > 0 ? cn.line_items : inv.line_items;
  const pdfBase64 = await buildCreditNotePdfBase64({
    credit_number: cn.credit_number,
    date: cn.date,
    invoice_number: inv.invoice_number ?? "",
    invoice_date: inv.date,
    invoice_total: Number(inv.total || 0),
    client_name: clientName,
    client_address: cn.client_address || inv.client_address || clientRow?.billing_address || null,
    client_vat_number: cn.client_vat_number || inv.client_vat_number || clientRow?.vat_number || null,
    amount: absAmount,
    reason: cn.reason,
    line_items: Array.isArray(rawItems) ? (rawItems as LineItem[]) : [],
    vat_note: cn.vat_note || inv.vat_note || null,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: "Solyn Global <Factuur@solynglobal.be>",
      to: [toEmail],
      reply_to: "jason@solynglobal.be",
      subject,
      html,
      text,
      attachments: [{ filename: `Creditnota-${cn.credit_number}.pdf`, content: pdfBase64 }],
      tags: [
        { name: "credit_note_id", value: String(cn.id) },
        { name: "invoice_id", value: String(inv.id) },
        { name: "kind", value: "credit_note" },
      ],
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend fout [${res.status}]: ${JSON.stringify(body)}`);

  const messageId = (body as { id?: string })?.id ?? null;
  const now = new Date().toISOString();
  const { recordClientEmail } = await import("@/lib/client-email.server");
  await recordClientEmail(supabase, {
    resendId: messageId,
    to: toEmail,
    subject,
    kind: "creditnota",
    clientId: clientId ? String(clientId) : null,
    refId: String(cn.id),
  });

  const { error: upErr } = await supabase
    .from("credit_notes")
    .update({
      status: "Sent",
      sent_at: now,
      resend_message_id: messageId,
      delivered_at: null,
    })
    .eq("id", cn.id);
  if (upErr) throw new Error(upErr.message);

  return { ok: true, messageId, to: toEmail };
}