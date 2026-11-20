import { createFileRoute } from "@tanstack/react-router";

/**
 * Copies a generated image (planet artwork for the Brain page) from the generator's CDN into the Hub's own
 * public storage bucket "planets", so the page never depends on an external link.
 *
 * POST /api/public/hooks/asset-import   body: { "name": "sun.png", "url": "https://…cloudfront.net/….png" }
 * Authorization: Bearer <shared backup token>  (only its sha256 lives here)
 */
const KEY_SHA256 = "07cc86d4b801acd9882c238a7bc712c243469ec8f557382b52893a702810a7b4";
const ALLOWED_HOST = /(^|\.)cloudfront\.net$/;
const MAX_BYTES = 8 * 1024 * 1024;

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

export const Route = createFileRoute("/api/public/hooks/asset-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (token.length < 32 || !safeEqual(await sha256Hex(token), KEY_SHA256))
          return new Response("unauthorized", { status: 401 });

        const body = (await request.json().catch(() => null)) as {
          name?: string;
          url?: string;
        } | null;
        const name = body?.name ?? "";
        if (!/^[a-z0-9-]{1,60}\.png$/.test(name))
          return Response.json({ error: "bad name" }, { status: 400 });
        let src: URL;
        try {
          src = new URL(body?.url ?? "");
        } catch {
          return Response.json({ error: "bad url" }, { status: 400 });
        }
        if (src.protocol !== "https:" || !ALLOWED_HOST.test(src.hostname))
          return Response.json({ error: "host not allowed" }, { status: 400 });

        const res = await fetch(src.toString());
        if (!res.ok) return Response.json({ error: `source ${res.status}` }, { status: 502 });
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length < 1000 || bytes.length > MAX_BYTES)
          return Response.json({ error: "bad size" }, { status: 400 });
        if (!(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47))
          return Response.json({ error: "not a png" }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const up = await (supabaseAdmin as any).storage.from("planets").upload(name, bytes, {
          contentType: "image/png",
          upsert: true,
          cacheControl: "31536000",
        });
        if (up.error) return Response.json({ error: up.error.message }, { status: 500 });
        return Response.json({ ok: true, name, bytes: bytes.length });
      },
    },
  },
});
