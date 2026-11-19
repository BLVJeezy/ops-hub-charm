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
    const { data: row } = await (supabase as any)
      .from("daily_briefings")
      .select("video_path")
      .eq("day", data.day)
      .maybeSingle();
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
    const res = await fetch(
      `https://api.github.com/repos/${m[1]}/contents/${m[3]}?ref=${encodeURIComponent(m[2])}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.raw",
          "User-Agent": "solyn-hub-os",
        },
      },
    );
    if (!res.ok) return { ok: false as const, reason: `github-${res.status}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000)
      bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { ok: true as const, mime: "video/mp4", base64: btoa(bin) };
  });

/**
 * The weekly "Solyn Global progress" films (bucket "briefings", folder progress/, filled by the same hook with kind=progress).
 * Returns the days there are films for, and a signed link plus chapters for the asked day (default: the newest). Staff only.
 */
export const getProgressFilm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { day?: string }) => {
    if (input?.day && !/^\d{4}-\d{2}-\d{2}$/.test(input.day)) throw new Error("bad day");
    return input ?? {};
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Geen toegang");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (supabaseAdmin as any).storage.from("briefings");
    const { data: files } = await store.list("progress", {
      limit: 200,
      sortBy: { column: "name", order: "desc" },
    });
    const days: string[] = ((files ?? []) as { name: string }[])
      .map((f) => /^(\d{4}-\d{2}-\d{2})\.mp4$/.exec(f.name)?.[1])
      .filter((d): d is string => !!d)
      .sort()
      .reverse();
    const day = data.day && days.includes(data.day) ? data.day : days[0];
    if (!day) return { days, day: null, url: null, chapters: [] as { t: number; label: string }[] };
    const signed = await store.createSignedUrl(`progress/${day}.mp4`, 60 * 60 * 6);
    let chapters: { t: number; label: string }[] = [];
    try {
      const file = await store.download(`progress/${day}.chapters`);
      if (file.data) chapters = JSON.parse(await file.data.text());
    } catch {
      /* a film without chapters still plays */
    }
    return { days, day, url: (signed.data?.signedUrl as string | undefined) ?? null, chapters };
  });

/**
 * A client's monthly report films (bucket "briefings", folder reports/<client id>/, filled by the hook with kind=client).
 * Returns the days there are films for and a signed link for the asked one (default: the newest). Staff only.
 */
export const getClientReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientId: string; day?: string }) => {
    if (!/^[0-9a-f-]{36}$/.test(input?.clientId ?? "")) throw new Error("bad client");
    if (input.day && !/^\d{4}-\d{2}-\d{2}$/.test(input.day)) throw new Error("bad day");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Geen toegang");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (supabaseAdmin as any).storage.from("briefings");
    const { data: files } = await store.list(`reports/${data.clientId}`, {
      limit: 100,
      sortBy: { column: "name", order: "desc" },
    });
    const days: string[] = ((files ?? []) as { name: string }[])
      .map((f) => /^(\d{4}-\d{2}-\d{2})\.mp4$/.exec(f.name)?.[1])
      .filter((d): d is string => !!d)
      .sort()
      .reverse();
    const day = data.day && days.includes(data.day) ? data.day : days[0];
    if (!day) return { days, day: null, url: null, download: null };
    const path = `reports/${data.clientId}/${day}.mp4`;
    const [play, save] = await Promise.all([
      store.createSignedUrl(path, 60 * 60 * 6),
      store.createSignedUrl(path, 60 * 60 * 6, { download: `maandrapport-${day}.mp4` }),
    ]);
    return {
      days,
      day,
      url: (play.data?.signedUrl as string | undefined) ?? null,
      download: (save.data?.signedUrl as string | undefined) ?? null,
    };
  });
