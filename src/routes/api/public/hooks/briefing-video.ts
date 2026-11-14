import { createFileRoute } from "@tanstack/react-router";

/**
 * Receives the rendered noon-scan film and keeps it in the Hub's own storage (bucket "briefings"),
 * so the /briefing player needs no GitHub token. Called by the GitHub Action in mission-control-hub
 * after a film is pushed to its noon-scan branch.
 *
 * POST /api/public/hooks/briefing-video?day=YYYY-MM-DD  body: the mp4
 * Authorization: Bearer <shared backup token>  (only its sha256 lives here)
 */
const KEY_SHA256 = "07cc86d4b801acd9882c238a7bc712c243469ec8f557382b52893a702810a7b4";
const MAX_BYTES = 60 * 1024 * 1024;

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

export const Route = createFileRoute("/api/public/hooks/briefing-video")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (token.length < 32 || !safeEqual(await sha256Hex(token), KEY_SHA256)) {
          return new Response("unauthorized", { status: 401 });
        }
        const day = new URL(request.url).searchParams.get("day") ?? "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return Response.json({ error: "bad day" }, { status: 400 });

        const body = new Uint8Array(await request.arrayBuffer());
        if (body.length < 1000 || body.length > MAX_BYTES) return Response.json({ error: "bad size" }, { status: 400 });
        // mp4 files carry "ftyp" at byte 4
        if (String.fromCharCode(...body.subarray(4, 8)) !== "ftyp") return Response.json({ error: "not an mp4" }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;
        const path = `${day}/noon-scan.mp4`;
        const up = await db.storage.from("briefings").upload(path, body, { contentType: "video/mp4", upsert: true });
        if (up.error) return Response.json({ error: up.error.message }, { status: 500 });

        // Point the day at the stored film (the row may not exist yet if the render ran early: then the player finds it by day).
        await db.from("daily_briefings").update({ video_path: `storage:briefings/${path}` }).eq("day", day);
        return Response.json({ ok: true, day, bytes: body.length });
      },
    },
  },
});
