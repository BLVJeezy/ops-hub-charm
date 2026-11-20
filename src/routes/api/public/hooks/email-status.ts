import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { syncEmailStatus } from "@/lib/client-email.server";

/** Every 10 minutes (cron): asks Resend whether recent client mails were delivered, bounced or opened. */
export const Route = createFileRoute("/api/public/hooks/email-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env.SUPABASE_URL,
          key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) return Response.json({ error: "server misconfigured" }, { status: 500 });
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ") || auth.slice(7) !== key)
          return new Response("unauthorized", { status: 401 });
        try {
          return Response.json(await syncEmailStatus(createClient(url, key)));
        } catch (e) {
          console.error("[email-status]", e instanceof Error ? e.message : e);
          return Response.json({ error: "sync failed" }, { status: 500 });
        }
      },
    },
  },
});
