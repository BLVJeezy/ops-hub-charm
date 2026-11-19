import { createFileRoute } from "@tanstack/react-router";
import { clockLabel, workedSeconds } from "@/lib/request-timer";
import { clockPng } from "@/lib/timer-png";

/**
 * The clock image in the "we zijn begonnen" mail. Fetched again every time the mail is opened,
 * so it shows the time worked on that request at that moment. It shows a number and nothing else.
 */
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const png = (bytes: Uint8Array, status = 200) =>
  new Response(bytes as unknown as BodyInit, {
    status,
    headers: {
      "content-type": "image/png",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      expires: "0",
      pragma: "no-cache",
    },
  });

export const Route = createFileRoute("/api/public/request-timer")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id") ?? "";
        if (!ID.test(id)) return png(clockPng("0:00:00", { ink: "#9AA0A6" }), 404);
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabaseAdmin as any)
            .from("client_requests")
            .select("status, worked_seconds, run_started_at")
            .eq("id", id)
            .maybeSingle();
          if (!data) return png(clockPng("0:00:00", { ink: "#9AA0A6" }), 404);
          const ink = data.run_started_at
            ? "#1B222C"
            : data.status === "klaar"
              ? "#1E7A4F"
              : "#8A8F98";
          return png(clockPng(clockLabel(workedSeconds(data)), { ink }));
        } catch (e) {
          console.error("[request-timer]", e instanceof Error ? e.message : e);
          return png(clockPng("0:00:00", { ink: "#9AA0A6" }), 500);
        }
      },
    },
  },
});
