import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The noon-scan film of a day, for the /briefing player. Served from the Hub's storage when it is there
 * (a signed link); otherwise from the private GitHub repo
 * (daily_briefings.video_path = "github:<owner>/<repo>@<branch>:<path>"), read with the GITHUB_TOKEN secret
 * (fine-grained, read-only "Contents" on that one repo). Staff only.
 */
export const getBriefingVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { day: string }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input?.day ?? "")) throw new Error("bad day");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Geen toegang");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row } = await (supabase as any).from("daily_briefings").select("video_path").eq("day", data.day).maybeSingle();
    // 1. The Hub's own storage (bucket "briefings", filled by /api/public/hooks/briefing-video): no token needed.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (supabaseAdmin as any).storage.from("briefings");
    const signed = await store.createSignedUrl(`${data.day}/noon-scan.mp4`, 60 * 60 * 6);
    if (signed.data?.signedUrl) return { ok: true as const, url: signed.data.signedUrl as string };

    // 2. Fallback: the film in the private GitHub repo, read with the GITHUB_TOKEN secret.
    const m = /^github:([\w.-]+\/[\w.-]+)@([\w./-]+):(.+)$/.exec(row?.video_path ?? "");
    if (!m) return { ok: false as const, reason: "no-video" };
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { ok: false as const, reason: "no-token" };
    const res = await fetch(`https://api.github.com/repos/${m[1]}/contents/${m[3]}?ref=${encodeURIComponent(m[2])}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw", "User-Agent": "solyn-hub-os" },
    });
    if (!res.ok) return { ok: false as const, reason: `github-${res.status}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { ok: true as const, mime: "video/mp4", base64: btoa(bin) };
  });
