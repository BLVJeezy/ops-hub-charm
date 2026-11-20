import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { runAutomationHealth } from "@/lib/automation-health.server";

/** Hourly (cron at :17): checks that every automation really ran, mails me when one stopped. */
export const Route = createFileRoute("/api/public/hooks/automation-health")({
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
          const r = await runAutomationHealth(createClient(url, key));
          return Response.json({ checked: r.checked, stale: r.stale, mailed: r.mailed });
        } catch (e) {
          console.error("[automation-health]", e instanceof Error ? e.message : e);
          return Response.json({ error: "check failed" }, { status: 500 });
        }
      },
    },
  },
});
