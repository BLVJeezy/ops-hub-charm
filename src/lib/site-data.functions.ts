import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseSitemap } from "@/lib/site-stats";

const MAX_URLS = 500;

async function getText(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "SolynStatusHub/1.0" } });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Public pages of a monitored site, read from its sitemap(s). Team members only. */
export const getSitePages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { siteId: string }) => input)
  .handler(async ({ data, context }) => {
    // RLS: only team members can read monitored_sites.
    const { data: site, error } = await (context.supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from("monitored_sites")
      .select("url")
      .eq("id", data.siteId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!site) throw new Error("Site not found");

    const origin = new URL(site.url).origin;
    const candidates = new Set<string>([`${origin}/sitemap.xml`]);
    const robots = await getText(`${origin}/robots.txt`);
    for (const m of robots?.matchAll(/^\s*sitemap:\s*(\S+)/gim) ?? []) candidates.add(m[1]);

    const urls = new Set<string>();
    const seen = new Set<string>();
    const queue = [...candidates];
    let found: string | null = null;
    while (queue.length && urls.size < MAX_URLS && seen.size < 20) {
      const sm = queue.shift()!;
      if (seen.has(sm)) continue;
      seen.add(sm);
      const xml = await getText(sm);
      if (!xml) continue;
      found ??= sm;
      const parsed = parseSitemap(xml);
      parsed.urls.forEach((u) => urls.size < MAX_URLS && urls.add(u));
      queue.push(...parsed.sitemaps);
    }
    return { sitemap: found, pages: [...urls].sort(), truncated: urls.size >= MAX_URLS };
  });
