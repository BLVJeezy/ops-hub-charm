import { createFileRoute } from "@tanstack/react-router";
import { checkFiles, safeName } from "@/lib/booking";
import {
  checkRequest,
  estimate,
  isOpen,
  kindLabel,
  LIMITS,
  PAGE_RATE,
  urgencyLabel,
  type RequestInput,
  type Status,
} from "@/lib/client-requests";

/**
 * The client's request page (/aanvraag/<token>) talks to this.
 * The token is the only key: it shows that one client's name and their own requests, nothing else.
 */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
const TOKEN = /^[a-f0-9]{36}$/;
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

async function mail(to: string, subject: string, html: string, text: string, replyTo?: string) {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function clientFor(db: any, token: string | null) {
  if (!token || !TOKEN.test(token)) return null;
  const { data } = await db
    .from("clients")
    .select("id, name")
    .eq("request_token", token)
    .maybeSingle();
  return data as { id: string; name: string } | null;
}

export const Route = createFileRoute("/api/public/request")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => new Response(null, { status: 204, headers: cors(request) }),
      GET: async ({ request }) => {
        const json = jsonWith(cors(request));
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const client = await clientFor(
            supabaseAdmin,
            new URL(request.url).searchParams.get("token"),
          );
          if (!client)
            return json(
              { error: "Deze link werkt niet (meer). Vraag een nieuwe link aan Solyn Global." },
              404,
            );
          const { data } = await (supabaseAdmin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
            .from("client_requests")
            .select(
              "id, title, kind, pages, urgency, status, estimate_eur, wished_date, created_at",
            )
            .eq("client_id", client.id)
            .order("created_at", { ascending: false })
            .limit(50);
          return json({
            client: client.name,
            pageRate: PAGE_RATE,
            requests: data ?? [],
            // the client's own contact details, so the booking form starts filled in
            contact: {
              name: client.contact_name ?? "",
              email: client.contact_email ?? "",
              phone: client.contact_phone ?? "",
            },
          });
        } catch (e) {
          console.error("[request] list failed", e instanceof Error ? e.message : e);
          return json({ error: "Even niet bereikbaar. Probeer het straks opnieuw." }, 500);
        }
      },
      POST: async ({ request }) => {
        const json = jsonWith(cors(request));
        let raw: Record<string, string>,
          files: File[] = [];
        try {
          const form = await request.formData();
          raw = Object.fromEntries(
            [...form.entries()].filter(([, v]) => typeof v === "string"),
          ) as Record<string, string>;
          files = form
            .getAll("files")
            .filter((v): v is File => typeof v !== "string" && v.size > 0);
        } catch {
          return json({ error: "Ongeldige aanvraag." }, 400);
        }
        if (raw.website) return json({ ok: true }); // hidden field: only robots fill it in
        const input: Partial<RequestInput> = {
          title: raw.title?.trim(),
          details: raw.details?.trim() || undefined,
          kind: raw.kind as RequestInput["kind"],
          pages: raw.pages ? Number(raw.pages) : null,
          urgency: raw.urgency as RequestInput["urgency"],
          wished_date: raw.wished_date || null,
          contact_name: raw.contact_name?.trim().slice(0, 80) || undefined,
          contact_email: raw.contact_email?.trim().slice(0, 120) || undefined,
        };
        const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
        const bad = checkRequest(input, today);
        if (bad) return json({ error: bad }, 400);
        const fileError = checkFiles(
          files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
        );
        if (fileError) return json({ error: fileError }, 400);
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = supabaseAdmin as any;
          const client = await clientFor(db, raw.token ?? null);
          if (!client)
            return json(
              { error: "Deze link werkt niet (meer). Vraag een nieuwe link aan Solyn Global." },
              404,
            );
          const { data: mine } = await db
            .from("client_requests")
            .select("status, created_at")
            .eq("client_id", client.id)
            .order("created_at", { ascending: false })
            .limit(60);
          const rows = (mine ?? []) as { status: Status; created_at: string }[];
          if (rows.filter((r) => isOpen(r.status)).length >= LIMITS.openPerClient)
            return json(
              {
                error: `Er staan al ${LIMITS.openPerClient} aanvragen open. We werken die eerst af.`,
              },
              429,
            );
          if (rows.filter((r) => Date.now() - Date.parse(r.created_at) < 3600_000).length >= 8)
            return json(
              { error: "Veel aanvragen op korte tijd. Probeer het over een uur opnieuw." },
              429,
            );

          const price = estimate(input.kind!, input.pages);
          const { data: row, error } = await db
            .from("client_requests")
            .insert({
              client_id: client.id,
              title: input.title,
              details: input.details ?? null,
              kind: input.kind,
              pages: input.kind === "nieuwe-pagina" ? input.pages || 1 : null,
              urgency: input.urgency,
              wished_date: input.wished_date,
              contact_name: input.contact_name ?? null,
              contact_email: input.contact_email ?? null,
              estimate_eur: price,
            })
            .select("id")
            .single();
          if (error) {
            console.error("[request] insert failed", error.message);
            return json({ error: "Versturen lukte niet. Probeer het opnieuw." }, 500);
          }

          const stored: { name: string; path: string; size: number; type: string }[] = [];
          for (const [i, f] of files.entries()) {
            const path = `requests/${row.id}/${i + 1}-${safeName(f.name)}`;
            const up = await supabaseAdmin.storage
              .from("booking-files")
              .upload(path, f, { contentType: f.type, upsert: false });
            if (up.error) console.error("[request] file not stored", up.error.message);
            else stored.push({ name: f.name.slice(0, 120), path, size: f.size, type: f.type });
          }
          if (stored.length)
            await db.from("client_requests").update({ attachments: stored }).eq("id", row.id);

          const owner = process.env.ALERT_EMAIL_TO || "jason@solynglobal.be";
          const hub = `${(process.env.HUB_PUBLIC_URL || "https://solyn22.lovable.app").replace(/\/$/, "")}/aanvragen`;
          const lines: [string, string][] = [
            ["Klant", client.name],
            [
              "Soort",
              kindLabel(input.kind!) +
                (input.kind === "nieuwe-pagina"
                  ? ` (${input.pages || 1} × €${PAGE_RATE} = €${price})`
                  : ""),
            ],
            ["Hoe dringend", urgencyLabel(input.urgency!)],
            ...(input.wished_date
              ? [["Gewenst tegen", input.wished_date] as [string, string]]
              : []),
            ...(input.contact_name || input.contact_email
              ? [
                  [
                    "Van",
                    [input.contact_name, input.contact_email].filter(Boolean).join(" · "),
                  ] as [string, string],
                ]
              : []),
            ...(files.length
              ? [["Bestanden", `${stored.length} van ${files.length} bewaard`] as [string, string]]
              : []),
          ];
          const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#111"><h2 style="margin:0 0 4px">Nieuwe aanvraag van ${esc(client.name)}</h2><p style="margin:0 0 16px;font-size:17px">${esc(input.title!)}</p><table style="border-collapse:collapse;font-size:14px">${lines.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#666">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>${input.details ? `<p style="white-space:pre-wrap;background:#f5f5f5;border-radius:10px;padding:12px;font-size:14px">${esc(input.details)}</p>` : ""}<p><a href="${hub}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none">Open Aanvragen</a></p></div>`;
          const text = `Nieuwe aanvraag van ${client.name}\n${input.title}\n\n${lines.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${input.details ?? ""}\n\n${hub}`;
          await mail(
            owner,
            `Nieuwe aanvraag: ${client.name} – ${input.title}`,
            html,
            text,
            input.contact_email,
          );
          return json({ ok: true, estimate: price });
        } catch (e) {
          console.error("[request] failed", e instanceof Error ? e.message : e);
          return json({ error: "Versturen lukte niet. Probeer het opnieuw." }, 500);
        }
      },
    },
  },
});
