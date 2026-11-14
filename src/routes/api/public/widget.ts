import { createFileRoute } from "@tanstack/react-router";

/**
 * Read-only totals for the iPhone home-screen widget (see docs/iphone-widget.md).
 * GET with `Authorization: Bearer <widget key>`. Only the sha256 of the key lives here.
 * Returns status, site names and totals: no customer data.
 */
const KEY_SHA256 = "50d44db212a9139f763386a8664ed53b51cbe486d819f39edefb1e0eb57b806a";

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/widget")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (token.length < 32 || !safeEqual(await sha256Hex(token), KEY_SHA256)) {
          return new Response("unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;
        const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date()).slice(0, 7);
        const [snap, clients, paid] = await Promise.all([
          db.rpc("briefing_snapshot"),
          db.from("clients").select("*").eq("status", "Active"),
          db.from("invoices").select("total").eq("status", "Paid").gte("date", `${month}-01`),
        ]);
        if (snap.error) return Response.json({ error: snap.error.message }, { status: 500 });
        const { widgetPayload } = await import("@/lib/widget");
        const paidThisMonth = (paid.data ?? []).reduce((a: number, r: { total: number }) => a + Number(r.total || 0), 0);
        return Response.json(widgetPayload(snap.data, clients.data ?? [], paidThisMonth), {
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
